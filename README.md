# token-launch-radar

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/drizzy765/token-launch-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/drizzy765/token-launch-radar/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

Launch Radar ranks DefiLlama protocols that do not yet have a token by an implied launch FDV, and attaches a concrete farm plan to each row. Built for make.fun’s [Build the best token launch radar](https://make.fun/bounty/token-radar-01) bounty.

## Model

Implied FDV =

1. **Size** — soft-log of TVL (`TVL² / (TVL + $25M)`) so mega pools do not dominate linearly
2. **Category multiple** — median live FDV/TVL for that DefiLlama category (clamped), else a default 0.32×
3. **Growth** — 7-day TVL change, clamped, weighted into a multiplier
4. **Longevity** — days since listing without a token (airdrop-maturity curve)
5. **Chain breadth** — multi-chain and L1 premiums

The sealed snapshot’s watchlist is always covered; additional early (below-floor) pre-token protocols are scored the same way. Wrapped, staked, bridged, CEX, and versioned names are excluded from ranking.

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
