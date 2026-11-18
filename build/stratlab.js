/* Strategy test for Coin Zones (added 16 Nov 2026 at the owner's request). A separate section: it never changes
   the board, the engine files, state/pnl or the Top 20 P&L test. Reads config/stratlab.json and the 4H closed candles
   in market-data, writes public/stratlab.json.

   Strategy s083 "Participation regime" (4H candles, worked out on each candle's close, held from the next candle):
     active = average volume of the last `vfast` candles > average volume of the last `vslow` candles
     ret    = close / close `mom` candles ago - 1
     LONG  when active and ret > 0, SHORT when active and ret < 0, otherwise FLAT. No stop loss, no take profit.

   Paper test: starts at cfg.start. If the rule already holds a position then, the test joins it at that candle's close.
   Every trade is $cfg.size, 1x, fee cfg.fee % each side. Everything is recomputed from candles on every run, so there
   is no state to keep. Shorts need a futures account; the rest of the board is spot only.

   usage: node build/stratlab.js <market-data dir>
   If anything fails the script warns and exits 0, so the board still deploys. */
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..'), PUB = path.join(ROOT, 'public'), H4 = 14400;
const rd = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const r4 = (v) => (v == null || !isFinite(v) ? null : Number(v.toPrecision(6)));
const ts = (d) => Date.parse(d + 'T00:00:00Z') / 1000;

function signal(B, P) {
  const n = B.t.length, sig = new Array(n).fill(0), act = new Array(n).fill(false), ret = new Array(n).fill(null);
  const cum = [0]; for (let i = 0; i < n; i++) cum.push(cum[i] + B.v[i]);
  for (let i = 0; i < n; i++) {
    if (i + 1 >= P.vslow) act[i] = (cum[i + 1] - cum[i + 1 - P.vfast]) / P.vfast > (cum[i + 1] - cum[i + 1 - P.vslow]) / P.vslow;
    if (i >= P.mom) ret[i] = B.c[i] / B.c[i - P.mom] - 1;
    if (act[i] && ret[i] != null) sig[i] = ret[i] > 0 ? 1 : ret[i] < 0 ? -1 : 0;
  }
  return { sig, act, ret };
}
/* Runs of the same non-zero position. pos[i] = sig[i-1]: candle i is held on the signal of candle i-1's close.
   If the last candle's own signal differs from the held position, the trade closes at that candle's close
   (exited); if it is the same, the trade is still open. */
function trades(B, sig) {
  const n = B.t.length, out = []; let i = 1;
  while (i < n) {
    const p = sig[i - 1]; if (!p) { i++; continue; }
    let j = i; while (j + 1 < n && sig[j] === p) j++;
    out.push({ side: p, i0: i, i1: j, entry_t: B.t[i], entry: B.c[i - 1], exit_t: B.t[j] + H4, exit: B.c[j], open: j === n - 1 && sig[j] === p });
    i = j + 1;
  }
  return out;
}
const gross = (t) => 1 + t.side * (t.exit / t.entry - 1);
function stats(T, f) {
  const R = T.map((t) => Math.max(gross(t), 0) * Math.pow(1 - f, t.open ? 1 : 2) - 1), n = R.length;
  const wins = R.filter((x) => x > 0).length, sum = R.reduce((a, b) => a + b, 0);
  return { trades: n, wins, win_rate: n ? r4(wins / n * 100) : null, avg_ret: n ? r4(sum / n * 100) : null,
    total_ret: r4((R.reduce((a, b) => a * (1 + b), 1) - 1) * 100),
    longs: T.filter((t) => t.side > 0).length, shorts: T.filter((t) => t.side < 0).length };
}

