# token-launch-radar

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/ocha-works/token-launch-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/ocha-works/token-launch-radar/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

Launch Radar: a token launch radar over a sealed DefiLlama snapshot (758 protocols, as of 2026-11-14). It ranks 140 protocols that record no token — all 40 of the snapshot's watchlist plus 100 screened early finds below its $50M floor — by an implied value calibrated from the snapshot itself: each category's market-cap-to-TVL multiple is the median of its already-trading protocols (ratios capped at x3, medians shrunk toward the global median by sample size), adjusted for seven-day TVL growth, for how long the protocol has run with no token, and for chain breadth. Protocols whose token already trades are never ranked; they are the calibration set, shown separately with their market caps. Every ranked protocol carries a farm plan generated from its own category, chains, TVL and age, with a cost and a time on every step. The dashboard is a static page (board, per-protocol detail drawer, category/chain/TVL filters, live-token view, full methodology) that renders with no network.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <path-to-snapshot.json>
```

Node 22.18 or later, standard library only. The run writes `board.json`, `data.js`, `dashboard/`, `screenshots/` and `dossier.json` into the output directory; serve that directory statically and open `dashboard/index.html`.

## What is in the repository

- `main.ts` — the program: reads the snapshot, builds the board, writes every output, and refuses a board the gate would refuse (coverage, ranks, ordering, farm-step lengths, screenshot caps) before anything is written.
- `lib/model.ts` — the model: snapshot parsing, the calibration (`calibrateMultiples`), the scoring (`scoreProtocol`), the launch screen for early finds (`passesLaunchScreen`), and the farm-plan playbooks (`farmSteps` and its per-category actions, costs and risk notes).
- `dashboard/` — the page: `index.html`, `app.css`, `app.js`. It recomputes each row's implied value in the detail drawer from the same figures and constants, so the page and `board.json` visibly agree.
- `screenshots/` — three captures of the page rendered from this snapshot's data: the board, the rank-1 protocol's detail drawer, and the board filtered to Lending.
- `vendor/makefun-board.ts` — the competition's dossier library, vendored unchanged.

The model never special-cases a protocol by name: change the snapshot and the same code produces a different board.

---

<sub>Entered on [make.fun](https://make.fun/?ref=yhjp53pb&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
