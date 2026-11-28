/* 05 · Cycle DCA rules on made-up signs and prices (build/cycle-dca.js due() and account()).
   usage: node tests/cycle-dca.js */
'use strict';
const assert = require('assert/strict');
const { due, account } = require('../build/cycle-dca.js');
const cfg = { coins: ['BTC', 'ETH'], capital: 100000, size: 5000, fee_pct: 0.1, entry1_signs: 2, entry2_ids: ['rev', 'd10', 'd20', 'swing'] };
const S = (f) => ({ low: { day: '2026-12-01', v: 50000 }, signs: ['div', 'div10', 'rev', 'd10', 'swing', 'd20'].map((id) => ({ id, fired: f[id] || null })) });
const ids = (x) => x.map((b) => b.n + '@' + b.day);

// 1 sign: nothing; 2 signs: buy 1 on the day of the 2nd; signs before the start: never
assert.deepEqual(due(cfg, '2026-12-01', 'BTC', S({ div: '2026-12-01' }), new Set()), []);
assert.deepEqual(ids(due(cfg, '2026-12-01', 'BTC', S({ div: '2026-12-01', d10: '2026-12-03' }), new Set())), ['1@2026-12-03']);
assert.deepEqual(due(cfg, '2026-12-05', 'BTC', S({ div: '2026-12-01', d10: '2026-12-03' }), new Set()), [], '2nd sign before the start');
// all 4 price-action signs: buy 2 on the day of the last of them; RSI signs do not count for buy 2
const four = { div: '2026-12-01', rev: '2026-12-02', d10: '2026-12-02', d20: '2026-12-06', swing: '2026-12-09' };
assert.deepEqual(ids(due(cfg, '2026-12-01', 'BTC', S(four), new Set())), ['1@2026-12-02', '2@2026-12-09']);
assert.deepEqual(ids(due(cfg, '2026-12-01', 'BTC', S({ div: '2026-12-01', div10: '2026-12-02', rev: '2026-12-02', d10: '2026-12-02', d20: '2026-12-03' }), new Set())), ['1@2026-12-02'], 'swing break missing: no buy 2');
// already bought: not again
assert.deepEqual(ids(due(cfg, '2026-12-01', 'BTC', S(four), new Set(['BTC|2026-12-01|1']))), ['2@2026-12-09']);
assert.deepEqual(due(cfg, '2026-12-01', 'BTC', S(four), new Set(['BTC|2026-12-01|1', 'BTC|2026-12-01|2'])), []);
// all 4 by the day of the 2nd sign: buy 2 the same day, never before buy 1
assert.deepEqual(ids(due(cfg, '2026-12-01', 'BTC', S({ rev: '2026-12-02', d10: '2026-12-02', d20: '2026-12-02', swing: '2026-12-02' }), new Set())), ['1@2026-12-02', '2@2026-12-02']);

// account: two buys, a 50% sale, then Close all; average cost and fees
const buys = [{ sym: 'BTC', n: 1, day: '2026-12-02', px: 50000, size: 5000, low: '2026-12-01', signs: [] }, { sym: 'BTC', n: 2, day: '2026-12-09', px: 40000, size: 5000, low: '2026-12-01', signs: [] },
  { sym: 'ETH', n: 1, day: '2026-12-02', px: 2000, size: 5000, low: '2026-12-01', signs: [], skipped: 'cash' }];
const q = 4995 / 50000 + 4995 / 40000, prices = { BTC: { t: 1800000000, c: 60000 }, ETH: { t: 1800000000, c: 2000 } };
let A = account(cfg, buys, [], prices);
assert.equal(A.cash, 90000); assert.ok(Math.abs(A.coins.BTC.qty - q) < 1e-9); assert.ok(Math.abs(A.coins.BTC.avg - 10000 / q) < 1e-6);
assert.equal(A.coins.ETH.qty, 0, 'a skipped buy is not held');
const t0 = Date.parse('2026-12-20T00:00:00Z') / 1000;
A = account(cfg, buys, [{ sym: 'BTC', kind: 'book', percent: 50, t: t0, px: 60000 }], prices);
assert.ok(Math.abs(A.coins.BTC.qty - q / 2) < 1e-9); assert.ok(Math.abs(A.coins.BTC.realized - (q / 2 * 60000 * 0.999 - 5000)) < 1e-6);
A = account(cfg, buys, [{ sym: 'BTC', kind: 'book', percent: 50, t: t0, px: 60000 }, { sym: 'BTC', kind: 'close', percent: 100, t: t0 + 14400, px: 66000 }], prices);
assert.equal(A.coins.BTC.qty, 0); assert.equal(A.coins.BTC.cost, 0);
assert.ok(Math.abs(A.cash - (90000 + q / 2 * 60000 * 0.999 + q / 2 * 66000 * 0.999)) < 1e-6);
assert.ok(Math.abs(A.equity - A.cash) < 1e-9);
// a sale before a buy's day close does not sell that buy
A = account(cfg, buys, [{ sym: 'BTC', kind: 'close', percent: 100, t: Date.parse('2026-12-05T00:00:00Z') / 1000, px: 45000 }], prices);
assert.ok(Math.abs(A.coins.BTC.qty - 4995 / 40000) < 1e-9, 'only buy 2 is held after the close');
console.log('cycle-dca: ok (buy 1 at 2 signs, buy 2 at the 4 price-action signs, start rule, no repeats, average cost, Sell % / Close all)');
