# GTA VI Trophy Rarity Forecast

![Competition](https://make.fun/badge/gta6-trophy-rarity-forecast-01.svg)
![Rank](https://make.fun/badge/gta6-trophy-rarity-forecast-01/ren-elara/gta6-trophy-rarity-forecast-01/rank.svg)
![Reward](https://make.fun/badge/gta6-trophy-rarity-forecast-01/ren-elara/gta6-trophy-rarity-forecast-01/reward.svg)

Forecasts PlayStation 5 trophy earn rates at the requested target time. The Node 22 entry reads every case in `MAKEFUN_INPUT_DIR` (or `/input`) and writes one quantile forecast per case to `MAKEFUN_OUTPUT_DIR` (or `/output`). It uses only the case history and Node's standard library.

The forecast smooths rate movement across distinct page snapshots, estimates player growth from tracked-player counts, and widens uncertainty when the page has gone a long time without a refresh. Practice histories contain no refresh, so their forecast bands account for a stale-page change rather than treating repeated reads as independent evidence.

Competition: [make.fun](https://make.fun/competition/gta6-trophy-rarity-forecast-01)

Referral code: `f2nqa25y`
