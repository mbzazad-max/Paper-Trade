/* Paper-Trade tabs 01 and 02: Top 20 P&L without MSS (buy zone only) and with MSS (buy zone + 4H structure shift).
   Both read only what this repo recorded since its own fresh start (state/pnl, written by the unchanged build.js) and
   the MSS advice that the unchanged build/structure.js derives from it (public/pnl.json). Each tab has its own manual
   journal entries (state/manual/zone-events.json, mode "zone" or "mss").
   With no manual actions, both tabs must equal the unchanged pnl.js result and structure.js's own numbers; if not,
   nothing is written and the last good paper.json stays.
   usage: node build/paper-output.js        env BUILD_NOW overrides the clock (tests) */
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..');
const PNL = require('../public/pnl.js'), MANUAL = require('./zone-manual.js');
const rd = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const r = (x) => (Number.isFinite(x) ? Number(x.toPrecision(9)) : null);
const NOW = process.env.BUILD_NOW ? Number(process.env.BUILD_NOW) : Math.floor(Date.now() / 1000);
const write = (o) => { const f = path.join(ROOT, 'public', 'paper.json'); fs.writeFileSync(f + '.tmp', JSON.stringify(o)); fs.renameSync(f + '.tmp', f); };

function compact(t, mode) {
  return { sym: t.sym, id: t.id || MANUAL.tradeId(mode, t.sym, t), entry_t: t.entryT, entry: r(t.px), stop: r(t.stop), active_stop: r(t.cs),
    target1: r(t.t1), target2: r(t.t2), exit_t: t.exitT || null, exit: r(t.exitPx), closed: !!t.exitT, reason: t.out || null,
    usd: r(t.pnl), pct: r(t.ret), half: !!t.half, remaining_pct: r(t.left * 100), mark: r(t.mark),
    legs: (t.legs || []).map((L) => ({ t: L.t, px: r(L.px), pct: r(L.q / t.qty * 100), why: L.why })) };
}
function summary(s) {
  return { closed: s.closed, wins: s.wins, losses: s.losses, win_rate: r(s.winRate), realized: r(s.realized), unrealized: r(s.openPnl),
    net: r(s.net), net_pct: r(s.netPct), capital: s.cap, profit_factor: s.pf === Infinity ? null : r(s.pf), max_drawdown: r(s.maxDD),
    open: s.open, pending: s.pending, buy_hold_pct: r(s.bh), curve: s.curve.map(([t, v]) => [t, r(v)]) };
}

