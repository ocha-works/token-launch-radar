// Launch Radar's model: one sealed DefiLlama snapshot in, one ranked board of pre-token protocols out.
//
// The question the board answers: if this protocol issued a token today and the market priced it the
// way it prices comparable protocols that already trade, what would that token be worth — and what
// should a reader do on the protocol now, before any launch, to be counted if one comes?
//
// Nothing here is a list of names. Every figure is derived from the snapshot's own ten fields:
//
//   1. Calibration. The snapshot's token-bearing protocols are the market's own answer key. For each
//      one, ratio = mcap_usd / tvl_usd, capped at 3 before any median is taken: past that the
//      denominator is broken, not the evidence (the snapshot holds a token at 400x its TVL). A
//      category's multiple is its median capped ratio, shrunk toward the global median by sample
//      size (multiple = (n x category median + 6 x global median) / (n + 6)), so a category with two
//      observations borrows strength from the whole market instead of inheriting two outliers. A
//      category with no token-bearing member uses the global median.
//   2. Base value. base = tvl_usd x multiple(category): what the market pays per dollar of TVL for
//      protocols of this kind, applied to this protocol's TVL.
//   3. Momentum. growth = clamp(change_7d, -60, +150) per cent; growth_multiplier = 1 + growth/100 x
//      0.5. A protocol adding TVL is worth more than one leaking it; the clamp keeps one wild week
//      (the snapshot holds a +4,448% print) from minting a valuation.
//   4. Maturity. age_days = as_of - listed_at, the time the protocol has run with no token on record.
//      maturity_multiplier = 0.75 + 0.35 x min(age_days, 1460)/1460: a four-year record earns the
//      full premium, a launch-week protocol starts at 0.75. An unrecorded age counts as 365 days.
//   5. Breadth. breadth_multiplier = 1 + 0.03 x min(chains - 1, 7): each extra chain up to eight is
//      distribution a token would inherit on day one.
//
//   implied_value_usd = max(1, round(base x growth x maturity x breadth))
//
// Coverage: every watchlist slug is ranked (the floor). Below the floor, the early radar applies the
// watchlist's own screen — a candidate must record no token and must not be a wrapped, staked,
// bridged or versioned product of a protocol whose token already trades, nor an exchange's own
// listing — and takes the screened pre-token protocols by TVL. Protocols whose token already trades
// are never ranked: they are set aside with their market caps, the facts next to the model.

/** The snapshot's protocol entry: exactly the ten fields the sealed input carries. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The model's version label: the dashboard names it and every board row's arithmetic traces to it. */
export const MODEL_VERSION = 'launch-radar-2';

/** How many screened pre-token protocols below the watchlist floor the early radar carries, by TVL. */
export const EARLY_ROWS = 100;

/** How many live-token protocols the dashboard's Live view carries, by market cap. */
export const LIVE_ROWS = 30;

/** The model's tunable constants, stated in the dashboard's methodology panel. */
export const MODEL = {
  /** Observations of the global median blended into every category multiple. */
  shrink_k: 6,
  /** A calibration ratio above this is a broken denominator, not evidence: it is capped first. */
  ratio_cap: 3,
  /** Seven-day growth is clamped to this band before it moves a valuation. */
  growth_floor_pct: -60,
  growth_cap_pct: 150,
  /** Share of a week's growth (in per cent) that carries into value. */
  growth_weight: 0.5,
  /** Maturity runs from this floor to floor + range over maturity_days. */
  maturity_floor: 0.75,
  maturity_range: 0.35,
  maturity_days: 1460,
  /** Age assumed when the snapshot records no listing date. */
  unknown_age_days: 365,
  /** Value added per extra chain, and how many extra chains count. */
  breadth_per_chain: 0.03,
  breadth_max_extra: 7,
};

/** One category's calibrated multiple: the market's mcap/TVL median for its kind, shrunk to the global. */
export interface CategoryMultiple {
  category: string;
  sample_size: number;
  median_ratio: number;
  multiple: number;
}

/** The calibration the snapshot's token-bearing protocols produce. */
export interface Calibration {
  global: CategoryMultiple;
  by_category: Map<string, CategoryMultiple>;
}

/** The full arithmetic of one protocol's implied value, kept so the dashboard can show its work. */
export interface ScoreParts {
  category_multiple: number;
  calibration_sample: number;
  growth_pct: number;
  growth_multiplier: number;
  maturity_multiplier: number;
  breadth_multiplier: number;
  age_days: number | null;
  implied_value_usd: number;
}

