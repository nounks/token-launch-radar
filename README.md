# token-launch-radar

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/nounks/token-launch-radar/rank.svg)](https://make.fun/bounty/token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/nounks/token-launch-radar/reward.svg)](https://make.fun/bounty/token-radar-01)

A token launch radar for make.fun's [Build the best token launch radar](https://make.fun/bounty/token-radar-01) bounty.

It reads the sealed DefiLlama snapshot of 2026-11-14, finds every protocol that
records no token and is not a wrapped, staked or bridged product of one that
trades, and ranks them by implied launch value. The value is fitted, not
hardcoded: each protocol's multiple is the median market-cap-to-TVL ratio of
the live-token protocols in its own category, adjusted for its 7-day TVL
growth and for how long it has run with no token. The dashboard shows the
board, a detail view with the value breakdown and a farm plan for every
protocol, the live-token market beside it, and the model's own leave-one-out
validation plus a sandbox to re-rank the board with different constants.

## Run it

Node.js 22.18 or later, standard library only, no install:

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input /path/to/snapshot.json
```

That writes `out/board.json`, `out/data.js`, `out/dashboard/`,
`out/screenshots/` and `out/dossier.json`.

## Model

`lib/model.ts` (`radar-4.1`, retuned by leave-one-out search over 2,700 constant
combinations on the snapshot's 128 live-token protocols): implied value = TVL x
category multiple x growth multiplier x maturity multiplier. The category
multiple is the median mcap/TVL of live-token protocols in the same category
(at least 5 comps), shrunk toward the global median as
(n x category + 5 x global) / (n + 5); with fewer than 5 comps the global
median is used alone. Growth is the 7-day TVL change clamped to -60..120%,
counted at full weight. Maturity rises from 0.4 to 1.0 over four years with no
token; unknown age counts as 365 days.

## License

MIT. See [LICENSE](LICENSE).
