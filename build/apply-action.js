/* One owner action (Close all / Book N%) from the Worker, passed in by the workflow as env PAPER_ACTION (JSON).
     {strategy:"zone_pnl", mode:"zone"|"mss", sym, kind:"close"|"book", percent, nonce, trade_id, event_count, last_close}
     {strategy:"s083", sym, kind, percent, nonce, trade_id, event_count, last_close}
   The fill price is never taken from the browser: it is the close of the last closed 4H candle in Market-Data, and the
   action is refused if that candle, the trade or the journal changed since the page showed them. A Book % needs the
   remaining position to be in net profit. The accepted action is appended to its journal (state/manual/), replayed to
   prove it applies, and the build then recomputes every tab. Adapted from Paper-Test (apply-zone-action.js, apply-action.js).
   usage: node build/apply-action.js <market-data dir> */
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..'), md = path.resolve(process.argv[2] || '../market-data');
const rd = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const fail = (s) => { throw new Error('Action refused: ' + s); };
const save = (f, a) => { fs.writeFileSync(f + '.tmp', JSON.stringify(a, null, 1) + '\n'); fs.renameSync(f + '.tmp', f); };

function zone(p) {
  const MANUAL = require('./zone-manual.js'), file = path.join(ROOT, 'state', 'manual', 'zone-events.json'), events = rd(file);
  const cf = path.join(ROOT, 'state', 'pnl', 'cfg.json'); if (!fs.existsSync(cf)) fail('the paper test has not started');
  const cfg = rd(cf);
  if (!['zone', 'mss'].includes(p.mode) || !cfg.cohort.includes(p.sym)) fail('unknown tab or coin');
  if (events.some((e) => e.nonce === p.nonce)) { console.log('Duplicate action ignored'); return; }
  if (p.event_count !== events.length) fail('the journal changed; reload the page and try again');
  const pub = p.mode === 'mss' ? rd(path.join(ROOT, 'public', 'pnl.json')) : null, st = { cfg, snaps: {}, bars: {} };
  for (const sym of cfg.cohort) {
    const sf = path.join(ROOT, 'state', 'pnl', 's_' + sym + '.json'), bf = path.join(ROOT, 'state', 'pnl', 'b_' + sym + '.json');
    st.snaps[sym] = pub ? pub['s_' + sym] || { sym, snaps: [] } : fs.existsSync(sf) ? rd(sf) : { sym, snaps: [] };
    st.bars[sym] = fs.existsSync(bf) ? rd(bf) : { t: [], o: [], h: [], l: [], c: [] };
  }
  const mine = events.filter((e) => e.mode === p.mode), c = MANUAL.run(st, mine, p.mode).coins.find((x) => x.sym === p.sym), pos = c && c.open;
  if (!pos || pos.id !== p.trade_id) fail('that trade is no longer open');
  if (p.last_close !== c.last_close) fail('a new 4H candle has closed; reload and check the position again');
  const fee = cfg.fee / 100;
  if (p.kind === 'book' && !((c.last_price - pos.px) - fee * (pos.px + c.last_price) > 0)) fail('the position is not in net profit');
  const ev = { nonce: p.nonce, mode: p.mode, sym: p.sym, kind: p.kind, percent: p.kind === 'close' ? 100 : p.percent, trade_id: pos.id, t: c.last_close, px: c.last_price };
  const after = MANUAL.run(st, mine.concat(ev), p.mode).coins.find((x) => x.sym === p.sym);
  if (!after.applied.includes(p.nonce)) fail('the action did not apply in the replay');
  save(file, events.concat(ev));
  console.log('Accepted ' + p.mode + ' ' + p.kind + ' ' + p.sym + ' at the 4H close ' + c.last_price + ' (' + new Date(c.last_close * 1000).toISOString() + ')');
}

function s083(p) {
  const { compute } = require('./s083-paper.js'), file = path.join(ROOT, 'state', 'manual', 'events.json'), events = rd(file);
  if (events.some((e) => e.nonce === p.nonce)) { console.log('Duplicate action ignored'); return; }
  if (p.event_count !== events.length) fail('the journal changed; reload the page and try again');
  const before = compute(md, events);
  if (!before.started) fail('the paper test has not started');
  const c = before.coins[p.sym]; if (!c) fail('unknown coin');
  if (!c.open || c.open.id !== p.trade_id) fail('that trade is no longer open');
  if (p.last_close !== c.last_close) fail('a new 4H candle has closed; reload and check the position again');
  if (p.kind === 'book' && !(c.open.unrealized > 0)) fail('the position is not in profit');
  const ev = { nonce: p.nonce, sym: p.sym, kind: p.kind, percent: p.kind === 'close' ? 100 : p.percent, trade_id: c.open.id, t: c.last_close, px: c.price };
  if (!compute(md, events.concat(ev)).coins[p.sym].applied.includes(p.nonce)) fail('the action did not apply in the replay');
  save(file, events.concat(ev));
  console.log('Accepted s083 ' + p.kind + ' ' + p.sym + ' at the 4H close ' + c.price + ' (' + new Date(c.last_close * 1000).toISOString() + ')');
}

try {
  const raw = process.env.PAPER_ACTION || '';
  if (!raw || raw.length > 2048) fail('empty or too long');
  const p = JSON.parse(raw);
  if (!p || !['close', 'book'].includes(p.kind)) fail('unknown action');
  if (!/^[A-Za-z0-9_-]{12,100}$/.test(p.nonce || '')) fail('bad request id');
  if (typeof p.trade_id !== 'string' || p.trade_id.length > 120 || !Number.isInteger(p.last_close) || !Number.isInteger(p.event_count)) fail('missing trade, candle or journal count');
  if (p.kind === 'book' && !(Number.isInteger(p.percent) && p.percent >= 1 && p.percent <= 99)) fail('Book % must be a whole number from 1 to 99');
  if (p.strategy === 'zone_pnl') zone(p); else if (p.strategy === 's083') s083(p); else fail('unknown tab');
} catch (e) { console.error('::error::' + (e.message || e)); process.exit(1); }