/** One row of board.json. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  watchlist: boolean;
  age_days: number | null;
  implied_value_usd: number;
  model: ScoreParts;
  farm_steps: string[];
}

/** The dashboard's view of one board row: the row, its farm plan and its model inputs. */
export interface RadarRow extends BoardRow {}

/** A live-token protocol: it already trades, so the dashboard shows the market's value, not a model's. */
export interface LiveRow {
  slug: string;
  name: string;
  symbol: string | null;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  mcap_to_tvl: number | null;
  change_7d: number | null;
}

/** Everything the dashboard renders. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model_version: string;
  constants: typeof MODEL;
  global_multiple: number;
  global_sample: number;
  category_multiples: CategoryMultiple[];
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  rows: RadarRow[];
  live: LiveRow[];
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;

/** A finite number, else `fallback`. */
function finite(value: number | null, fallback: number): number {
  return value !== null && Number.isFinite(value) ? value : fallback;
}

/** Whole days from `listedAt` to `asOf`, clamped at zero; null when the listing date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** The median of a non-empty list of numbers. */
function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

/**
 * Calibrate the TVL multiple from the snapshot's own token-bearing protocols: the market's median
 * market-cap-per-TVL-dollar, per category, each shrunk toward the global median by sample size.
 */
export function calibrateMultiples(snapshot: Snapshot): Calibration {
  const ratiosByCategory = new Map<string, number[]>();
  const all: number[] = [];
  for (const p of snapshot.protocols) {
    if (p.mcap_usd === null || p.tvl_usd <= 0) continue;
    const ratio = Math.min(p.mcap_usd / p.tvl_usd, MODEL.ratio_cap);
    if (!Number.isFinite(ratio) || ratio <= 0) continue;
    all.push(ratio);
    const key = p.category ?? 'Uncategorised';
    const list = ratiosByCategory.get(key);
    if (list) list.push(ratio);
    else ratiosByCategory.set(key, [ratio]);
  }
  const globalMedian = all.length > 0 ? median(all) : 0.2;
  const global: CategoryMultiple = {
    category: 'All categories',
    sample_size: all.length,
    median_ratio: round4(globalMedian),
    multiple: round4(globalMedian),
  };
  const by_category = new Map<string, CategoryMultiple>();
  for (const [category, ratios] of ratiosByCategory) {
    const med = median(ratios);
    const shrunk = (ratios.length * med + MODEL.shrink_k * globalMedian) / (ratios.length + MODEL.shrink_k);
    by_category.set(category, {
      category,
      sample_size: ratios.length,
      median_ratio: round4(med),
      multiple: round4(shrunk),
    });
  }
  return { global, by_category };
}

/** The multiple one protocol is scored with: its category's, or the global median when uncalibrated. */
export function multipleFor(calibration: Calibration, category: string | null): CategoryMultiple {
  if (category !== null) {
    const found = calibration.by_category.get(category);
    if (found) return found;
  }
  return calibration.global;
}

/** Score one pre-token protocol: the calibrated base, then momentum, maturity and breadth. */
export function scoreProtocol(p: SnapshotProtocol, asOf: string, calibration: Calibration): ScoreParts {
  const mult = multipleFor(calibration, p.category);
  const growthPct = Math.min(MODEL.growth_cap_pct, Math.max(MODEL.growth_floor_pct, finite(p.change_7d, 0)));
  const growth_multiplier = 1 + (growthPct / 100) * MODEL.growth_weight;
  const age = ageDays(asOf, p.listed_at);
  const ageForModel = age ?? MODEL.unknown_age_days;
  const maturity_multiplier =
    MODEL.maturity_floor + (Math.min(Math.max(ageForModel, 0), MODEL.maturity_days) / MODEL.maturity_days) * MODEL.maturity_range;
  const extraChains = Math.min(Math.max(p.chains.length - 1, 0), MODEL.breadth_max_extra);
  const breadth_multiplier = 1 + MODEL.breadth_per_chain * extraChains;
  const implied = Math.max(1, Math.round(p.tvl_usd * mult.multiple * growth_multiplier * maturity_multiplier * breadth_multiplier));
  return {
    category_multiple: mult.multiple,
    calibration_sample: mult.sample_size,
    growth_pct: growthPct,
    growth_multiplier: round4(growth_multiplier),
    maturity_multiplier: round4(maturity_multiplier),
    breadth_multiplier: round4(breadth_multiplier),
    age_days: age,
    implied_value_usd: implied,
  };
}

