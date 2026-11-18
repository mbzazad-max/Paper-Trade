/* With no manual actions, Paper-Trade's ledgers must give exactly Coin Zones' own results.
     Top 20: build/ledger.js runTop20 vs public/pnl.js PNL.run (unchanged), on 3,000 random coins (random candles and random
             advice, including gaps down through stops, both targets in one candle, advice that changes and goes away)
             for both tabs, plus a whole 26-coin portfolio (totals, curve, drawdown).
     s083:   build/ledger.js runS083 with join=true and Coin Zones' start vs the unchanged build/stratlab.js paper test,
             run on the same Market-Data candles (its live numbers per coin, and every trade).
   usage: node tests/parity-ledgers.js <market-data dir> */
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), assert = require('assert/strict'), { execFileSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..'), MD = path.resolve(process.argv[2]);
const PNL = require('../public/pnl.js'), L = require('../build/ledger.js'), { signal } = require('../build/stratlab.js');
const H4 = 14400, near = (a, b, m) => assert(Math.abs(a - b) < 1e-6 * Math.max(1, Math.abs(b)), m + ': ' + a + ' vs ' + b);

// ---- Top 20, random ----
let seed = 7; const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
function coin(n, T0) {
  const B = { t: [], o: [], h: [], l: [], c: [] }; let p = 100;
  for (let i = 0; i < n; i++) { const o = p * (1 + (rnd() - 0.5) * 0.04), c = o * (1 + (rnd() - 0.5) * 0.08); B.t.push(T0 + i * H4); B.o.push(o); B.c.push(c); B.h.push(Math.max(o, c) * (1 + rnd() * 0.03)); B.l.push(Math.min(o, c) * (1 - rnd() * 0.03)); p = c; }
  const snaps = []; let t = T0 - H4;
  while (t < T0 + n * H4) {
    t += Math.floor(rnd() * 10) * 3600; const ref = B.c[Math.min(n - 1, Math.max(0, Math.floor((t - T0) / H4)))];
    if (rnd() < 0.2) snaps.push({ t, none: true, state: 'NO SETUP' });
    else { const e = ref * (0.95 + rnd() * 0.06), st = e * (0.9 + rnd() * 0.08); snaps.push({ t, entry: e, stop: st, t1: rnd() < 0.1 ? null : e * (1.01 + rnd() * 0.06), t2: rnd() < 0.15 ? null : e * (1.05 + rnd() * 0.1), rr2: 2 }); }
    t += H4;
  }
  return { B, snaps };
}
const T0 = 1795000000 - (1795000000 % H4); let trades = 0;
for (let k = 0; k < 3000; k++) {
  const { B, snaps } = coin(40 + Math.floor(rnd() * 160), T0), R = { start: T0 + H4 * Math.floor(rnd() * 5), end: T0 + 400 * H4, size: 1000, fee: 0.1 };
  const p = PNL.simCoin('X', snaps, B, R, {}), st = { cfg: { ...R, cohort: ['X'] }, snaps: { X: { snaps } }, bars: { X: B } };
  for (const mode of ['zone', 'mss']) {
    const bad = L.sameAsPnl(L.runTop20(mode, st, []), { coins: [p] }); assert.deepEqual(bad, [], 'random coin ' + k + ' differs from pnl.js');
  }
  trades += p.trades.length;
}
{ // a whole portfolio: totals, curve and drawdown
  const cohort = [], snaps = {}, bars = {};
  for (let k = 0; k < 26; k++) { const s = 'C' + k, x = coin(180, T0); cohort.push(s); snaps[s] = { snaps: x.snaps }; bars[s] = x.B; }
  const st = { cfg: { cohort, start: T0, end: T0 + 400 * H4, size: 1000, fee: 0.1 }, snaps, bars }, a = PNL.run(st, {}).sum, b = L.runTop20('zone', st, []).sum;
  for (const k of ['closed', 'wins', 'losses', 'be', 'open', 'pending']) assert.equal(b[k], a[k], 'portfolio ' + k);
  for (const k of ['realized', 'openPnl', 'net', 'netPct', 'maxDD', 'bh']) near(b[k], a[k], 'portfolio ' + k);
  assert.equal(b.curve.length, a.curve.length); b.curve.forEach((p, i) => { assert.equal(p[0], a.curve[i][0]); near(p[1], a.curve[i][1], 'curve'); });
}

// ---- s083 vs the unchanged stratlab.js paper test (Coin Zones' config and start) ----
const CZ = JSON.parse(fs.readFileSync(path.join(ROOT, 'reference', 'stratlab.coin-zones.json'), 'utf8')), s083n = [];
for (const start of [CZ.start, Date.UTC(2025, 10, 1) / 1000]) {   // Coin Zones' own start, and a year back for many trades
const cz = { ...CZ, start };
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pt-s083-'));
for (const d of ['build', 'config', 'public']) fs.mkdirSync(path.join(tmp, d));
fs.copyFileSync(path.join(ROOT, 'build/stratlab.js'), path.join(tmp, 'build/stratlab.js'));
fs.copyFileSync(path.join(ROOT, 'config/board.json'), path.join(tmp, 'config/board.json'));
fs.writeFileSync(path.join(tmp, 'config/stratlab.json'), JSON.stringify(cz));
execFileSync('node', [path.join(tmp, 'build/stratlab.js'), MD]);
const lab = JSON.parse(fs.readFileSync(path.join(tmp, 'public/stratlab.json'), 'utf8')); fs.rmSync(tmp, { recursive: true, force: true });
const cand = (sym) => { const ls = fs.readFileSync(path.join(MD, 'data/binance', sym + 'USDT_4H.csv'), 'utf8').trim().split('\n').slice(1), B = { t: [], c: [], v: [] }; for (const x of ls) { const p = x.split(','); B.t.push(+p[0]); B.c.push(+p[4]); B.v.push(+p[5]); } return B; };
const r4 = (v) => Number(v.toPrecision(6));
for (const sym of cz.coins) {
  const B = cand(sym), mine = L.runS083(sym, B, signal(B, cz.params).sig, { size: cz.size, fee: cz.fee, join: true }, cz.start, []), lv = lab.coins[sym].live;
  assert.equal(mine.closed, lv.closed, sym + ' closed'); assert.equal(mine.wins, lv.wins, sym + ' wins');
  assert.equal(r4(mine.realized), lv.realised, sym + ' realised'); assert.equal(r4(mine.unrealized), lv.unrealised, sym + ' open');
  const all = mine.trades.map((t) => ({ side: t.side, entry_t: t.entry_t, exit_t: t.exit_t, usd: r4(t.usd) })).concat(mine.open ? [{ side: mine.open.side, entry_t: mine.open.entry_t, exit_t: null, usd: r4(mine.open.unrealized) }] : []);
  assert.deepEqual(all.slice(-lv.trades.length), lv.trades.map((t) => ({ side: t.side, entry_t: t.entry_t, exit_t: t.exit_t, usd: t.usd })), sym + ' trades');
  s083n.push(lv.closed);
}
}
console.log('ledgers: same as pnl.js on 3,000 random coins (' + trades + ' trades) x 2 tabs and a 26-coin portfolio; s083 same as stratlab.js on ' + CZ.coins.join(', ') + ' from 16 Nov 2026 and from 1 Nov 2025 (' + s083n.reduce((a, b) => a + b, 0) + ' closed trades)');
