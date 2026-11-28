# Paper-Trade

Two paper accounts that **start fresh**: no trades, advice snapshots, manual actions or P&L are carried over from Coin Zones or Paper-Test. They use the same rules as Coin Zones. Claude only loads data; the original Coin Zones code does the logic, GitHub builds, Cloudflare shows it.

| Tab | Rule | Owner buttons |
| --- | --- | --- |
| 01 · Top 20 P&L — with MSS | Coin Zones buy-zone advice, bought only when a 4H market structure shift up comes from the buy zone (original `structure.js` rewrite of the orders). Long only. | Close all · Book N% |
| 02 · s083 Participation Regime | Original s083 signal (`stratlab.js signal()`), BTC ETH BNB SOL plus 19 alts (23 coins; TRX and HYPE pending data), long and virtual short, no stop. | Close all · Book N% |

The Top 20 tab uses the 26 Coin Zones coins (the 20 plus ARB, AVAX, FET, RAY, RENDER, WIF), $1,000 per trade, 0.1% fee each side, 365-day window (owner's choices, 18 Nov 2026). s083 uses $1,000 per trade and 0.1% fee each side.

Minimum reward-to-risk (owner's rule, 19 Nov 2026, `config/paper.json` `zone.min_rr`): from the 4H candle opening 00:00 UTC on 19 Nov, a Top 20 setup is only ordered when T1 pays at least 1.5x the risk, `(T1 - entry) / (entry - stop) >= 1.5`. Weaker advice shows as "T1 under 1.5R"; orders still waiting at that time were cancelled, trades already open run to their own stop and targets. `PNL.run` is given the same filtered advice, so the pnl.js check still holds.

**Removed 22 Nov 2026 (owner's request):** the old tab 01 "Top 20 P&L — without MSS". Its 5 open positions were closed at the 08:00 UTC 4H close; final result net -$464.85 (12 trades, 4 won, 8 lost). Record in `archive/without-mss-2026-11-22/`.

## Fresh start

- `config/start.json` holds `"auto"` until go-live. The first build on `main` sets it to the **next 4H candle boundary** and it never changes after that (`build/setup.js`).
- Before the start nothing is recorded, every tab says "Not started", and any paper state found is refused.
- At the start `state/pnl/cfg.json` is written once; from then on the unchanged `build/build.js` records the board's advice at every build and the closed 4H candles since the start.
- s083 does not join a long or short that was already standing at the start (`config/paper.json` `s083.join_open_regime: false`): each coin waits for its next new signal.
- `tests/fresh-start.js` replays the real build candle by candle on cut Market-Data and fails if anything from before the start reaches any tab.

## Manual Close all / Book %

Owner only (signed in through the home site). A button sends `{tab, coin, trade id, journal count, last closed candle}` to `/api/paper-trade/action`; the Worker starts the build with it; `build/apply-action.js` refuses it if the trade, the journal or the last closed 4H candle changed, fills it at **the last closed 4H candle's close** (never a browser price), and appends it to `state/manual/top20.json` (tabs 01/02, each with its own trade IDs) or `state/manual/s083.json`. Every build replays the journals, so they are never lost.

- **Close all** sells what is left. **Book %** sells that share of what is left (1-99) and needs it to be in profit after fees.
- Top 20: after a booking, T1 sells half of what is left and T2 the rest. s083: after Close all the same side is not taken again until the signal goes flat or turns.
- The ledgers are in `build/ledger.js`, written for Paper-Trade (no code from Paper-Test). With no actions they give exactly Coin Zones' results: every build checks each coin without a manual action against the unchanged `public/pnl.js`, and `tests/parity-ledgers.js` checks 3,000 random coins against `pnl.js` and s083 against the unchanged `stratlab.js` paper test.

## Page

`public/index.html` uses Coin Zones' own stylesheet (copied from `reference/index.original.html`), `public/cloud.js` is Coin Zones' Refresh button, freshness strip and back link (unchanged), `public/app.js` draws the three tabs.

## Runs

When Market-Data gets new candles, daily at 01:15 UTC as a safety net, on Refresh, on an owner action, and on a push to `main`. Data is read from `mbzazad-max/market-data` only (existing Binance 4H/1D series and TradingView gauges; nothing new pulled). Closed candles only; on any failure the last good files stay.

## Tests

- `node tests/manual.js`: Close all / Book % rules for both Top 20 tabs and s083 on made-up candles.
- `node tests/parity-ledgers.js <market-data>`: no actions = Coin Zones' `pnl.js` (3,000 random coins, both tabs, a 26-coin portfolio) and Coin Zones' s083 test (`stratlab.js`).
- `node tests/render.js <jsdom>`: the three tabs, not-started / visitor / owner views, and the request a button sends.
- `node tests/parity.js <market-data> <jsdom>`: the original Coin Zones page refresh vs `build.js` on the same candles (copied from coin-zones; the 6 coins added after the original page are listed, not compared).
- `node tests/fresh-start.js <market-data>`: the fresh-start replay described above.

Paper results only, not financial advice.

## MSS-RVOL (third independent tab, 24 Nov 2026)

ETH, SOL, ENA, DOGE and ZEC each have a separate $1,000 virtual spot sleeve. A fresh sleeve begins empty and only buys at the next qualified entry; it never imports or force-opens old trades. GitHub Market-Data supplies saved 1H and native 4H candles, while the engine derives complete closed 2H/3H from 1H. Nine-way bullish coin/BTC and bearish USDT.D Swing-7 states, RVOL(20) >= 2.0 on the latest closed 4H coin candle; next simulated hourly open. Automatic exit: bearish coin 4H MSS plus bearish closed 4H candle and RVOL >= 1.5, OR the protective 3xATR initial/4xATR trailing stop, whichever comes first. Trade fees 0.10% and slippage 0.05% per side. The volume-confirmed structure exit is the user's optional exit variation; it differs from the original unfiltered structure-exit baseline.

The new engine is isolated in build/mss-rvol.js; it persists state/mss-rvol.json and state/manual/mss-rvol.json, publishes public/mss-rvol.json, and adds public/mss-rvol-ui.js. Owner-only Close All and Book % actions are verified in the same workflow, filled at the most recent completed native 4H candle close. Book % requires net profit. A manual full close prevents automatic reopening until the entry alignment resets. The UI ranks all five assets by marked-to-market return and shows unrealized/realized P&L, win rate, DD and trade history. Rolling hourly history limits 2H/3H lookback; the ledger is incremental and refuses gaps instead of silently backfilling. It will show no automatic trade until a new qualifying hourly bar arrives after activation. Market-Data is never modified.

## 04 · RSI Signal Desk (signals only, 26 Nov 2026)

The claude.ai "BTC RSI Signal Desk" moved here as a tab. **Live for BTC only** (owner, 25 Nov 2026: ETH, SOL and BNB were built and tested but left out, their backtests were weak). ETH candles are still loaded, only for BTC's ETH ↔ BTC link section and ETH check line, as on the original page. It gives buy and sell signals only: no paper account, no owner buttons.

- **Rules (unchanged):** buy when RSI(7) closes below 30. 4H: only when price sits in the 0.5-0.786 fib retracement of the last 30-day swing (swing at least 8%); sell when 4H RSI(7) closes above 70. 1D: only when the close is above the EMA 200; sell at the 0.236 fib of the entry swing (a resting limit) or on a daily close below the swing low. Long only, 0.1% fee each side, closed candles only.
- **Engine:** `public/signal-desk-engine.js` is byte-identical to the engine inside the original page (`reference/signal-desk.original.html`, checked by `reference/SOURCE_SHA256SUMS`). The page code (`public/signal-desk-ui.js`) is the original page's own code moved into a tab; the sections are the same: 4H and 1D signal panels, the alt-vs-BTC link, the tentative cycle on 4H/1D/1W, and the trade history (a backtest over the loaded candles).
- **Data:** `build/signal-desk.js` reads Market-Data `binance/<COIN>USDT` 4H and 1D, closed candles only, with the original page's windows (4H the last 5,000 candles, 1D from 1 Oct 2020), and writes `public/signal-desk.json`. Nothing new is pulled. It writes nothing on failure, so the last good file stays, and its step cannot stop the other tabs.
- **Intended differences from the original page:** Paper-Trade's Refresh rebuilds it (no TradingView connector button or auto-refresh); no asset switch (BTC only); the comparison coin ETH is Binance ETHUSDT (was Coinbase ETHUSD); four class names are prefixed `sd-`.
- **Test:** `node tests/signal-desk.js <market-data> <jsdom>` checks the engine bytes, that Market-Data BTC equals the original's TradingView BTC candles with identical trades, that the original page and the tab show identical text in every section for BTC on the same candles, and that BTC builds and renders.

## 05 · Cycle DCA (spot, bought by the build, sold by the owner; 28 Nov 2026)

Owner's idea: hold spot coins bought from the BTC & ETH dashboard's cycle tabs, with two buys (DCA), and decide the sells himself (looking at US stocks, USDT.D and sentiment). Coins: BTC, ETH, SOL, BNB, XRP, DOGE, LINK, XLM, ARB. $100,000 paper, $5,000 per buy, 0.1% fee each side (`config/cycle-dca.json`).

- **Signs:** `cycle/build/usdtd.js` (+ `cycle/config/alts.json`, `cycle/history/eth_1d.csv`) is a byte-identical copy of the BTC & ETH dashboard's cycle engine, checked by `reference/SOURCE_SHA256SUMS`. It runs on Market-Data for each coin into a temp folder; its output matched the live dashboard's cycle JSONs sign for sign (28 Nov 2026). **When the dashboard's engine or alts.json changes, copy them again and update the checksums.**
- **Buy 1:** at the close of the day the 2nd of the 6 "⚡ Early warning (daily)" bottom signs fired after a 30-day closing low (every early warning, no extra filter: owner's choice).
- **Buy 2 (DCA):** at the close of the day the last of the 4 price-action signs (key reversal, close above the 10D, close above the 20D, ★ swing break) fired in the same low. Never before buy 1; not if the owner did Close all on that coin after buy 1.
- At most 2 buys per low; a new, lower 30-day low is a new low. A buy is skipped (and listed) if cash is short.
- **Fresh start:** the first build sets the start to the next 00:00 UTC; a low whose 2nd sign fired before the start is never bought.
- **Sells (owner only):** Sell N% (1-99) or Close all of what is held, filled at the coin's last closed Binance 4H close, refused if that candle or the journal changed since the page loaded. No profit rule.
- **Ledger:** buys appended once to `state/cycle-dca.json`; sells in `state/manual/cycle-dca.json`; average cost; `public/cycle-dca.json` for the page (`public/cycle-dca-ui.js`). On failure nothing is written and the other tabs still save.
- **Tests:** `node tests/cycle-dca.js` (rules and ledger on made-up data); `tests/render.js` covers the tab for visitor and owner and the request a Sell % sends.