/** Whether a protocol records no token at all. */
export function recordsNoToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** Categories that are products of a token that already trades, or an exchange's own listing. */
const PRODUCT_CATEGORIES = new Set([
  'CEX',
  'Bridge',
  'Canonical Bridge',
  'Cross Chain Bridge',
  'Liquid Staking',
  'Liquid Restaking',
  'Restaked BTC',
  'Anchor BTC',
  'Stablecoin Wrapper',
]);

/**
 * The early radar's screen, the watchlist's own rule carried below the floor: a candidate records no
 * token and is not a wrapped, staked, bridged or versioned product of one that trades.
 */
export function passesLaunchScreen(p: SnapshotProtocol): boolean {
  if (!recordsNoToken(p)) return false;
  if (p.category !== null && PRODUCT_CATEGORIES.has(p.category)) return false;
  if (VERSIONED.test(p.name)) return false;
  if (/\b(wrapped|staked|staking)\b/i.test(p.name)) return false;
  return true;
}

/** The board: every watchlist slug, plus the screened early finds below the floor, ranked by value. */
export function buildBoard(snapshot: Snapshot): BoardRow[] {
  const calibration = calibrateMultiples(snapshot);
  const index = new Map(snapshot.protocols.map((p) => [p.slug, p]));
  const watchlist = new Set(snapshot.watchlist);
  const chosen = new Map<string, SnapshotProtocol>();
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  const early = snapshot.protocols
    .filter((p) => !chosen.has(p.slug) && p.tvl_usd < snapshot.floor_usd && passesLaunchScreen(p))
    .sort((a, b) => b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0))
    .slice(0, EARLY_ROWS);
  for (const p of early) chosen.set(p.slug, p);

  const scored = [...chosen.values()].map((p) => ({ p, score: scoreProtocol(p, snapshot.as_of, calibration) }));
  scored.sort((a, b) => b.score.implied_value_usd - a.score.implied_value_usd || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  return scored.map((s, i) => ({
    rank: i + 1,
    slug: s.p.slug,
    name: s.p.name,
    category: s.p.category,
    chains: s.p.chains,
    tvl_usd: s.p.tvl_usd,
    change_7d: s.p.change_7d,
    mcap_usd: s.p.mcap_usd,
    listed_at: s.p.listed_at,
    gecko_id: s.p.gecko_id,
    symbol: s.p.symbol,
    token_status: 'pre-token',
    watchlist: watchlist.has(s.p.slug),
    age_days: s.score.age_days,
    implied_value_usd: s.score.implied_value_usd,
    model: s.score,
    farm_steps: farmSteps(s.p, s.score.age_days),
  }));
}

// ----------------------------------------------------------------------------------------------
// Farm plans. Each plan is assembled from the protocol's own record: its category picks the
// playbook, its first chain picks the gas profile, its TVL picks the position size, its age picks
// the qualifying hold. Costs are stated per step, in dollars and in time, never as slogans.
// ----------------------------------------------------------------------------------------------

/** The playbook families a category can map to. */
type FarmFamily =
  | 'lending' | 'dex' | 'curator' | 'allocator' | 'rwa' | 'cdp' | 'yield'
  | 'derivatives' | 'basis' | 'chain' | 'payments' | 'staking' | 'insurance' | 'generic';

/** Which playbook a DefiLlama category farms with. */
export function farmFamily(category: string | null): FarmFamily {
  const c = (category ?? '').toLowerCase();
  if (c.includes('lend') || c.includes('collateral')) return 'lending';
  if (c.includes('curator')) return 'curator';
  if (c.includes('allocator') || c.includes('liquidity manager')) return 'allocator';
  if (c.includes('rwa')) return 'rwa';
  if (c.includes('cdp') || c.includes('stablecoin issuer')) return 'cdp';
  if (c.includes('derivative') || c.includes('perpetual') || c.includes('options')) return 'derivatives';
  if (c.includes('basis')) return 'basis';
  if (c.includes('chain')) return 'chain';
  if (c.includes('payment') || c.includes('card')) return 'payments';
  if (c.includes('staking') || c.includes('restak')) return 'staking';
  if (c.includes('insurance')) return 'insurance';
  if (c.includes('dex')) return 'dex';
  if (c.includes('yield') || c.includes('farm') || c.includes('aggregator')) return 'yield';
  return 'generic';
}

