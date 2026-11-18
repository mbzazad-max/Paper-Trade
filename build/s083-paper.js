/* Paper-Trade tab 03: s083 Participation regime, fresh start, with manual Close all / Book N%.
   The signal is the unchanged Coin Zones build/stratlab.js signal() (checksummed). The ledger is adapted from Paper-Test
   (build/s083-paper.js) with one change for the fresh start: a regime that is already long or short when the test
   starts is NOT joined (config/paper.json s083.join_open_regime = false); the first trade is the next new signal.
   On each closed 4H candle (at its close): signal changes -> close the trade at that close; no trade and a signal
   that is not blocked -> open at that close. After a manual Close all the same side is blocked until the signal
   goes flat or turns. Every trade is $size, 1x, fee each side; shorts are virtual (paper only).
   Everything is recomputed from closed candles + state/manual/events.json on every run.
   usage: node build/s083-paper.js <market-data dir>        env BUILD_NOW overrides the clock (tests) */
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..'), H4 = 14400;
const { signal } = require('./stratlab.js');
const rd = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const r = (x) => (Number.isFinite(x) ? Number(x.toPrecision(9)) : null);
const nowS = () => (process.env.BUILD_NOW ? Number(process.env.BUILD_NOW) : Math.floor(Date.now() / 1000));

function bars(md, sym) {
  const L = fs.readFileSync(path.join(md, 'data', 'binance', sym + 'USDT_4H.csv'), 'utf8').trim().split(/\r?\n/).slice(1);
  const B = { t: [], c: [], v: [] }, now = nowS(); let prev = -1;
  for (const ln of L) {
    const x = ln.split(','), t = +x[0], c = +x[4], v = +x[5];
    if (!(t > prev && c > 0 && v >= 0)) throw new Error('Invalid or unordered candles for ' + sym);
    prev = t; if (t + H4 > now) continue;                       // never a forming candle
    B.t.push(t); B.c.push(c); B.v.push(v);
  }
  return B;
}

function runCoin(sym, B, cfg, start, events) {
  if (B.t.length < cfg.params.vslow + 2) throw new Error('Not enough 4H candles for ' + sym);
  const sig = signal(B, cfg.params).sig, f = cfg.fee / 100, byTime = new Map();
  for (const e of events) if (e.sym === sym) { if (!byTime.has(e.t)) byTime.set(e.t, []); byTime.get(e.t).push(e); }
  let pos = null, blocked = 0, realized = 0, wins = 0, losses = 0, closed = 0, started = false;
  const applied = [], trades = [], log = [];
  const open = (side, t, px) => ({ id: sym + ':' + side + ':' + t, side, entry_t: t, entry: px, qty: cfg.size / px, left: cfg.size / px, realized: 0, legs: [] });
  function closePart(q, t, px, why, nonce) {
    q = Math.min(q, pos.left);
    const net = pos.entry * q * (Math.max(0, 1 + pos.side * (px / pos.entry - 1)) * Math.pow(1 - f, 2) - 1);   // stratlab.js fee formula
    pos.legs.push({ t, px: r(px), pct: r(100 * q / pos.qty), usd: r(net), why, nonce: nonce || null });
    pos.left = Math.max(0, pos.left - q); pos.realized += net; realized += net;
    log.push({ sym, trade_id: pos.id, t, px: r(px), action: why, usd: r(net), remaining_pct: r(100 * pos.left / pos.qty) });
    if (pos.left < pos.qty * 1e-9) {
      closed++; if (pos.realized > 0) wins++; else losses++;
      trades.push({ id: pos.id, side: pos.side, entry_t: pos.entry_t, entry: r(pos.entry), exit_t: t, exit: r(px), usd: r(pos.realized), ret: r(pos.realized / cfg.size * 100), reason: why, legs: pos.legs });
      pos = null;
    }
  }
  let lastPrice = null, lastClose = null, lastSignal = 0;
  for (let i = 0; i < B.t.length; i++) {
    const t = B.t[i] + H4, px = B.c[i], target = sig[i];
    if (t < start) continue;
    if (!started) {                       // fresh start: the regime standing at the start is not joined
      started = true;
      if (!cfg.join_open_regime) {
        if (t === start) { blocked = target; lastPrice = px; lastClose = t; lastSignal = target; continue; }
        blocked = i > 0 ? sig[i - 1] : 0;   // a candle is missing at the start: block what stood before it
      }
    }
    lastPrice = px; lastClose = t; lastSignal = target;
    if (blocked && target !== blocked) blocked = 0;
    if (pos && pos.side !== target) closePart(pos.left, t, px, 'signal_exit', null);
    if (!pos && target && target !== blocked) pos = open(target, t, px);
    for (const e of byTime.get(t) || []) {
      if (!pos || e.trade_id !== pos.id) throw new Error('Manual action no longer matches the open trade ' + sym + ' ' + e.nonce);
      if (e.kind !== 'close' && e.kind !== 'book') throw new Error('Unknown manual action');
      const pct = e.kind === 'close' ? 100 : e.percent;
      if (e.kind === 'book' && !(Number.isInteger(pct) && pct >= 1 && pct <= 99)) throw new Error('Book % must be 1-99');
      if (e.kind === 'book' && !(pos.side * (px / pos.entry - 1) > 0)) throw new Error('Cannot book profit on a losing trade');
      const side = pos.side;
      closePart(pos.left * pct / 100, t, px, e.kind === 'close' ? 'manual_close' : 'profit_booking', e.nonce);
      applied.push(e.nonce);
      if (!pos) blocked = side;
    }
  }
  for (const e of events) if (e.sym === sym && !applied.includes(e.nonce)) throw new Error('Manual action not applied ' + e.nonce);
  const floating = pos ? pos.entry * pos.left * (Math.max(0, 1 + pos.side * (lastPrice / pos.entry - 1)) * (1 - f) - 1) : 0;
  const cur = pos ? { id: pos.id, side: pos.side, entry_t: pos.entry_t, entry: r(pos.entry), left_pct: r(pos.left / pos.qty * 100),
    mark: r(lastPrice), unrealized: r(floating), booked: r(pos.realized), legs: pos.legs } : null;
  return { sym, price: r(lastPrice), last_close: lastClose, signal: lastSignal, blocked_side: blocked, open: cur, closed, wins, losses,
    realized: r(realized), unrealized: r(floating), net: r(realized + floating), trades: trades.slice(-100), manual_log: log.slice(-100), applied };
}

