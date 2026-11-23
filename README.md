# token-launch-radar

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/drizzy765/token-launch-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/drizzy765/token-launch-radar/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

Launch Radar ranks DefiLlama protocols that do not yet have a token by an implied launch FDV, and attaches a concrete farm plan to each row. Built for make.fun’s [Build the best token launch radar](https://make.fun/bounty/token-radar-01) bounty.

## Model

Implied value = TVL × category multiple × growth × age × chain breadth, in whole dollars.

1. **Multiple** — median market cap ÷ TVL of protocols in the same category that already record a token. Ratios are clamped to the global 10th–90th percentile. A category median is used only when at least 6 of those tokens exist; a thinner sample is shown and the global median is used instead.
2. **Growth** — `1 + 0.006 ×` the 7-day TVL change in percent, clamped to −20 and +35. A missing change stays 1.
3. **Age** — `0.68 + 0.42 × (1 − exp(−years / 1.5))`, with years measured from `listed_at` to the snapshot. A missing date uses 0.75.
4. **Chains** — `1 + 0.03 ×` extra chains, capped at 12.

`productUsd` rounds each factor to parts per million and multiplies in integers. Rank 1 is the largest result. Protocols that already record a token are comparables only and are not ranked. Bridges, liquid staking, restaking, CEX, and wrapped or versioned names are left off. Every watchlist slug stays.

## Run it

```sh
# Node 22.18+ (or 24+)
mkdir -p out
MAKEFUN_OUTPUT_DIR=out node main.ts --input /path/to/snapshot.json
# open out/dashboard/index.html (needs out/data.js beside dashboard/)
```

## Layout

- `main.ts` — entrypoint
- `lib/model.ts` — scoring, farm plans, board assembly
- `dashboard/` — static board / detail / filters (no network)
- `screenshots/` — board, detail, filtered captures
- `vendor/makefun-board.ts` — dossier helper from the make.fun kit
- `.makefun/owner.json` — entry wallet claim file

---

<sub>Entered on [make.fun](https://make.fun/?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
