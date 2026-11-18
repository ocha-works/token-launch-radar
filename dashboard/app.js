// Launch Radar's dashboard. Reads window.RADAR (written beside dashboard/ by main.ts) and renders
// the ranked pre-token board, a live-token reference table, a methodology panel that shows the
// calibration the values came from, and a per-protocol detail drawer with the model's arithmetic
// and the farm plan. No network: every byte on the page is in data.js.
(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA) return;
  var app = document.getElementById('app');
  var C = DATA.constants;
  var state = { q: '', category: 'all', chain: 'all', floor: 0, watchOnly: false, tab: 'board', sort: 'rank', dir: 1, selected: null };

  /* ---------- formatting ---------- */
  var usd0 = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return usd0.format(n);
  }
  function fmtPct(n) { return n === null || n === undefined || !isFinite(n) ? 'n/a' : (n > 0 ? '+' : '') + n.toFixed(1) + '%'; }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + ' yrs';
    return Math.max(0, Math.round(days)) + ' days';
  }
  function fmtMult(n) { return 'x' + Number(n).toFixed(3); }

  /* The page recomputes a row's implied value from the snapshot figures and the model's stated
     constants, the same arithmetic lib/model.ts ran: if the two ever disagree, the detail drawer
     says so instead of hiding it. */
  function recomputeImplied(row) {
    var growth = Math.min(C.growth_cap_pct, Math.max(C.growth_floor_pct, row.change_7d === null ? 0 : row.change_7d));
    var growthMult = 1 + (growth / 100) * C.growth_weight;
    var age = row.age_days === null ? C.unknown_age_days : row.age_days;
    var maturity = C.maturity_floor + (Math.min(Math.max(age, 0), C.maturity_days) / C.maturity_days) * C.maturity_range;
    var breadth = 1 + C.breadth_per_chain * Math.min(Math.max(row.chains.length - 1, 0), C.breadth_max_extra);
    return Math.max(1, Math.round(row.tvl_usd * row.model.category_multiple * growthMult * maturity * breadth));
  }

  /* ---------- tiny DOM builder ---------- */
  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (k === 'class') node.className = attrs[k];
      else if (k === 'text') node.textContent = attrs[k];
      else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
      else if (attrs[k] !== null && attrs[k] !== undefined && attrs[k] !== false) node.setAttribute(k, attrs[k]);
    });
    for (var i = 2; i < arguments.length; i++) {
      var child = arguments[i];
      if (child === null || child === undefined) continue;
      if (Array.isArray(child)) child.forEach(function (c) { if (c) node.appendChild(c); });
      else node.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
    }
    return node;
  }

  /* ---------- hash state: a view is a link, and the screenshots are taken from links ---------- */
  function readHash() {
    var params = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    if (params.get('q')) state.q = params.get('q');
    if (params.get('category')) state.category = params.get('category');
    if (params.get('chain')) state.chain = params.get('chain');
    if (params.get('floor')) state.floor = Number(params.get('floor')) || 0;
    if (params.get('watch') === '1') state.watchOnly = true;
    if (params.get('tab') === 'live') state.tab = 'live';
    if (params.get('p')) state.selected = params.get('p');
  }
  function writeHash() {
    var params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    if (state.category !== 'all') params.set('category', state.category);
    if (state.chain !== 'all') params.set('chain', state.chain);
    if (state.floor > 0) params.set('floor', String(state.floor));
    if (state.watchOnly) params.set('watch', '1');
    if (state.tab === 'live') params.set('tab', 'live');
    if (state.selected) params.set('p', state.selected);
    var next = params.toString();
    window.history.replaceState(null, '', next ? '#' + next : window.location.pathname + window.location.search);
  }

  /* ---------- filtering and sorting ---------- */
  function visibleRows() {
    var q = state.q.trim().toLowerCase();
    return DATA.rows.filter(function (r) {
      if (state.category !== 'all' && (r.category || 'Uncategorised') !== state.category) return false;
      if (state.chain !== 'all' && r.chains.indexOf(state.chain) < 0) return false;
      if (state.floor > 0 && r.tvl_usd < state.floor) return false;
      if (state.watchOnly && !r.watchlist) return false;
      if (!q) return true;
      return [r.name, r.slug, r.category || '', r.chains.join(' ')].join(' ').toLowerCase().indexOf(q) >= 0;
    });
  }
  function sortedRows(list) {
    var key = state.sort, dir = state.dir;
    return list.slice().sort(function (a, b) {
      var av, bv;
      if (key === 'name') { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
      else if (key === 'tvl') { av = a.tvl_usd; bv = b.tvl_usd; }
      else if (key === 'growth') { av = a.change_7d === null ? -Infinity : a.change_7d; bv = b.change_7d === null ? -Infinity : b.change_7d; }
      else if (key === 'age') { av = a.age_days === null ? Infinity : a.age_days; bv = b.age_days === null ? Infinity : b.age_days; }
      else if (key === 'implied') { av = a.implied_value_usd; bv = b.implied_value_usd; }
      else { av = a.rank; bv = b.rank; }
      if (av < bv) return -dir;
      if (av > bv) return dir;
      return a.rank - b.rank;
    });
  }
  function clearFilters() {
    state.q = ''; state.category = 'all'; state.chain = 'all'; state.floor = 0; state.watchOnly = false;
    writeHash(); render();
  }

  /* ---------- page sections ---------- */
  function header() {
    return el('header', { class: 'top' },
      el('div', { class: 'brand' },
        el('span', { class: 'mark', 'aria-hidden': 'true' }),
        el('div', null,
          el('span', { class: 'brand-name', text: 'Launch Radar' }),
          el('span', { class: 'brand-sub', text: 'Pre-token protocols, ranked by implied value' })
        )
      ),
      el('div', { class: 'top-meta' },
        el('span', null, 'snapshot ', el('b', { text: DATA.as_of })),
        el('span', null, 'model ', el('b', { text: DATA.model_version })),
        el('span', null, 'source ', el('b', { text: 'DefiLlama index' }))
      )
    );
  }

  function lede() {
    return el('section', { class: 'lede' },
      el('div', null,
        el('h1', null, DATA.watchlist_size + ' watchlist protocols and ' + DATA.early_size + ' early finds, ', el('span', { class: 'hl', text: 'one ranking' })),
        el('p', null,
          'Every protocol here ', el('b', { text: 'records no token' }), ' in the snapshot. Each is priced by what the market already pays for comparable protocols that do trade — its category\u2019s market-cap-to-TVL multiple, calibrated on this snapshot — then adjusted for seven-day growth, for how long it has run tokenless, and for the chains it covers. ',
          el('b', { text: 'Implied value is this board\u2019s claim, not a price and not a promise of a launch.' })
        )
      ),
      el('div', { class: 'facts' },
        el('div', { class: 'fact' }, el('span', { text: 'Watchlist covered' }), el('b', null, el('em', { text: DATA.watchlist_size + ' / ' + DATA.watchlist_size }))),
        el('div', { class: 'fact' }, el('span', { text: 'Rows ranked' }), el('b', { text: String(DATA.board_size) })),
        el('div', { class: 'fact' }, el('span', { text: 'Early finds below the floor' }), el('b', { text: String(DATA.early_size) })),
        el('div', { class: 'fact' }, el('span', { text: 'Global multiple (median)' }), el('b', { text: fmtMult(DATA.global_multiple) }))
      )
    );
  }

  function controls() {
    var categories = Array.from(new Set(DATA.rows.map(function (r) { return r.category || 'Uncategorised'; }))).sort();
    var chains = Array.from(new Set(DATA.rows.reduce(function (acc, r) { return acc.concat(r.chains); }, []))).sort();
    var search = el('input', { type: 'search', id: 'q', placeholder: 'Name, category or chain', value: state.q, 'aria-label': 'Search the board' });
    search.addEventListener('input', function () { state.q = search.value; writeHash(); renderBoardOnly(); });
    var catSelect = el('select', { id: 'category', 'aria-label': 'Filter by category' },
      el('option', { value: 'all', text: 'All categories' }),
      categories.map(function (c) { return el('option', { value: c, text: c, selected: c === state.category ? 'selected' : null }); })
    );
    catSelect.addEventListener('change', function () { state.category = catSelect.value; writeHash(); render(); });
    var chainSelect = el('select', { id: 'chain', 'aria-label': 'Filter by chain' },
      el('option', { value: 'all', text: 'All chains' }),
      chains.map(function (c) { return el('option', { value: c, text: c, selected: c === state.chain ? 'selected' : null }); })
    );
    chainSelect.addEventListener('change', function () { state.chain = chainSelect.value; writeHash(); render(); });
    var floorSelect = el('select', { id: 'floor', 'aria-label': 'Filter by minimum TVL' },
      [0, 1e7, 25e6, 5e7, 1e8, 5e8].map(function (v) {
        return el('option', { value: String(v), text: v === 0 ? 'Any TVL' : fmtUsd(v) + '+', selected: state.floor === v ? 'selected' : null });
      })
    );
    floorSelect.addEventListener('change', function () { state.floor = Number(floorSelect.value) || 0; writeHash(); render(); });
    var watch = el('input', { type: 'checkbox', id: 'watch', checked: state.watchOnly ? 'checked' : null });
    watch.addEventListener('change', function () { state.watchOnly = watch.checked; writeHash(); render(); });
    var boardTab = el('button', { type: 'button', 'aria-pressed': state.tab === 'board' ? 'true' : 'false', text: 'Pre-token board', onclick: function () { state.tab = 'board'; writeHash(); render(); } });
    var liveTab = el('button', { type: 'button', 'aria-pressed': state.tab === 'live' ? 'true' : 'false', text: 'Live tokens', onclick: function () { state.tab = 'live'; writeHash(); render(); } });
    return el('div', { class: 'controls' },
      el('div', { class: 'field' }, el('label', { for: 'q', text: 'Search' }), search),
      el('div', { class: 'field' }, el('label', { for: 'category', text: 'Category' }), catSelect),
      el('div', { class: 'field' }, el('label', { for: 'chain', text: 'Chain' }), chainSelect),
      el('div', { class: 'field' }, el('label', { for: 'floor', text: 'TVL floor' }), floorSelect),
      el('div', { class: 'field check' }, watch, el('label', { class: 'lab', for: 'watch', text: 'Watchlist only' })),
      el('div', { class: 'field' }, el('span', { class: 'lab', text: 'View' }), el('div', { class: 'tabs' }, boardTab, liveTab)),
      el('span', { class: 'count', id: 'row-count', text: '' })
    );
  }

  function sortHeader(key, label) {
    var arrow = state.sort === key ? (state.dir > 0 ? ' \u25B2' : ' \u25BC') : '';
    return el('th', { scope: 'col' },
      el('button', {
        type: 'button', onclick: function () {
          if (state.sort === key) state.dir = -state.dir;
          else { state.sort = key; state.dir = key === 'name' || key === 'rank' ? 1 : -1; }
          renderBoardOnly();
        }
      }, label + arrow)
    );
  }

  function boardPanel() {
    var list = sortedRows(visibleRows());
    var panel = el('div', { class: 'panel', id: 'board-panel' });
    if (list.length === 0) {
      panel.appendChild(el('div', { class: 'empty' },
        el('h2', { text: 'No protocol matches that filter' }),
        el('p', { text: 'Loosen the search, the chain or the TVL floor to see the board again.' }),
        el('button', { class: 'button primary', type: 'button', text: 'Clear all filters', onclick: clearFilters })
      ));
      return panel;
    }
    var max = Math.max.apply(null, list.map(function (r) { return r.implied_value_usd; }));
    var tbody = el('tbody');
    list.forEach(function (r) {
      var gClass = r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg';
      tbody.appendChild(el('tr', {
        'data-selected': state.selected === r.slug ? 'true' : 'false', tabindex: '0',
        onclick: function () { openDetail(r.slug); },
        onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(r.slug); } }
      },
        el('td', { class: 'rank', text: String(r.rank) }),
        el('td', null, el('div', { class: 'name' },
          el('b', { text: r.name }),
          el('span', { class: 'sub', text: (r.category || 'Uncategorised') + ' \u00B7 ' + (r.chains.length ? r.chains.slice(0, 3).join(', ') + (r.chains.length > 3 ? ' +' + (r.chains.length - 3) : '') : 'no chain recorded') })
        )),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + gClass, text: fmtPct(r.change_7d) }),
        el('td', { class: 'num', text: fmtAge(r.age_days) }),
        el('td', null, el('div', { class: 'implied' },
          el('div', { class: 'bar', 'aria-hidden': 'true' }, el('i', { style: 'width:' + Math.max(3, Math.round((r.implied_value_usd / max) * 100)) + '%' })),
          el('span', { class: 'num', text: fmtUsd(r.implied_value_usd) })
        )),
        el('td', null, r.watchlist
          ? el('span', { class: 'badge watch', text: 'watchlist' })
          : el('span', { class: 'badge early', text: 'early find' }))
      ));
    });
    panel.appendChild(el('div', { class: 'table-wrap' },
      el('table', null,
        el('caption', { id: 'board-title', text: 'Pre-token protocols ranked by implied value. Select any row for its model arithmetic and its farm plan.' }),
        el('thead', null, el('tr', null,
          sortHeader('rank', 'Rank'), sortHeader('name', 'Protocol'), sortHeader('tvl', 'TVL'),
          sortHeader('growth', '7d'), sortHeader('age', 'Tokenless age'), sortHeader('implied', 'Implied value'),
          el('th', { scope: 'col', text: 'Radar' })
        )),
        tbody
      )
    ));
    return panel;
  }

  function livePanel() {
    var tbody = el('tbody');
    DATA.live.forEach(function (r) {
      tbody.appendChild(el('tr', null,
        el('td', null, el('div', { class: 'name' },
          el('b', { text: r.name }),
          el('span', { class: 'sub', text: (r.category || 'Uncategorised') + ' \u00B7 ' + (r.chains.length ? r.chains.slice(0, 2).join(', ') : 'no chain recorded') })
        )),
        el('td', null, el('span', { class: 'badge live', text: r.symbol || 'live' })),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num', text: fmtUsd(r.mcap_usd) }),
        el('td', { class: 'num', text: r.mcap_to_tvl === null ? 'n/a' : fmtMult(r.mcap_to_tvl) }),
        el('td', { class: 'num ' + (r.change_7d !== null && r.change_7d >= 0 ? 'pos' : 'neg'), text: fmtPct(r.change_7d) })
      ));
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { text: 'Already trading: these protocols have a token, so their market cap is a market fact, not a model output. They are never ranked on the pre-token board — they are the calibration set its multiples come from.' }),
          el('thead', null, el('tr', null,
            el('th', { scope: 'col', text: 'Protocol' }), el('th', { scope: 'col', text: 'Token' }),
            el('th', { scope: 'col', text: 'TVL' }), el('th', { scope: 'col', text: 'Market cap' }),
            el('th', { scope: 'col', text: 'Mcap / TVL' }), el('th', { scope: 'col', text: '7d' })
          )),
          tbody
        )
      )
    );
  }

  function methodPanel() {
    var multRows = DATA.category_multiples.slice(0, 14).map(function (c) {
      return el('tr', null,
        el('td', { text: c.category }),
        el('td', { class: 'num', text: String(c.sample_size) }),
        el('td', { class: 'num', text: fmtMult(c.median_ratio) }),
        el('td', { class: 'num', text: fmtMult(c.multiple) })
      );
    });
    return el('section', { class: 'panel method' },
      el('h2', { text: 'How the implied values are made' }),
      el('p', null,
        'No name is scored by hand. The model reads only the snapshot\u2019s figures — TVL, seven-day change, listing date, category, chains — and every row is the same five steps:'
      ),
      el('ol', null,
        el('li', null, el('b', { text: 'Calibrate. ' }), 'For each protocol in the snapshot whose token already trades, take market cap \u00F7 TVL, capped at \u00D7' + C.ratio_cap + ' — past that the denominator is broken, not the evidence. A category\u2019s multiple is its median capped ratio, shrunk toward the global median (' + fmtMult(DATA.global_multiple) + ' over ' + DATA.global_sample + ' protocols) by sample size, so a two-member category borrows the market\u2019s evidence instead of inheriting its outliers.'),
        el('li', null, el('b', { text: 'Base. ' }), 'base = TVL \u00D7 the protocol\u2019s category multiple: what the market pays per dollar of TVL for this kind of protocol.'),
        el('li', null, el('b', { text: 'Momentum. ' }), 'Seven-day TVL change, clamped to ' + C.growth_floor_pct + '%\u2026+' + C.growth_cap_pct + '%, moves value by half its size: growth \u00D7 ' + C.growth_weight + '. One wild week cannot mint a valuation.'),
        el('li', null, el('b', { text: 'Maturity. ' }), 'Running tokenless is evidence. The multiplier rises from ' + C.maturity_floor + ' to ' + (C.maturity_floor + C.maturity_range).toFixed(2) + ' over ' + C.maturity_days + ' days since listing; an unrecorded listing date counts as ' + C.unknown_age_days + ' days.'),
        el('li', null, el('b', { text: 'Breadth. ' }), 'Each chain past the first, up to ' + C.breadth_max_extra + ', adds ' + Math.round(C.breadth_per_chain * 100) + '%: distribution a token would inherit on day one.')
      ),
      el('div', { class: 'formula', text: 'implied = round( TVL \u00D7 category_multiple \u00D7 (1 + clamp(7d%) \u00D7 ' + C.growth_weight + ') \u00D7 maturity(age) \u00D7 (1 + ' + C.breadth_per_chain + ' \u00D7 extra_chains) )' }),
      el('p', null,
        'Coverage follows the same discipline. The watchlist — every protocol at or above ' + fmtUsd(DATA.floor_usd) + ' of TVL that records no token and is not a wrapped, staked or bridged product — is ranked in full. Below that floor the radar applies the same screen and takes the largest screened pre-token protocols as early finds. A protocol that records a token is never ranked: it sits in the Live tokens view with its market cap, and its ratio is part of the calibration.'
      ),
      el('table', { class: 'mult-table' },
        el('caption', { class: 'sub', text: 'Calibrated multiples for the categories on this board (shrunk = the multiple actually used).' }),
        el('thead', null, el('tr', null,
          el('th', { scope: 'col', text: 'Category' }), el('th', { scope: 'col', text: 'Traded sample' }),
          el('th', { scope: 'col', text: 'Median mcap/TVL' }), el('th', { scope: 'col', text: 'Multiple used' })
        )),
        el('tbody', null, multRows)
      )
    );
  }

  function foot() {
    return el('footer', { class: 'foot' },
      el('p', { text: 'Data: ' + DATA.source + '. "Records no token" is a statement about this snapshot\u2019s record, not about the world: a protocol may have a token its record does not carry.' }),
      el('p', { text: 'Implied values are this board\u2019s own model output. Nothing here predicts whether or when any protocol issues a token, and nothing here is financial advice.' })
    );
  }

  /* ---------- detail drawer ---------- */
  var scrim = el('div', { class: 'scrim' });
  var drawer = el('aside', { class: 'detail', id: 'detail', 'aria-hidden': 'true' });
  scrim.addEventListener('click', closeDetail);

  function stepParts(step) {
    var at = step.indexOf(' Cost: ');
    if (at < 0) return { action: step, tail: '' };
    return { action: step.slice(0, at), tail: step.slice(at + 1) };
  }

  function openDetail(slug) {
    var row = null;
    DATA.rows.forEach(function (r) { if (r.slug === slug) row = r; });
    if (!row) return;
    state.selected = slug;
    writeHash();
    var m = row.model;
    var recomputed = recomputeImplied(row);
    drawer.textContent = '';
    drawer.appendChild(el('div', { class: 'detail-head' },
      el('div', null,
        el('span', { class: 'kicker', text: 'Rank ' + row.rank + ' of ' + DATA.board_size + ' \u00B7 ' + (row.watchlist ? 'watchlist' : 'early find') }),
        el('h2', { text: row.name }),
        el('p', { class: 'sub', text: (row.category || 'Uncategorised') + ' \u00B7 ' + (row.chains.length ? row.chains.join(', ') : 'no chain recorded') })
      ),
      el('button', { class: 'close', type: 'button', text: 'Close', onclick: closeDetail })
    ));
    drawer.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'The model\u2019s arithmetic' }),
      el('div', { class: 'equation' },
        el('div', null, el('span', { text: 'TVL (snapshot)' }), el('b', { text: fmtUsd(row.tvl_usd) })),
        el('div', null, el('span', { text: 'Category multiple (' + m.calibration_sample + ' traded)' }), el('b', { text: fmtMult(m.category_multiple) })),
        el('div', null, el('span', { text: '7-day growth ' + fmtPct(row.change_7d) }), el('b', { text: fmtMult(m.growth_multiplier) })),
        el('div', null, el('span', { text: 'Tokenless age ' + fmtAge(row.age_days) }), el('b', { text: fmtMult(m.maturity_multiplier) })),
        el('div', null, el('span', { text: 'Chains: ' + row.chains.length }), el('b', { text: fmtMult(m.breadth_multiplier) })),
        el('div', null, el('span', { text: 'First listed' }), el('b', { text: row.listed_at || 'not recorded' })),
        el('div', { class: 'total' }, el('span', { text: 'Implied value if it launched at this record' }), el('b', { text: fmtUsd(row.implied_value_usd) }))
      ),
      el('p', { class: 'note', text: recomputed === row.implied_value_usd
        ? 'This page recomputes the row from the same figures and constants and gets the same number board.json carries.'
        : 'This page recomputes ' + fmtUsd(recomputed) + ' for this row, which differs from the board: the data would be stale.' })
    ));
    drawer.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Farm plan — before any launch' }),
      el('ol', { class: 'steps' }, row.farm_steps.map(function (s) {
        var parts = stepParts(s);
        return el('li', null, el('b', { text: parts.action }), parts.tail ? el('span', { class: 'cost', text: parts.tail }) : null);
      })),
      el('p', { class: 'note', text: 'The plan is generated from this protocol\u2019s category, chains, TVL and age — the same derivation main.ts wrote into board.json. It assumes no launch is promised: the position should make sense even if no token ever comes.' })
    ));
    drawer.classList.add('open');
    drawer.setAttribute('aria-hidden', 'false');
    scrim.classList.add('open');
    renderBoardOnly();
  }

  function closeDetail() {
    state.selected = null;
    writeHash();
    drawer.classList.remove('open');
    drawer.setAttribute('aria-hidden', 'true');
    scrim.classList.remove('open');
    renderBoardOnly();
  }

  /* ---------- render ---------- */
  function renderBoardOnly() {
    var old = document.getElementById('board-panel');
    if (!old || state.tab !== 'board') return;
    var fresh = boardPanel();
    old.replaceWith(fresh);
    var count = document.getElementById('row-count');
    if (count) count.textContent = visibleRows().length + ' of ' + DATA.board_size + ' rows';
    var q = document.getElementById('q');
    if (q && q.value !== state.q) q.value = state.q;
  }

  function render() {
    app.textContent = '';
    var shell = el('div', { class: 'shell' });
    shell.appendChild(header());
    shell.appendChild(lede());
    shell.appendChild(controls());
    shell.appendChild(state.tab === 'board' ? boardPanel() : livePanel());
    if (state.tab === 'board') shell.appendChild(methodPanel());
    shell.appendChild(foot());
    app.appendChild(shell);
    app.appendChild(scrim);
    app.appendChild(drawer);
    var count = document.getElementById('row-count');
    if (count) count.textContent = state.tab === 'board' ? visibleRows().length + ' of ' + DATA.board_size + ' rows' : DATA.live.length + ' live-token protocols';
    app.setAttribute('aria-busy', 'false');
    if (state.selected) openDetail(state.selected);
  }

  readHash();
  render();
  window.addEventListener('keydown', function (e) { if (e.key === 'Escape' && state.selected) closeDetail(); });
})();