function compute(md, events) {
  const sc = rd(path.join(ROOT, 'config', 'start.json')), cfg = rd(path.join(ROOT, 'config', 'paper.json')).s083, now = nowS();
  const base = { generated: new Date(now * 1000).toISOString(), strategy: cfg.id, name: cfg.name, start: sc.start, size: cfg.size,
    fee_pct_each_side: cfg.fee, params: cfg.params, order: cfg.coins, join_open_regime: !!cfg.join_open_regime, event_count: events.length };
  if (sc.start === 'auto' || now < sc.start) {
    if (events.length) throw new Error('Manual actions exist before the start');
    return { ...base, started: false };
  }
  const coins = {}, all = { realized: 0, unrealized: 0, net: 0, closed: 0, wins: 0, losses: 0, open: 0 };
  for (const e of events) if (!(e.t > sc.start)) throw new Error('Manual action before the start ' + e.nonce);
  for (const sym of cfg.coins) {
    const a = runCoin(sym, bars(md, sym), cfg, sc.start, events); coins[sym] = a;
    for (const k of ['realized', 'unrealized', 'net', 'closed', 'wins', 'losses']) all[k] += a[k];
    if (a.open) all.open++;
  }
  for (const k of ['realized', 'unrealized', 'net']) all[k] = r(all[k]);
  return { ...base, started: true, coins, summary: all };
}

function main() {
  const md = path.resolve(process.argv[2] || '../market-data'), events = rd(path.join(ROOT, 'state', 'manual', 'events.json'));
  if (!Array.isArray(events)) throw new Error('Invalid s083 manual journal');
  const out = compute(md, events), f = path.join(ROOT, 'public', 's083-paper.json');
  fs.writeFileSync(f + '.tmp', JSON.stringify(out)); fs.renameSync(f + '.tmp', f);
  console.log('s083-paper.json: ' + (out.started ? out.summary.open + ' open, ' + out.summary.closed + ' closed, net ' + out.summary.net : 'not started'));
}
if (require.main === module) { try { main(); } catch (e) { console.error('::error::' + (e.message || e) + ' (last good s083-paper.json kept)'); process.exit(1); } }
module.exports = { bars, runCoin, compute };