/** The chain a plan is written for: the first the protocol names, else a neutral phrase. */
function primaryChain(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** Gas for one transaction on the plan's chain: Ethereum mainnet is the expensive case. */
function gasPerTx(p: SnapshotProtocol): number {
  return p.chains[0] === 'Ethereum' ? 9 : 1;
}

/** Position size for one farm wallet, scaled to the protocol's TVL so the plan stays proportionate. */
function positionSize(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 1_000_000_000) return 500;
  if (p.tvl_usd >= 250_000_000) return 250;
  if (p.tvl_usd >= 50_000_000) return 150;
  if (p.tvl_usd >= 15_000_000) return 100;
  return 50;
}

/** How long a position must be held to read as a user, not a drive-by: younger protocols, longer. */
function qualifyingHoldDays(age: number | null): number {
  if (age === null) return 45;
  if (age < 180) return 60;
  if (age < 730) return 45;
  return 30;
}

/** The family's core position: the one action that makes a wallet a user of this protocol. */
function coreAction(family: FarmFamily, p: SnapshotProtocol, chain: string, capital: number): string {
  const n = p.name;
  switch (family) {
    case 'lending': return `Supply $${capital} of USDC to ${n} on ${chain}, then borrow about 30% of it against the position and re-supply the borrow once, so the wallet both lends and borrows.`;
    case 'dex': return `Swap about $${Math.max(20, Math.round(capital / 5))} through ${n}'s main ${chain} pool, then provide $${capital} of liquidity to that pool and keep the LP position open.`;
    case 'curator': return `Deposit $${capital} of USDC into the ${n} vault on ${chain} with the highest current allocation share, and keep the vault shares in the wallet.`;
    case 'allocator': return `Deposit $${capital} of USDC into a ${n} vault on ${chain} and leave the shares untouched, so the wallet reads as allocated capital, not a pass-through.`;
    case 'rwa': return `Mint $${capital} of ${n}'s yield-bearing asset on ${chain} with USDC and hold the minted asset in the farming wallet.`;
    case 'cdp': return `Open a $${capital} collateral position on ${n} on ${chain}: deposit the collateral, mint about 40% of it as the protocol's stablecoin, and keep both sides open.`;
    case 'yield': return `Deposit $${capital} of USDC into ${n}'s main strategy on ${chain} and keep the receipt token in the wallet for the full hold.`;
    case 'derivatives': return `Deposit $${capital} of USDC as margin on ${n} and open one small hedged position (long and short the same asset in equal size) so volume accrues without directional risk.`;
    case 'basis': return `Deposit $${capital} of USDC into ${n}'s basis vault on ${chain} and keep the position through at least one full funding cycle.`;
    case 'chain': return `Bridge $${capital} of USDC to ${chain === 'its main chain' ? 'the chain' : chain} and make ${n} the wallet's home chain: keep the balance there and transact from it weekly.`;
    case 'payments': return `Load $${capital} onto ${n} and route two real payments a month through it, keeping a small idle balance between them.`;
    case 'staking': return `Stake $${capital} of the chain's staking asset through ${n} on ${chain} and keep the staking receipt in the wallet.`;
    case 'insurance': return `Buy $${capital} of cover from ${n} on ${chain} for a position you actually hold elsewhere, and keep the policy to expiry.`;
    default: return `Deposit $${capital} of USDC into ${n} on ${chain} through its main app flow and keep the position open.`;
  }
}