function main() {
  const sc = rd(path.join(ROOT, 'config', 'start.json')), pc = rd(path.join(ROOT, 'config', 'paper.json')).zone;
  const events = rd(path.join(ROOT, 'state', 'manual', 'zone-events.json'));
  const base = { generated: new Date(NOW * 1000).toISOString(), start: sc.start, cohort: pc.cohort, cohort_count: pc.cohort.length, size: pc.size, fee_pct_each_side: pc.fee };
  const cf = path.join(ROOT, 'state', 'pnl', 'cfg.json');
  if (sc.start === 'auto' || NOW < sc.start || !fs.existsSync(cf)) {
    if (events.length) throw new Error('Manual actions exist before the start');
    write({ ...base, started: false, zone_event_count: 0 });
    console.log('paper.json: not started');
    return;
  }
  const cfg = rd(cf);
  if (cfg.start !== sc.start) throw new Error('cfg.json start differs from config/start.json');
  const ids = new Set();
  for (const e of events) {
    if (!['zone', 'mss'].includes(e.mode) || !cfg.cohort.includes(e.sym) || ids.has(e.nonce) || !(e.t > cfg.start)) throw new Error('Invalid, duplicate or pre-start manual event ' + e.nonce);
    ids.add(e.nonce);
  }
  const pub = fs.existsSync(path.join(ROOT, 'public', 'pnl.json')) ? rd(path.join(ROOT, 'public', 'pnl.json')) : {};
  const empty = { t: [], o: [], h: [], l: [], c: [] };
  const zoneSt = { cfg, snaps: {}, bars: {} }, mssSt = { cfg, snaps: {}, bars: {} };
  for (const sym of cfg.cohort) {
    const sf = path.join(ROOT, 'state', 'pnl', 's_' + sym + '.json'), bf = path.join(ROOT, 'state', 'pnl', 'b_' + sym + '.json');
    zoneSt.snaps[sym] = fs.existsSync(sf) ? rd(sf) : { sym, snaps: [] };
    zoneSt.bars[sym] = mssSt.bars[sym] = fs.existsSync(bf) ? rd(bf) : empty;
    mssSt.snaps[sym] = pub['s_' + sym] || { sym, snaps: [] };
    // fresh start: nothing may come from before the start
    for (const s of zoneSt.snaps[sym].snaps.concat(mssSt.snaps[sym].snaps)) if (s.t < cfg.start) throw new Error('Advice from before the start for ' + sym);
    for (const t of zoneSt.bars[sym].t) if (t < cfg.start) throw new Error('Candle from before the start for ' + sym);
  }
  const zEv = events.filter((e) => e.mode === 'zone'), mEv = events.filter((e) => e.mode === 'mss');
  const zone = MANUAL.run(zoneSt, zEv, 'zone'), mss = MANUAL.run(mssSt, mEv, 'mss');
  const zBase = PNL.run(zoneSt, {}), mBase = PNL.run(mssSt, {});
  if (!zEv.length) MANUAL.parity(zBase, zone, 'zone');
  if (!mEv.length) MANUAL.parity(mBase, mss, 'mss');
  // same numbers as the unchanged structure.js reports for this run (its "zone" and "page" figures)
  const S = fs.existsSync(path.join(ROOT, 'public', 'structure.json')) ? rd(path.join(ROOT, 'public', 'structure.json')) : null;
  const near = (a, b) => Math.abs(a - b) < Math.max(0.02, Math.abs(a) * 1e-5);
  if (S && S.live && S.live.start === cfg.start && (!near(zBase.sum.net, S.live.zone.net) || !near(mBase.sum.net, S.live.page.net)))
    throw new Error('Parity with structure.js failed (zone ' + zBase.sum.net + ' vs ' + S.live.zone.net + ', mss ' + mBase.sum.net + ' vs ' + S.live.page.net + ')');
  const per = cfg.cohort.map((sym, k) => {
    const panel = (p, mode) => ({ net: r(p.realized + (p.open ? p.open.pnl : 0)), realized: r(p.realized), closed: p.trades.length,
      trades: p.trades.slice(-30).map((t) => compact(t, mode)), open: p.open ? compact(p.open, mode) : null,
      pending: p.pending ? { t: p.pending.t, entry: r(p.pending.entry), stop: r(p.pending.stop), t1: r(p.pending.t1), t2: r(p.pending.t2), state: p.pending.state } : null,
      latest: p.latest ? { t: p.latest.t, state: p.latest.state || null, none: !!p.latest.none } : null,
      last_close: p.last_close, last_price: r(p.last_price), manual_log: (p.manual_log || []).map((a) => ({ ...a, px: r(a.px), usd: r(a.usd), remaining_pct: r(a.remaining_pct) })) });
    return { sym, zone: panel(zone.coins[k], 'zone'), mss: panel(mss.coins[k], 'mss') };
  });
  write({ ...base, started: true, end: cfg.end, days: cfg.days, zone_event_count: events.length,
    zone: { name: 'Buy zone only (without MSS)', live: summary(zone.sum) },
    mss: { name: 'Buy zone + 4H structure shift (with MSS)', live: summary(mss.sum) }, per_coin: per });
  console.log('paper.json: zone net ' + r(zone.sum.net) + ', MSS net ' + r(mss.sum.net) + ', manual actions ' + events.length);
}
try { main(); } catch (e) { console.error('::error::' + (e.message || e) + ' (last good paper.json kept)'); process.exit(1); }
