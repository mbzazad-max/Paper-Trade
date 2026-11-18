/* Paper-Trade: writes the three tabs.
     public/paper.json       tabs 01 (without MSS) and 02 (with MSS)
     public/s083-paper.json  tab 03 (s083)
   Reads only what this repo recorded since its fresh start: state/pnl (advice + closed 4H candles, written by the unchanged
   build.js), public/pnl.json (the MSS orders the unchanged structure.js makes from that advice), Market-Data 4H candles
   for s083, and the owner's journals state/manual/top20.json and state/manual/s083.json.
   Checks before anything is written (otherwise the last good files stay):
     - nothing from before the start (advice, candles, trades, actions);
     - every coin with no manual action in a tab equals Coin Zones' own public/pnl.js result for that coin, trade by trade.
   usage: node build/paper.js <market-data dir>        env BUILD_NOW overrides the clock (tests) */
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..'), H4 = 14400;
const PNL = require('../public/pnl.js'), { signal } = require('./stratlab.js'), L = require('./ledger.js');
const NOW = process.env.BUILD_NOW ? Number(process.env.BUILD_NOW) : Math.floor(Date.now() / 1000);
const rd = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'));
const has = (f) => fs.existsSync(path.join(ROOT, f));
const r = (x) => (Number.isFinite(x) ? Number(x.toPrecision(9)) : null);
const out = (f, o) => { const p = path.join(ROOT, 'public', f); fs.writeFileSync(p + '.tmp', JSON.stringify(o)); fs.renameSync(p + '.tmp', p); };

function candles(md, sym) {                                 // closed 4H candles: time, close, volume
  const lines = fs.readFileSync(path.join(md, 'data', 'binance', sym + 'USDT_4H.csv'), 'utf8').trim().split('\n').slice(1), B = { t: [], c: [], v: [] };
  for (const ln of lines) { const x = ln.split(','), t = +x[0]; if (t + H4 > NOW) break; if (B.t.length && t <= B.t[B.t.length - 1]) throw new Error('candles out of order: ' + sym); B.t.push(t); B.c.push(+x[4]); B.v.push(+x[5]); }
  return B;
}
function checkJournal(list, start, keys) {
  if (!Array.isArray(list)) throw new Error('journal is not a list');
  const seen = new Set();
  for (const a of list) {
    if (seen.has(a.nonce)) throw new Error('duplicate action ' + a.nonce); seen.add(a.nonce);
    if (!(a.t > start)) throw new Error('action before the start: ' + a.nonce);
    for (const k of keys) if (a[k] == null) throw new Error('action ' + a.nonce + ' has no ' + k);
  }
}

function top20(sc) {
  const z = rd('config/paper.json').zone, journal = rd('state/manual/top20.json');
  const base = { generated: new Date(NOW * 1000).toISOString(), start: sc.start, cohort: z.cohort, size: z.size, fee: z.fee, journal_count: journal.length };
  if (sc.start === 'auto' || NOW < sc.start || !has('state/pnl/cfg.json')) {
    if (journal.length) throw new Error('actions exist before the start');
    return { ...base, started: false };
  }
  const cfg = rd('state/pnl/cfg.json'); if (cfg.start !== sc.start) throw new Error('state/pnl/cfg.json start differs from config/start.json');
  checkJournal(journal, cfg.start, ['mode', 'sym', 'kind', 'trade_id', 't']);
  const pub = has('public/pnl.json') ? rd('public/pnl.json') : {}, none = { t: [], o: [], h: [], l: [], c: [] };
  const st = { zone: { cfg, snaps: {}, bars: {} }, mss: { cfg, snaps: {}, bars: {} } };
  for (const sym of cfg.cohort) {
    st.zone.snaps[sym] = has('state/pnl/s_' + sym + '.json') ? rd('state/pnl/s_' + sym + '.json') : { snaps: [] };
    st.mss.snaps[sym] = pub['s_' + sym] || { snaps: [] };
    st.zone.bars[sym] = st.mss.bars[sym] = has('state/pnl/b_' + sym + '.json') ? rd('state/pnl/b_' + sym + '.json') : none;
    for (const s of st.zone.snaps[sym].snaps.concat(st.mss.snaps[sym].snaps)) if (s.t < cfg.start) throw new Error('advice from before the start: ' + sym);
    for (const t of st.zone.bars[sym].t) if (t < cfg.start) throw new Error('candle from before the start: ' + sym);
  }
  const tab = {};
  for (const mode of ['zone', 'mss']) {
    const acts = journal.filter((a) => a.mode === mode), mine = L.runTop20(mode, st[mode], acts), pnl = PNL.run(st[mode], {});
    const bad = L.sameAsPnl(mine, pnl, acts.map((a) => a.sym));
    if (bad.length) throw new Error(mode + ': differs from Coin Zones pnl.js for ' + bad.join(', '));
    const S = mine.sum, trade = (x) => ({ id: x.id, entry_t: x.entryT, entry: r(x.px), stop: r(x.stop), now_stop: r(x.cs), t1: r(x.t1), t2: r(x.t2), half: x.half,
      left_pct: r(x.left * 100), exit_t: x.exitT || null, exit: r(x.exitPx), how: x.out || null, usd: r(x.pnl), pct: r(x.ret), mark: r(x.mark) });
    tab[mode] = {
      sum: { closed: S.closed, wins: S.wins, losses: S.losses, win_rate: r(S.winRate), realized: r(S.realized), open_pnl: r(S.openPnl), net: r(S.net), net_pct: r(S.netPct),
        capital: S.cap, profit_factor: S.pf === Infinity ? null : r(S.pf), max_dd: r(S.maxDD), open: S.open, pending: S.pending, buy_hold_pct: r(S.bh),
        curve: S.curve.map(([t, v]) => [t, r(v)]), same_as_pnl_js: acts.length ? 'every coin without a manual action' : 'all coins' },
      coins: mine.coins.map((c) => ({ sym: c.sym, last_close: c.last_close, price: r(c.last_price), realized: r(c.realized), net: r(c.realized + (c.open ? c.open.pnl : 0)),
        open: c.open ? trade(c.open) : null, pending: c.pending ? { since: c.pending.t, entry: r(c.pending.entry), stop: r(c.pending.stop), t1: r(c.pending.t1), t2: r(c.pending.t2) } : null,
        advice: c.latest ? (c.latest.none ? c.latest.state || 'no setup' : 'setup') : null,
        trades: c.trades.slice(-30).map(trade), log: c.log.map((a) => ({ ...a, px: r(a.px), usd: r(a.usd), left_pct: r(a.left_pct) })) })) };
  }
  return { ...base, started: true, end: cfg.end, zone: tab.zone, mss: tab.mss };
}