/** The family's weekly qualifying action: what to repeat so the activity spans snapshots. */
function weeklyAction(family: FarmFamily, p: SnapshotProtocol): string {
  const n = p.name;
  switch (family) {
    case 'lending': return `Repeat one small borrow-and-repay cycle on ${n} each week and vote on any governance proposal that opens.`;
    case 'dex': return `Make two or three small swaps a week on ${n}, in different pairs, rather than one large trade.`;
    case 'curator': return `Check the ${n} vault's allocation weekly; move the position only if the curator rotates it, and claim any points the vault page shows.`;
    case 'allocator': return `Add a small top-up deposit to ${n} every second week so the wallet's balance history is a curve, not a spike.`;
    case 'rwa': return `Hold the minted asset and add about 10% to the position monthly; check the ${n} attestations page when you do.`;
    case 'cdp': return `Top the collateral up or repay a slice weekly on ${n} so the vault shows management, and keep the health factor above 2.`;
    case 'yield': return `Compound the yield back into ${n} once a week instead of withdrawing it, and keep the receipts.`;
    case 'derivatives': return `Roll the hedge weekly on ${n} and keep total volume steady; never let one leg lapse and leave the position directional.`;
    case 'basis': return `Check ${n}'s funding rate weekly; stay in while it is positive and note the rate in the farm log each time.`;
    case 'chain': return `Make two ordinary transactions a week from the wallet on the chain — a swap, a transfer, a contract call — so it reads as a resident, not a tourist.`;
    case 'payments': return `Route at least two payments a month through ${n} and keep the receipts; idle months do not build a record.`;
    case 'staking': return `Claim and re-stake the rewards on ${n} weekly so the staking balance compounds in the open.`;
    case 'insurance': return `Renew or extend the ${n} cover before it lapses and keep an unbroken cover history.`;
    default: return `Make one qualifying action a week on ${n} — a deposit, a swap, a vote — and keep each transaction hash in the farm log.`;
  }
}

/** The family's named risk: the thing that can actually hurt this position. */
function riskNote(family: FarmFamily, p: SnapshotProtocol): string {
  const n = p.name;
  switch (family) {
    case 'lending': return `Watch the position's health factor on ${n} weekly; a collateral drop can liquidate a looped borrow even when the protocol is sound.`;
    case 'dex': return `Watch the ${n} pool's range weekly; impermanent loss on a volatile pair can exceed a season of points.`;
    case 'curator': return `Read the ${n} vault's current allocation before you deposit and monthly after: a curator vault is only as safe as the markets it allocates to.`;
    case 'allocator': return `Check what the ${n} vault holds monthly; an allocator can rotate into risk you did not sign up for.`;
    case 'rwa': return `Read ${n}'s latest attestation before adding funds; an RWA position is a claim on an off-chain asset, not on the chain.`;
    case 'cdp': return `Keep the ${n} position's health factor above 2 at all times; a minted stablecoin position is a loan that can be called by the market.`;
    case 'yield': return `Check the ${n} strategy's underlying venues monthly; yield that jumps without explanation is usually risk arriving.`;
    case 'derivatives': return `Rebalance the ${n} hedge whenever one leg is closed by liquidation or expiry; an unhedged leg is a trade, not a farm.`;
    case 'basis': return `Leave the ${n} position if funding stays negative for two weeks; a basis farm that pays funding is a short in disguise.`;
    case 'chain': return `Keep only the working balance on the new chain; bridge risk sits with the route you used to get there, not with ${n}.`;
    case 'payments': return `Keep the ${n} balance small between payments; a payments balance is an unsecured claim on the issuer.`;
    case 'staking': return `Note the unbonding period on ${n} before you stake; staked capital cannot leave during a drawdown.`;
    case 'insurance': return `Read the ${n} policy's exclusions before you rely on it; cover that excludes your venue is a receipt, not protection.`;
    default: return `Re-read ${n}'s documentation before adding funds; if the app's flow has changed since the plan was written, follow the app, not the plan.`;
  }
}

