/* Manual Close all / Book % rules on made-up candles (no Market-Data needed).
   usage: node tests/manual.js */
'use strict';
const assert = require('assert/strict'), path = require('path');
const MANUAL = require('../build/zone-manual.js'), PNL = require('../public/pnl.js'), { runCoin } = require('../build/s083-paper.js');
const H4 = 14400, T0 = 1795000000 - (1795000000 % H4);
const near = (a, b, m) => assert(Math.abs(a - b) < 1e-6, m + ': ' + a + ' vs ' + b);

// ---- zone / MSS ledger ----
{
  const bars = (rows) => ({ t: rows.map((_, i) => T0 + i * H4), o: rows.map((r) => r[0]), h: rows.map((r) => r[1]), l: rows.map((r) => r[2]), c: rows.map((r) => r[3]) });
  const B = bars([[105, 106, 104, 105], [104, 105, 99, 100.1], [101, 111, 100, 110], [110, 112, 108, 111], [111, 121, 110, 119], [119, 125, 117, 124]]);
  const snaps = [{ t: T0, entry: 100, stop: 90, t1: 120, t2: 140, rr1: 2, rr2: 4 }];
  const cfg = { start: T0, end: T0 + 100 * H4, size: 1000, fee: 0.1, cohort: ['AAA'] }, st = { cfg, snaps: { AAA: { snaps } }, bars: { AAA: B } };
  for (const mode of ['zone', 'mss']) {
    const base = MANUAL.run(st, [], mode);
    MANUAL.parity(PNL.run(st, {}), base, mode);                          // no actions = unchanged pnl.js
    const pos = base.coins[0].open; assert(pos && pos.half, mode + ': filled at 100 and T1 taken');
    // book 50% at the close of candle 2 (110), before T1 is reached
    const id = MANUAL.tradeId(mode, 'AAA', { snapT: T0, entryT: T0 + H4 });
    const ev = [{ nonce: 'n1', mode, sym: 'AAA', kind: 'book', percent: 50, trade_id: id, t: T0 + 3 * H4, px: 110 }];
    const a = MANUAL.run(st, ev, mode), c = a.coins[0];
    assert.deepEqual(c.applied, ['n1']);
    assert.equal(c.manual_log[0].action, 'profit_booking'); near(c.manual_log[0].remaining_pct, 50, 'half left');
    // T1 then takes the other half (min(50% of qty, what is left)) and the trade ends
    assert(!c.open && c.trades.length === 1 && c.trades[0].out === 'T1', mode + ': ends at T1 after a 50% booking');
    // the other mode is not touched by this action
    const other = mode === 'zone' ? 'mss' : 'zone'; assert.deepEqual(MANUAL.run(st, ev, other).coins[0].applied, []);
    // close all at candle 3 (111)
    const cl = MANUAL.run(st, [{ nonce: 'n2', mode, sym: 'AAA', kind: 'close', percent: 100, trade_id: id, t: T0 + 4 * H4, px: 111 }], mode).coins[0];
    assert(!cl.open && cl.trades[0].out === 'manual_close');
    // a booking on a trade that is not in net profit, or on the wrong trade, is refused
    assert.throws(() => MANUAL.run(st, [{ nonce: 'n3', mode, sym: 'AAA', kind: 'book', percent: 50, trade_id: id, t: T0 + 2 * H4 }], mode), /positive NET/);
    assert.throws(() => MANUAL.run(st, [{ nonce: 'n4', mode, sym: 'AAA', kind: 'close', percent: 100, trade_id: 'x', t: T0 + 3 * H4 }], mode), /stale/);
  }
}

// ---- s083 ledger ----
{
  const n = 60, B = { t: [], c: [], v: [] };
  for (let i = 0; i < n; i++) { B.t.push(T0 + i * H4); B.v.push(i + 1); B.c.push(i < 25 ? 100 + i : i < 40 ? 124 - 2 * (i - 24) : 94 + 3 * (i - 39)); }
  const cfg = { params: { vfast: 2, vslow: 4, mom: 2 }, size: 1000, fee: 0.1, join_open_regime: false };
  const start = B.t[10] + H4;                                          // the regime is long at the start
  const a = runCoin('AAA', B, cfg, start, []);
  assert(a.trades.length >= 1 && a.trades[0].side === -1, 'first trade is the next new signal (short), not the long standing at the start');
  assert(a.trades.every((t) => t.entry_t > start));
  const joined = runCoin('AAA', B, { ...cfg, join_open_regime: true }, start, []);
  assert.equal(joined.trades[0].entry_t, start, 'with the switch on it joins at the start');
  // book 40% of the short while in profit, then close all: the short is not reopened until the signal changes
  const sh = a.trades[0], k = B.t.findIndex((t) => t + H4 === sh.entry_t), tb = B.t[k + 3] + H4, tc = B.t[k + 5] + H4;
  const b = runCoin('AAA', B, cfg, start, [{ nonce: 's1', sym: 'AAA', kind: 'book', percent: 40, trade_id: sh.id, t: tb }, { nonce: 's2', sym: 'AAA', kind: 'close', percent: 100, trade_id: sh.id, t: tc }]);
  const t1 = b.trades[0]; assert.equal(t1.reason, 'manual_close'); assert.equal(t1.legs.length, 2); near(t1.legs[0].pct, 40, 'booked 40%'); near(t1.legs[1].pct, 60, 'closed the remaining 60%');
  const nx = b.trades[1] || b.open; assert(nx && nx.side === 1 && nx.entry_t > B.t[39], 'no new short after Close all; next trade is the long');
  assert(t1.usd > 0);
  assert.throws(() => runCoin('AAA', B, cfg, start, [{ nonce: 's3', sym: 'AAA', kind: 'book', percent: 40, trade_id: 'AAA:1:1', t: tb }]), /no longer matches/);
}
console.log('manual rules: ok');