function s083(md, sc) {
  const o = rd('config/paper.json').s083, journal = rd('state/manual/s083.json');
  const base = { generated: new Date(NOW * 1000).toISOString(), start: sc.start, name: o.name, coins: o.coins, size: o.size, fee: o.fee, params: o.params, join: !!o.join_open_regime, journal_count: journal.length };
  if (sc.start === 'auto' || NOW < sc.start) { if (journal.length) throw new Error('actions exist before the start'); return { ...base, started: false }; }
  checkJournal(journal, sc.start, ['sym', 'kind', 'trade_id', 't']);
  const per = {}, tot = { realized: 0, unrealized: 0, net: 0, closed: 0, wins: 0, losses: 0, open: 0 };
  for (const sym of o.coins) {
    const B = candles(md, sym); if (B.t.length < o.params.vslow + 2) throw new Error('too few candles: ' + sym);
    const c = L.runS083(sym, B, signal(B, o.params).sig, { size: o.size, fee: o.fee, join: !!o.join_open_regime }, sc.start, journal);
    for (const k of ['realized', 'unrealized', 'net', 'closed', 'wins', 'losses']) tot[k] += c[k]; if (c.open) tot.open++;
    per[sym] = { price: r(c.price), last_close: c.last_close, signal: c.signal, waiting: c.waiting, realized: r(c.realized), unrealized: r(c.unrealized), net: r(c.net),
      open: c.open && { ...c.open, entry: r(c.open.entry), left_pct: r(c.open.left_pct), mark: r(c.open.mark), unrealized: r(c.open.unrealized), booked: r(c.open.booked), parts: c.open.parts.map((p) => ({ ...p, px: r(p.px), pct: r(p.pct), usd: r(p.usd) })) },
      trades: c.trades.slice(-30).map((x) => ({ ...x, entry: r(x.entry), exit: r(x.exit), usd: r(x.usd), ret: r(x.ret), parts: x.parts.map((p) => ({ ...p, px: r(p.px), pct: r(p.pct), usd: r(p.usd) })) })),
      log: c.log.map((a) => ({ ...a, px: r(a.px), usd: r(a.usd), left_pct: r(a.left_pct) })) };
  }
  for (const k of ['realized', 'unrealized', 'net']) tot[k] = r(tot[k]);
  return { ...base, started: true, sum: tot, per };
}

function main() {
  const md = path.resolve(process.argv[2] || '../market-data'), sc = rd('config/start.json');
  const a = top20(sc), b = s083(md, sc);                     // both worked out before either is written
  out('paper.json', a); out('s083-paper.json', b);
  console.log('paper.json: ' + (a.started ? 'without MSS net ' + a.zone.sum.net + ', with MSS net ' + a.mss.sum.net + ' (same as pnl.js: ' + a.zone.sum.same_as_pnl_js + ' / ' + a.mss.sum.same_as_pnl_js + ')' : 'not started')
    + ' · s083-paper.json: ' + (b.started ? b.sum.open + ' open, ' + b.sum.closed + ' closed, net ' + b.sum.net : 'not started'));
}
if (require.main === module) { try { main(); } catch (e) { console.error('::error::' + (e.message || e) + ' (last good files kept)'); process.exit(1); } }
module.exports = { candles };
