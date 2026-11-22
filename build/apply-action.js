/* One owner action from the page, passed in by the workflow as env PAPER_ACTION (JSON):
     {tab:"mss"|"s083", sym, kind:"close"|"book", percent, nonce, trade_id, journal_count, last_close}
   Accepted only if, right now: the trade is still open with that id, its last closed 4H candle is the one the page showed,
   the journal has not changed since, and (for a booking) the position is in profit. The fill price is that candle's close,
   never a price from the browser. The action is replayed with the whole journal before it is saved; a duplicate request
   (same nonce) is ignored. usage: node build/apply-action.js <market-data dir> */
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..'), md = path.resolve(process.argv[2] || '../market-data');
const L = require('./ledger.js'), { signal } = require('./stratlab.js'), { candles, minRR } = require('./paper.js');
const rd = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'));
const has = (f) => fs.existsSync(path.join(ROOT, f));
const save = (f, list) => { const p = path.join(ROOT, f); fs.writeFileSync(p + '.tmp', JSON.stringify(list, null, 1) + '\n'); fs.renameSync(p + '.tmp', p); };
const no = (why) => { throw new Error('Action refused: ' + why); };

function main() {
  const raw = process.env.PAPER_ACTION || ''; if (!raw || raw.length > 1024) no('empty or too long');
  const p = JSON.parse(raw);
  if (!['mss', 's083'].includes(p.tab) || !['close', 'book'].includes(p.kind) || !/^[A-Za-z0-9]{16,64}$/.test(p.nonce || '')
    || typeof p.trade_id !== 'string' || !Number.isInteger(p.journal_count) || !Number.isInteger(p.last_close)) no('malformed request');
  if (p.kind === 'book' && !(Number.isInteger(p.percent) && p.percent >= 1 && p.percent <= 99)) no('Book % must be a whole number from 1 to 99');
  const sc = rd('config/start.json'), now = process.env.BUILD_NOW ? Number(process.env.BUILD_NOW) : Math.floor(Date.now() / 1000);
  if (sc.start === 'auto' || now < sc.start) no('the paper test has not started');
  const file = p.tab === 's083' ? 'state/manual/s083.json' : 'state/manual/top20.json', journal = rd(file);
  if (journal.some((a) => a.nonce === p.nonce)) { console.log('Already done (same request id); nothing changed.'); return; }
  if (p.journal_count !== journal.length) no('another action was saved since the page loaded; reload and try again');
  let coin, act;
  if (p.tab === 's083') {
    const o = rd('config/paper.json').s083; if (!o.coins.includes(p.sym)) no('unknown coin');
    const B = candles(md, p.sym), sig = signal(B, o.params).sig, opt = { size: o.size, fee: o.fee, join: !!o.join_open_regime };
    coin = L.runS083(p.sym, B, sig, opt, sc.start, journal);
    if (!coin.open || coin.open.id !== p.trade_id) no('that trade is no longer open');
    if (coin.last_close !== p.last_close) no('a new 4H candle has closed since the page loaded; reload and check again');
    if (p.kind === 'book' && !(coin.open.side * (coin.price / coin.open.entry - 1) > 0)) no('the trade is not in profit');
    act = { nonce: p.nonce, sym: p.sym, kind: p.kind, percent: p.kind === 'close' ? 100 : p.percent, trade_id: p.trade_id, t: coin.last_close, px: coin.price, at: now };
    const after = L.runS083(p.sym, B, sig, opt, sc.start, journal.concat(act));
    if (!after.used.includes(p.nonce)) no('the action did not apply');
  } else {
    if (!has('state/pnl/cfg.json')) no('the paper test has not started');
    const cfg = rd('state/pnl/cfg.json'); if (!cfg.cohort.includes(p.sym)) no('unknown coin');
    const pub = p.tab === 'mss' ? rd('public/pnl.json') : null, st = { cfg, snaps: {}, bars: {} };
    for (const s of cfg.cohort) {
      st.snaps[s] = pub ? pub['s_' + s] || { snaps: [] } : has('state/pnl/s_' + s + '.json') ? rd('state/pnl/s_' + s + '.json') : { snaps: [] };
      st.bars[s] = has('state/pnl/b_' + s + '.json') ? rd('state/pnl/b_' + s + '.json') : { t: [], o: [], h: [], l: [], c: [] };
    }
    const rule = rd('config/paper.json').zone.min_rr;     // same T1 reward-to-risk filter as build/paper.js
    if (rule) for (const s of cfg.cohort) st.snaps[s] = { ...st.snaps[s], snaps: minRR(st.snaps[s].snaps, rule) };
    const mine = journal.filter((a) => a.mode === p.tab);
    coin = L.runTop20(p.tab, st, mine).coins.find((c) => c.sym === p.sym);
    if (!coin.open || coin.open.id !== p.trade_id) no('that trade is no longer open');
    if (coin.last_close !== p.last_close) no('a new 4H candle has closed since the page loaded; reload and check again');
    const fee = cfg.fee / 100, px = coin.last_price;
    if (p.kind === 'book' && !((px - coin.open.px) - (px + coin.open.px) * fee > 0)) no('the position is not in net profit');
    act = { nonce: p.nonce, mode: p.tab, sym: p.sym, kind: p.kind, percent: p.kind === 'close' ? 100 : p.percent, trade_id: p.trade_id, t: coin.last_close, px, at: now };
    const after = L.runTop20(p.tab, st, mine.concat(act)).coins.find((c) => c.sym === p.sym);
    if (!after.used.includes(p.nonce)) no('the action did not apply');
  }
  save(file, journal.concat(act));
  console.log('Saved: ' + p.tab + ' ' + (p.kind === 'close' ? 'Close all' : 'Book ' + p.percent + '%') + ' ' + p.sym + ' at the 4H close ' + act.px + ' (' + new Date(act.t * 1000).toISOString().slice(0, 16) + ' UTC)');
}
try { main(); } catch (e) { console.error('::error::' + (e.message || e)); process.exit(1); }