/**
 * One protocol's farm plan, assembled from its record: wallet setup, the core position, the weekly
 * qualifying action, the multi-chain step when the protocol runs on more than one chain, the risk
 * watch, the hold, and the exit discipline. Every step carries its cost and its time.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null): string[] {
  const family = farmFamily(p.category);
  const chain = primaryChain(p);
  const capital = positionSize(p);
  const gas = gasPerTx(p);
  const hold = qualifyingHoldDays(age);
  const steps: string[] = [
    `Fund a fresh wallet with $${capital + gas * 6} on ${chain}: $${capital} for the position and about $${gas * 6} held back for gas across the season. Cost: the gas reserve, about $${gas * 6}. Time: 10 minutes.`,
    `${coreAction(family, p, chain, capital)} Cost: $${capital} of capital plus about $${gas * 2} of gas. Time: 20 minutes to set up.`,
    `${weeklyAction(family, p)} Cost: about $${gas} of gas a week. Time: 10 minutes a week.`,
  ];
  if (p.chains.length > 1) {
    const second = p.chains[1]!;
    steps.push(
      `Repeat a smaller position, about $${Math.max(25, Math.round(capital / 3))}, on ${second}, ${p.name}'s second chain: multi-chain users are the cohort a launch rewards first, and a one-chain wallet is easy to filter out. Cost: about $${Math.max(25, Math.round(capital / 3))} of capital plus bridging fees of $2-10. Time: 25 minutes.`,
    );
  }
  steps.push(
    `${riskNote(family, p)} Cost: nothing to check. Time: 10 minutes a week.`,
    `Hold the position for at least ${hold} days, spanning more than one weekly snapshot of the protocol's users, before judging the farm. Cost: the $${capital} stays deployed. Time: ${hold} days.`,
    `Watch ${p.name}'s own announcements for a points program, a governance forum or a token vote, and claim only from links the protocol itself publishes — never pay a fee to claim an airdrop. Cost: nothing; a claim fee is always a scam. Time: 10 minutes a month.`,
    `Keep a farm log — wallet, chain, dates, amounts, transaction hashes — and unwind in the reverse order you entered once the season ends or the position's risk changes. Cost: nothing but the log. Time: 5 minutes a week.`,
  );
  return steps.map((s) => (s.length > 600 ? `${s.slice(0, 596)}...` : s));
}

/** The live-token protocols, by market cap: the facts the pre-token model is calibrated against. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !recordsNoToken(p))
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      symbol: p.symbol,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      mcap_to_tvl: p.mcap_usd !== null && p.tvl_usd > 0 ? round4(p.mcap_usd / p.tvl_usd) : null,
      change_7d: p.change_7d,
    }));
}

/** Everything the dashboard renders, computed from the snapshot alone. */
export function buildRadar(snapshot: Snapshot): { board: BoardRow[]; radar: RadarData } {
  const board = buildBoard(snapshot);
  const calibration = calibrateMultiples(snapshot);
  const live = liveRows(snapshot);
  const boardCategories = new Set(board.map((r) => r.category ?? 'Uncategorised'));
  const category_multiples = [...calibration.by_category.values()]
    .filter((c) => boardCategories.has(c.category) || c.category === calibration.global.category)
    .sort((a, b) => b.sample_size - a.sample_size || (a.category < b.category ? -1 : 1));
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model_version: MODEL_VERSION,
    constants: MODEL,
    global_multiple: calibration.global.multiple,
    global_sample: calibration.global.sample_size,
    category_multiples,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: board.filter((r) => !r.watchlist).length,
    live_size: live.length,
    rows: board,
    live,
  };
  return { board, radar };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, values, farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  if (board.length < 100 || board.length > 4000) return `the board holds ${board.length} rows, outside 100..4000`;
  const slugs = new Set(board.map((r) => r.slug));
  if (slugs.size !== board.length) return 'a slug appears on the board twice';
  const known = new Set(snapshot.protocols.map((p) => p.slug));
  for (const r of board) if (!known.has(r.slug)) return `${r.slug} is not one of the snapshot's protocols`;
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slugs: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  const byRank = [...board].sort((a, b) => a.rank - b.rank);
  for (let i = 1; i < byRank.length; i++) {
    if (byRank[i]!.implied_value_usd > byRank[i - 1]!.implied_value_usd) return `rank ${byRank[i]!.rank} outvalues rank ${byRank[i - 1]!.rank}`;
  }
  if (board.length >= 2 && byRank[0]!.implied_value_usd === byRank[byRank.length - 1]!.implied_value_usd) {
    return 'every row carries the same implied value: a board that ranks nothing by value is not a ranking';
  }
  for (const r of board) {
    if (!r.name) return `${r.slug} has no name`;
    if (r.farm_steps.length < 3 || r.farm_steps.length > 12) return `${r.slug} has ${r.farm_steps.length} farm steps`;
    for (const s of r.farm_steps) {
      const trimmed = s.trim();
      if (trimmed.length < 20 || trimmed.length > 600) return `${r.slug} has a farm step of ${trimmed.length} characters`;
    }
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0 || r.implied_value_usd > 100_000_000_000_000) {
      return `${r.slug} has implied value ${r.implied_value_usd}`;
    }
  }
  return null;
}

/** The dashboard's dataset as one script: window.RADAR, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
