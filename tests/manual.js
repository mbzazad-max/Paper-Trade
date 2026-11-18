/* Close all / Book % rules of build/ledger.js on made-up candles (no Market-Data needed).
   usage: node tests/manual.js */
'use strict';
const assert = require('assert/strict'), L = require('../build/ledger.js'), { signal } = require('../build/stratlab.js');
const H4 = 14400, T0 = 1795000000 - (1795000000 % H4);
const near = (a, b, m) => assert(Math.abs(a - b) < 1e-6, m + ': ' + a + ' vs ' + b);

// ---- Top 20 (both tabs) ----
{
  // candle: [open, high, low, close]; advice: buy 100, stop 90, T1 120, T2 140
  const rows = [[105, 106, 104, 105], [104, 105, 99, 100.1], [101, 111, 100, 110], [110, 112, 108, 111], [111, 121, 110, 119], [119, 141, 117, 139]];
  const B = { t: rows.map((_, i) => T0 + i * H4), o: rows.map((x) => x[0]), h: rows.map((x) => x[1]), l: rows.map((x) => x[2]), c: rows.map((x) => x[3]) };
  const st = { cfg: { cohort: ['AAA'], start: T0, end: T0 + 99 * H4, size: 1000, fee: 0.1 }, snaps: { AAA: { snaps: [{ t: T0, entry: 100, stop: 90, t1: 120, t2: 140, rr2: 4 }] } }, bars: { AAA: B } };
  for (const mode of ['zone', 'mss']) {
    const id = L.topId(mode, 'AAA', T0 + H4), run = (acts) => L.runTop20(mode, st, acts).coins[0];
    const plain = run([]); assert(plain.trades[0].out === 'T1 + T2', mode + ': no action, T1 then T2');
    // Book 40% at the close of candle 2 (110): 60% left; T1 sells half of that (30%), T2 the last 30%
    const b = run([{ nonce: 'a1', mode, sym: 'AAA', kind: 'book', percent: 40, trade_id: id, t: T0 + 3 * H4 }]), tr = b.trades[0];
    assert.deepEqual(tr.legs.map((x) => [x.why, Math.round(x.q / tr.qty * 100), x.px]), [['Book 40%', 40, 110], ['T1', 30, 120], ['T2', 30, 140]]);
    near(b.log[0].usd, 4 * (110 - 100) - 4 * 210 * 0.001, 'booked part P&L after fees');
    // Close all at the close of candle 3 (111): nothing left, trade ends there, no T1/T2 afterwards
    const c = run([{ nonce: 'a2', mode, sym: 'AAA', kind: 'close', percent: 100, trade_id: id, t: T0 + 4 * H4 }]);
    assert(!c.open && c.trades.length === 1 && c.trades[0].out === 'Close all' && c.trades[0].exitT === T0 + 4 * H4);
    near(c.trades[0].pnl, 10 * 11 - 1000 * 0.001 - 10 * 111 * 0.001, 'close all P&L after fees');
    // refused: booking while not in profit after fees (close 100.1), an unknown trade, an action never reached
    assert.throws(() => run([{ nonce: 'a3', mode, sym: 'AAA', kind: 'book', percent: 50, trade_id: id, t: T0 + 2 * H4 }]), /not in net profit/);
    assert.throws(() => run([{ nonce: 'a4', mode, sym: 'AAA', kind: 'close', trade_id: 'x', t: T0 + 3 * H4 }]), /does not match/);
    assert.throws(() => run([{ nonce: 'a5', mode, sym: 'AAA', kind: 'close', trade_id: id, t: T0 + 50 * H4 }]), /never applied/);
  }
  // an action in one tab does not touch the other
  const z = L.runTop20('zone', st, []).coins[0], m = L.runTop20('mss', st, [{ nonce: 'b1', mode: 'mss', sym: 'AAA', kind: 'close', trade_id: L.topId('mss', 'AAA', T0 + H4), t: T0 + 4 * H4 }]).coins[0];
  assert.equal(z.trades[0].out, 'T1 + T2'); assert.equal(m.trades[0].out, 'Close all');
}

// ---- s083 ----
{
  const B = { t: [], c: [], v: [] };
  for (let i = 0; i < 60; i++) { B.t.push(T0 + i * H4); B.v.push(i + 1); B.c.push(i < 25 ? 100 + i : i < 40 ? 124 - 2 * (i - 24) : 94 + 3 * (i - 39)); }
  const sig = signal(B, { vfast: 2, vslow: 4, mom: 2 }).sig, opt = { size: 1000, fee: 0.1, join: false }, start = B.t[10] + H4;
  const a = L.runS083('AAA', B, sig, opt, start, []);
  assert(a.trades[0].side === -1 && a.trades[0].entry_t > start, 'fresh start: the long standing at the start is not taken; first trade is the next new signal');
  assert.equal(L.runS083('AAA', B, sig, { ...opt, join: true }, start, []).trades[0].entry_t, start, 'join=true takes it at the start');
  const sh = a.trades[0], k = B.t.findIndex((t) => t + H4 === sh.entry_t), tb = B.t[k + 3] + H4, tc = B.t[k + 5] + H4;
  const b = L.runS083('AAA', B, sig, opt, start, [{ nonce: 's1', sym: 'AAA', kind: 'book', percent: 40, trade_id: sh.id, t: tb }, { nonce: 's2', sym: 'AAA', kind: 'close', trade_id: sh.id, t: tc }]);
  const t1 = b.trades[0];
  assert.deepEqual(t1.parts.map((p) => [p.why, Math.round(p.pct)]), [['Book 40%', 40], ['Close all', 60]]);
  assert(t1.usd > 0 && t1.exit_t === tc);
  const next = b.trades[1] || b.open; assert(next && next.side === 1 && next.entry_t > B.t[39], 'after Close all no new short; the next trade is the long');
  assert.throws(() => L.runS083('AAA', B, sig, opt, start, [{ nonce: 's3', sym: 'AAA', kind: 'book', percent: 40, trade_id: sh.id, t: sh.entry_t }]), /not in profit/);
  assert.throws(() => L.runS083('AAA', B, sig, opt, start, [{ nonce: 's4', sym: 'AAA', kind: 'close', trade_id: 'AAA:L:1', t: tb }]), /does not match/);
}
console.log('manual rules: ok');
