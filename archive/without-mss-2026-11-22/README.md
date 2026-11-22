# Top 20 P&L without MSS: closed and removed (22 Nov 2026)

Owner's request, 22 Nov 2026 (20:19 Sydney): "close all Top 20 P&L without MSS and delete it completely; it won't make any money".

- The 5 open positions (BNB, LINK, ADA, UNI, AAVE) were closed with Close all at the last closed 4H candle (08:00 UTC, 22 Nov 2026), through `build/apply-action.js` as usual. Fills and P&L per close are in `closes.json`. The 2 waiting buy orders were dropped with the tab.
- Final result from the 18 Nov 12:00 UTC start: net -$464.85 (-1.79% of $26,000), 12 closed trades, 4 won, 8 lost, max drawdown -$732.11, nothing open. Full final tab in `final.json`.
- Removed: the tab on the page, its part of `public/paper.json`, the `zone` tab in `build/apply-action.js` and the Worker (requests for it are now refused), and its tests.
- Kept, because tab 01 (with MSS) is built on them: the board advice recorded in `state/pnl`, `config/paper.json` `zone` settings (cohort, size, fee, min R:R), and the unchanged ledger/pnl.js engine.