function main() {
  const MD = path.resolve(process.argv[2] || '../market-data');
  const cfg = rd(path.join(ROOT, 'config', 'stratlab.json')), board = rd(path.join(ROOT, 'config', 'board.json'));
  const f = cfg.fee / 100, A = ts(cfg.history_from), S = ts(cfg.split);
  const load = (id) => {
    const [src, sym, tf] = id.split('/'), L = fs.readFileSync(path.join(MD, 'data', src, `${sym}_${tf}.csv`), 'utf8').trim().split('\n'); L.shift();
    const B = { t: [], c: [], v: [] };
    for (const ln of L) { const p = ln.split(','); B.t.push(+p[0]); B.c.push(+p[4]); B.v.push(+p[5]); }
    return B;
  };
  const out = { generated: new Date().toISOString().slice(0, 16).replace('T', ' ') + ' UTC', id: cfg.id, name: cfg.name, source: cfg.source,
    params: cfg.params, start: cfg.start, size: cfg.size, fee: cfg.fee, history_from: cfg.history_from, split: cfg.split, tests_btc: cfg.tests_btc, coins: {}, order: [] };
  const live = { net: 0, realised: 0, unrealised: 0, closed: 0, wins: 0, losses: 0, open: 0 };
  for (const sym of cfg.coins) {
    const c = board.coins.find((x) => x.sym === sym); if (!c) { console.warn('stratlab: ' + sym + ' is not on the board, skipped'); continue; }
    const B = load(c.series_4h), n = B.t.length; if (n < cfg.params.vslow + 2) { console.warn('stratlab: too few candles for ' + sym); continue; }
    const { sig, act, ret } = signal(B, cfg.params), T = trades(B, sig), last = n - 1;
    // history: trades by entry time
    const per = (a, b) => { const X = T.filter((t) => t.entry_t >= a && t.entry_t < b && !t.open); const s = stats(X, f);
      const ia = B.t.findIndex((t) => t >= a); let ib = B.t.findIndex((t) => t >= b); if (ib < 0) ib = n; 
      s.hold = ia >= 0 && ib - 1 > ia ? r4((B.c[ib - 1] / B.c[Math.max(ia - 1, 0)] - 1) * 100) : null; s.from = ia >= 0 ? B.t[ia] : null; return s; };
    // paper test from cfg.start
    const k = (() => { let x = -1; for (let i = 0; i < n; i++) { if (B.t[i] + H4 <= cfg.start) x = i; else break; } return x; })();
    const L = [];
    for (const t of T) {
      if (t.exit_t <= cfg.start && !t.open) continue;
      if (t.open && B.t[t.i1] + H4 <= cfg.start) { // open run with no candle after the start yet: joins at the start
        if (k >= 0) L.push({ side: t.side, entry_t: cfg.start, entry: B.c[k], exit_t: null, exit: B.c[last], open: true, joined: true }); continue; }
      const joined = t.entry_t < cfg.start;
      L.push({ side: t.side, entry_t: joined ? cfg.start : t.entry_t, entry: joined ? B.c[k] : t.entry, exit_t: t.open ? null : t.exit_t, exit: t.exit, open: t.open, joined });
    }
    const rows = L.map((t) => { const g = Math.max(gross(t), 0), r = g * Math.pow(1 - f, t.open ? 1 : 2) - 1;
      return { side: t.side, entry_t: t.entry_t, entry: r4(t.entry), exit_t: t.exit_t, exit: r4(t.exit), open: t.open, joined: t.joined, ret: r4(r * 100), usd: r4(r * cfg.size) }; });
    const cl = rows.filter((t) => !t.open), op = rows.filter((t) => t.open)[0] || null;
    const lv = { closed: cl.length, wins: cl.filter((t) => t.usd > 0).length, losses: cl.filter((t) => t.usd <= 0).length,
      realised: r4(cl.reduce((a, t) => a + t.usd, 0)), unrealised: op ? op.usd : 0, trades: rows.slice(-30) };
    lv.net = r4(lv.realised + lv.unrealised);
    live.net += lv.net; live.realised += lv.realised; live.unrealised += lv.unrealised; live.closed += lv.closed; live.wins += lv.wins; live.losses += lv.losses; live.open += op ? 1 : 0;
    // the position the rule holds for the NEXT candle is the last candle's own signal
    const cur = T.length && T[T.length - 1].open ? T[T.length - 1] : null;
    out.coins[sym] = { price: r4(B.c[last]), last_close: B.t[last] + H4, signal: sig[last], active: act[last], mom_ret: r4(ret[last] * 100),
      vol_ratio: r4(((s) => { let a = 0, b = 0; for (let i = 0; i < cfg.params.vfast; i++) a += B.v[last - i]; for (let i = 0; i < cfg.params.vslow; i++) b += B.v[last - i]; return (a / cfg.params.vfast) / (b / cfg.params.vslow); })()),
      since: cur ? cur.entry_t : null, since_price: cur ? r4(cur.entry) : null,
      live: lv, built: per(A, S), hidden: per(S, ts('2026-11-01')), after: per(ts('2026-11-01'), 1e12) };
    out.order.push(sym);
  }
  for (const kx of ['net', 'realised', 'unrealised']) live[kx] = r4(live[kx]);
  out.live = live;
  fs.writeFileSync(path.join(PUB, 'stratlab.json'), JSON.stringify(out));
  console.log('stratlab: ' + out.order.join(', ') + ' · paper test net ' + live.net + ' · ' + live.closed + ' closed, ' + live.open + ' open');
}
if (require.main === module) { try { main(); } catch (e) { console.warn('::warning::Strategy test skipped: ' + (e && e.message || e)); process.exit(0); } }
module.exports = { signal, trades };
