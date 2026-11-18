# Paper-Trade

Three paper accounts that **start fresh**: no trades, advice snapshots, manual actions or P&L are carried over from Coin Zones or Paper-Test. They use the same rules as Coin Zones. Claude only loads data; the original Coin Zones code does the logic, GitHub builds, Cloudflare shows it.

| Tab | Rule | Owner buttons |
| --- | --- | --- |
| 01 · Top 20 P&L — without MSS | Coin Zones buy-zone advice, original `pnl.js`: limit buy at the setup entry, stop first, half at T1 (stop to entry), rest at T2. Long only (spot). | Close all · Book N% |
| 02 · Top 20 P&L — with MSS | Same advice, bought only when a 4H market structure shift up comes from the buy zone (original `structure.js` rewrite of the orders). Long only. | Close all · Book N% |
| 03 · s083 Participation Regime | Original s083 signal (`stratlab.js signal()`), BTC ETH BNB SOL, long and virtual short, no stop. | Close all · Book N% |

The two Top 20 tabs use the 26 Coin Zones coins (the 20 plus ARB, AVAX, FET, RAY, RENDER, WIF), $1,000 per trade, 0.1% fee each side, 365-day window (owner's choices, 18 Nov 2026). s083 uses $1,000 per trade and 0.1% fee each side.

## Fresh start

- `config/start.json` holds `"auto"` until go-live. The first build on `main` sets it to the **next 4H candle boundary** and it never changes after that (`build/setup.js`).
- Before the start nothing is recorded, every tab says "Not started", and any paper state found is refused.
- At the start `state/pnl/cfg.json` is written once; from then on the unchanged `build/build.js` records the board's advice at every build and the closed 4H candles since the start.
- s083 does not join a long or short that was already standing at the start (`config/paper.json` `s083.join_open_regime: false`): each coin waits for its next new signal.
- `tests/fresh-start.js` replays the real build candle by candle on cut Market-Data and fails if anything from before the start reaches any tab.

## Manual Close all / Book N%

Owner only (signed in through the home site). The button sends `{tab, coin, trade id, journal count, last closed candle}` to `/api/paper-trade/trade`; the Worker starts the build with it; `build/apply-action.js` refuses it if the trade, the journal or the last closed 4H candle changed, fills it at **the last closed 4H candle's close** (never a browser price), and appends it to `state/manual/zone-events.json` (tabs 01/02, each with its own trade IDs) or `state/manual/events.json` (tab 03). Every build replays the journals, so they are never lost. Book N% closes N% of what is left and needs the position to be in net profit. After Close all on s083 the same side is not reopened until the signal goes flat or turns. Adapted from Paper-Test (`zone-manual.js`, s083 ledger, apply scripts).

## Files

- `public/engine.js series.js holdodds.js pnl.js structure.js refresh.js`, `build/build.js structure.js stratlab.js`, `reference/index.original.html data.original.json`: byte-identical to Coin Zones, checked on every run against `reference/SOURCE_SHA256SUMS`.
- `build/setup.js` fresh start · `build/paper-output.js` tabs 01/02 · `build/s083-paper.js` tab 03 · `build/apply-action.js` owner actions · `build/zone-manual.js` manual overlay.
- `public/index.html`, `public/app.js`: the three-tab page (display only).
- `worker/index.js`, `wrangler.jsonc`: Worker `paper-trade`, `workers_dev: false`, reached only at `https://dashboards.mbzazad.workers.dev/paper-trade/`; controls at `/api/paper-trade/`, always behind the login.

## Runs

When Market-Data gets new candles, daily at 01:15 UTC as a safety net, on Refresh, on an owner action, and on a push to `main`. Data is read from `mbzazad-max/market-data` only (existing Binance 4H/1D series and TradingView gauges; nothing new pulled). Closed candles only; on any failure the last good files stay.

## Tests

- `node tests/manual.js`: Close all / Book % rules for both Top 20 tabs and s083 on made-up candles.
- `node tests/render.js <jsdom>`: the three tabs, not-started / visitor / owner views, and the request a button sends.
- `node tests/parity.js <market-data> <jsdom>`: the original Coin Zones page refresh vs `build.js` on the same candles (copied from coin-zones; the 6 coins added after the original page are listed, not compared).
- `node tests/fresh-start.js <market-data>`: the fresh-start replay described above.

Paper results only, not financial advice.
