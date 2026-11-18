/* Structure layer for Coin Zones (added 15 Nov 2026 at the owner's request). Runs after build/build.js and never
   changes the board, the engine files or the original P&L test. It writes public/structure.json with:

     coins   for every coin on the board: the standing bullish / bearish 4H market structure shift (public/structure.js)
             and a plain verdict against the board's own buy zone (spot_setup.basis) and 1D sell zone.
     live    the Top 20 P&L paper test replayed with the MSS entry (same advice snapshots, window, size and fee),
             next to the original test's numbers.
     history both ways of buying replayed since 1 Jan 2025 for the cohort coins (26 since 16 Nov 2026). The advice for each day is what
             the ORIGINAL engine (public/engine.js, unchanged) gives on the candles closed by the end of that UTC day
             (last 1000 4H, last 1200 1D, as the board build uses). "Zone only" is the original pnl.js simulator on
             those daily snapshots; "zone + MSS" is STRUCT.simMss. Day advice never changes, so it is kept by month in
             history/plans/ and only new days are worked out (thrown away if the engine changes).
   Past results do not promise future ones. Spot only; not financial advice.

   usage: node build/structure.js <market-data dir> [--from YYYY-MM-DD]
   If anything fails the script warns and exits 0, so the board still deploys (the page then shows no structure cards). */
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const ROOT = path.resolve(__dirname, '..'), PUB = path.join(ROOT, 'public'), ST = path.join(ROOT, 'state', 'pnl'), HIST = path.join(ROOT, 'history', 'plans');
const ZE = require(path.join(PUB, 'engine.js')), PNL = require(path.join(PUB, 'pnl.js')), STRUCT = require(path.join(PUB, 'structure.js'));
const DAY = 86400, H4 = 14400, FROM_DEFAULT = '2025-01-01';
const rd = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const wr = (f, o) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, JSON.stringify(o)); };
const sig = (v) => (v == null || !isFinite(v) ? null : Number(v.toPrecision(7)));
const dayOf = (t) => new Date(t * 1000).toISOString().slice(0, 10);

function main() {
  const MD = path.resolve(process.argv[2] || '../market-data');
  const fi = process.argv.indexOf('--from'), FROM = fi > 0 ? process.argv[fi + 1] : FROM_DEFAULT;
  const cfg = rd(path.join(ROOT, 'config', 'board.json')), board = rd(path.join(PUB, 'data.json'));
  const load = (id) => {
    const [src, sym, tf] = id.split('/'), f = path.join(MD, 'data', src, `${sym}_${tf}.csv`); if (!fs.existsSync(f)) return null;
    const L = fs.readFileSync(f, 'utf8').trim().split('\n'); L.shift();
    const B = { t: [], o: [], h: [], l: [], c: [], v: [] };
    for (const ln of L) { const p = ln.split(','); B.t.push(+p[0]); B.o.push(+p[1]); B.h.push(+p[2]); B.l.push(+p[3]); B.c.push(+p[4]); B.v.push(+p[5]); }
    return B;
  };
  const cut = (B, a, b) => { const o = {}; for (const k of 'tohlcv') o[k] = B[k].slice(a, b); return o; };
  const bars = {};
  for (const c of cfg.coins) { const B4 = load(c.series_4h), Bd = load(c.series_1d); if (B4 && Bd && B4.t.length >= 60) bars[c.sym] = { B4, Bd, c }; }

  // ---- 1. where each coin's 4H structure stands now ----
  const coins = {};
  for (const row of board.coins) {
    const b = bars[row.sym], ss = row.spot_setup; if (!b || !ss) continue;
    const B = cut(b.B4, -1000), ev = STRUCT.detect(B);
    const pack = (e) => e && { level: sig(e.level), sweep: sig(e.sweep), entry: sig(e.entry), stop: sig(e.stop), fvg: e.fvg ? [sig(e.fvg.lo), sig(e.fvg.hi)] : null, at: B.t[e.conf_i] + H4, age: e.age, atr: sig(e.atr) };
    const bull = STRUCT.activeAt(B, ev, 1), bear = STRUCT.activeAt(B, ev, -1);
    const zone = ss.basis || null, sell = ss.zones && ss.zones['1D'] && ss.zones['1D'].sell || null, px = B.c[B.c.length - 1];
    let buy, why;
    if (!zone) { buy = 'NO ZONE'; why = 'The board has no buy zone for this coin right now.'; }
    else if (bull && bull.sweep <= zone.hi + STRUCT.ZONE_ATR * bull.atr) {
      const risk = bull.entry - bull.stop, tg = [ss.t1, ss.t2].filter((x) => x != null && x - bull.entry >= risk);
      buy = tg.length ? 'BUY' : 'NO ROOM'; why = tg.length ? 'Structure has shifted up from the buy zone.' : 'Structure has shifted up from the buy zone, but the board has no target at least 1R above the entry.';
    } else if (bull) { buy = 'WAIT'; why = 'Structure shifted up, but the sweep before it never reached the buy zone.'; }
    else { buy = 'WAIT'; why = bear ? 'No bullish shift: 4H structure last shifted down.' : 'No bullish 4H structure shift in the last 5 days.'; }
    const trim = !!(bear && sell && bear.sweep >= sell.lo - STRUCT.ZONE_ATR * bear.atr);
    coins[row.sym] = { price: sig(px), buy, why, bull: pack(bull), bear: pack(bear), trim, zone: zone ? [sig(zone.lo), sig(zone.hi)] : null, sell: sell ? [sig(sell.lo), sig(sell.hi)] : null, t1: sig(ss.t1), t2: sig(ss.t2) };
  }

  // ---- 1b. the same 4H structure shift on the market gauges (added 15 Nov 2026 at the owner's request) ----
  // Gauges have no buy zone, so there is no buy / wait verdict: only which way 4H structure last shifted and what that
  // means for crypto. Series and scaling match series.js buildGauges (GDEF there is not exported, so it is mirrored here).
  let gauges = null;
  try { gauges = gaugeStructure(cfg, load, cut, MD); } catch (e) { console.log('::warning::Gauge structure skipped: ' + (e && e.message || e)); }

  // ---- 2. the running paper test, with the MSS entry ----
  let live = null;
  if (fs.existsSync(path.join(ST, 'cfg.json'))) {
    const pc = rd(path.join(ST, 'cfg.json')), R = { start: pc.start, end: pc.end, size: pc.size, fee: pc.fee }, st = { cfg: pc, snaps: {}, bars: {} }, mss = [];
    for (const sym of pc.cohort) {
      const sf = path.join(ST, `s_${sym}.json`), bf = path.join(ST, `b_${sym}.json`);
      if (fs.existsSync(sf)) st.snaps[sym] = rd(sf); if (fs.existsSync(bf)) st.bars[sym] = rd(bf);
      if (bars[sym] && st.snaps[sym]) mss.push(STRUCT.simMss(sym, st.snaps[sym].snaps, cut(bars[sym].B4, -1000), R));
    }
    // The page's Top 20 P&L now buys only when BOTH agree: the board's buy zone and a 4H structure shift from it
    // (owner's choice, 15 Nov 2026). The original pnl.js is unchanged: it is handed advice that says "no order" until
    // a shift from the zone is confirmed, then that shift's entry, stop and the board's targets for 12 candles.
    // state/pnl keeps the board's own advice untouched; only the public/pnl.json the page reads is rewritten here.
    const NOW = Math.floor(Date.now() / 1000), pub = rd(path.join(PUB, 'pnl.json'));
    for (const sym of pc.cohort) {
      if (!bars[sym] || !st.snaps[sym]) continue;
      const B = cut(bars[sym].B4, -1000), S = (st.snaps[sym].snaps || []).slice().sort((a, b) => a.t - b.t), orders = [];
      for (const e of STRUCT.detect(B)) {
        if (e.dir < 0) continue;
        const tc = B.t[e.conf_i] + H4; if (tc < pc.start || tc >= pc.end || tc > NOW) continue;
        let a = null; for (const x of S) { if (x.t > tc) break; a = x; }
        if (!a || a.none || a.entry == null || a.hi == null) continue;                      // no buy zone on the board then
        if (e.sweep > a.hi + STRUCT.ZONE_ATR * e.atr) continue;                              // the sweep never reached the zone
        const risk = e.entry - e.stop, tg = [a.t1, a.t2].filter((x) => x != null && x - e.entry >= risk).sort((x, y) => x - y);
        if (!(risk > 0) || !tg.length) continue;                                             // no board target at least 1R away
        const t1 = tg[0], t2 = tg[1] == null ? tg[0] : tg[1];                                // one target only: all out there
        orders.push({ t: tc, entry: e.entry, stop: e.stop, t1, t2, rr1: (t1 - e.entry) / risk, rr2: (t2 - e.entry) / risk, lo: a.lo, hi: a.hi, state: 'MSS BUY' });
      }
      const out = [{ t: pc.start, none: true, state: 'WAIT: NO STRUCTURE SHIFT' }];
      orders.forEach((o, k) => { out.push(o); const exp = o.t + STRUCT.FILL_WAIT * H4, nx = orders[k + 1]; if (!nx || nx.t > exp) out.push({ t: exp, none: true, state: 'WAIT: NO STRUCTURE SHIFT' }); });
      pub['s_' + sym] = { sym, snaps: out.filter((x) => x.t <= NOW) };
    }
    pub.cfg = Object.assign({}, pc, { entry_rule: 'buy zone + 4H structure shift (both must agree)' });
    wr(path.join(PUB, 'pnl.json'), pub);
    const chk = PNL.run({ cfg: pc, snaps: Object.fromEntries(pc.cohort.map((s) => [s, pub['s_' + s]])), bars: st.bars }, {}).sum;
    const o = PNL.run(st, {}).sum, tr = (x) => ({ sym: x.sym, entryT: x.entryT, px: sig(x.px), stop: sig(x.stop), t1: sig(x.t1), t2: sig(x.t2), exitT: x.exitT || null, exitPx: sig(x.exitPx), out: x.out || null, pnl: sig(x.pnl), ret: sig(x.ret), half: !!x.half });
    live = { rule: 'both', page: { closed: chk.closed, wins: chk.wins, losses: chk.losses, net: sig(chk.net), open: chk.open, pending: chk.pending }, start: pc.start, end: pc.end, size: pc.size, fee: pc.fee,
      zone: { closed: o.closed, wins: o.wins, losses: o.losses, win_rate: o.winRate, realized: sig(o.realized), open: o.open, open_pnl: sig(o.openPnl), net: sig(o.net), pending: o.pending },
      mss: STRUCT.summary(mss, pc.size), trades: [].concat(...mss.map((c) => c.trades.map(tr))).sort((a, b) => a.entryT - b.entryT),
      open: mss.filter((c) => c.open).map((c) => tr(c.open)),
      pending: mss.filter((c) => c.pending).map((c) => ({ sym: c.sym, entry: sig(c.pending.entry), stop: sig(c.pending.stop), t1: sig(c.pending.t1), t2: sig(c.pending.t2), since: c.pending.t })) };
  }

  // ---- 3. both ways since FROM, on the original engine's advice for each closed day ----
  const cohort = live ? rd(path.join(ST, 'cfg.json')).cohort : cfg.coins.map((c) => c.sym);
  const engineHash = crypto.createHash('sha256').update(fs.readFileSync(path.join(PUB, 'engine.js'))).update(JSON.stringify(cfg.bars)).digest('hex').slice(0, 16);
  const lastClose = Math.min(...cohort.filter((s) => bars[s]).map((s) => bars[s].B4.t[bars[s].B4.t.length - 1] + H4));
  const lastDay = dayOf(lastClose - DAY), from = Date.parse(FROM + 'T00:00:00Z') / 1000;
  const months = {}, monthFile = (m) => path.join(HIST, m + '.json');
  const getMonth = (m) => { if (!months[m]) { const f = monthFile(m); months[m] = fs.existsSync(f) ? rd(f) : null; if (!months[m] || months[m].engine !== engineHash) months[m] = { engine: engineHash, days: {}, dirty: true }; } return months[m]; };
  const COLS = ['entry', 'stop', 't1', 't2', 'rr1', 'rr2', 'lo', 'hi'];
  let made = 0;
  for (let t = from - DAY; dayOf(t) <= lastDay; t += DAY) {            // the day before FROM gives the advice for FROM's first candle
    const D = dayOf(t), M = getMonth(D.slice(0, 7)), end = t + DAY;
    if (M.days[D]) continue;
    const row = {};
    for (const sym of cohort) {
      const b = bars[sym]; if (!b) continue;
      let i4 = b.B4.t.length; while (i4 > 0 && b.B4.t[i4 - 1] + H4 > end) i4--;
      let id = b.Bd.t.length; while (id > 0 && b.Bd.t[id - 1] + DAY > end) id--;
      if (i4 < 60 || id < 2) continue;
      try {
        const n = ZE.buildCoin(sym, cut(b.B4, Math.max(0, i4 - cfg.bars.coin_4h), i4), cut(b.Bd, Math.max(0, id - cfg.bars.coin_1d), id), b.c.spot_symbol, b.c.fut_symbol);
        const s = PNL.snap(end, n.spot_setup); if (!s.none) row[sym] = COLS.map((k) => sig(s[k]));
      } catch (e) { /* no advice that day */ }
    }
    M.days[D] = row; M.dirty = true; made++;
  }
  for (const [m, M] of Object.entries(months)) if (M.dirty) { delete M.dirty; wr(monthFile(m), M); }
  const R = { start: from, end: lastClose, size: 1000, fee: 0.1 }, zs = [], ms = [], per = {};
  for (const sym of cohort) {
    const b = bars[sym]; if (!b) continue;
    const snaps = [];
    for (const M of Object.values(months)) for (const [D, row] of Object.entries(M.days)) if (row[sym]) { const s = { t: Date.parse(D + 'T00:00:00Z') / 1000 + DAY }; COLS.forEach((k, i) => { s[k] = row[sym][i]; }); snaps.push(s); }
    let i0 = b.B4.t.findIndex((t) => t >= from); if (i0 < 0) continue;
    let i1 = b.B4.t.length; while (i1 > 0 && b.B4.t[i1 - 1] + H4 > lastClose) i1--;
    const z = PNL.simCoin(sym, snaps, cut(b.B4, i0, i1), R, {}), m = STRUCT.simMss(sym, snaps, cut(b.B4, Math.max(0, i0 - 300), i1), R);
    zs.push(z); ms.push(m); per[sym] = { zone: STRUCT.summary([z], R.size), mss: STRUCT.summary([m], R.size) };
  }
  const round = (o) => { for (const k of Object.keys(o)) if (typeof o[k] === 'number') o[k] = sig(o[k]); return o; };
  Object.values(per).forEach((p) => { round(p.zone); round(p.mss); });
  const history = { from: FROM, to: lastDay, size: R.size, fee: R.fee, coins_n: zs.length, zone: round(STRUCT.summary(zs, R.size)), mss: round(STRUCT.summary(ms, R.size)), per };
  if (live) round(live.mss);

  wr(path.join(PUB, 'structure.json'), { generated: board.meta.generated, coins, gauges, live, history });
  console.log(JSON.stringify({ coins: Object.keys(coins).length, gauges: gauges && Object.fromEntries(Object.entries(gauges.market).map(([k, v]) => [k, v.read])), days_worked_out: made, live: live && { zone: live.zone, mss: live.mss }, history: { zone: history.zone, mss: history.mss } }, null, 1));
}

// Monitor only: gauges cannot be bought or sold, so there is no entry, stop, target or P&L test for them.
// up/down: what a shift that way means for crypto. vote: +1 when an up shift is risk-on for crypto, -1 when it is
// risk-off (stablecoin dominance), 0 when the gauge is context only and does not count in the market read.
const GAUGE_DEF = [
  ['TOTAL2ES', ['T2'], (R) => R.T2 && scaleB(R.T2, 1e-9), 1, 'Money flowing into altcoins (ex ETH)', 'Money leaving altcoins (ex ETH)'],
  ['TOTAL3ES', ['T3'], (R) => R.T3 && scaleB(R.T3, 1e-9), 1, 'Money flowing into small altcoins', 'Money leaving small altcoins'],
  ['TOTAL', ['TOT'], (R) => R.TOT && scaleB(R.TOT, 1e-9), 1, 'Whole crypto market turning up', 'Whole crypto market turning down'],
  ['USDT.D+USDC.D', ['USDT', 'USDC'], (R, S) => S.S_dom, -1, 'Money moving into stablecoins: risk-off for crypto', 'Money leaving stablecoins for coins: risk-on for crypto'],
  ['ETHBTC', ['ETHBTC'], (R) => R.ETHBTC, 0, 'ETH gaining on BTC (alt rotation)', 'BTC leading ETH']];
function scaleB(B, f) { const o = {}; for (const k of 'tohlcv') o[k] = 'ohlc'.includes(k) ? B[k].map((x) => x * f) : B[k].slice(); return o; }
// Timeframes (owner's request, 15 Nov 2026): 4H as loaded and 1D made from the 4H candles (complete days only). Same MSS
// rules on each; a shift stands 30 candles of its own timeframe (5 days, 30 days) unless price closes back through the
// sweep or an opposite shift comes.
const GTF = [['4H', H4], ['1D', DAY]];
function gaugeBars(cfg, load, cut, map, n) {
  const SR = require(path.join(PUB, 'series.js')), R = {};
  for (const [k, id] of Object.entries(map || {})) { const B = load(id); if (B) R[k] = cut(B, -n); }
  return { R, S: SR.compose(R) };
}
function toDays(B4, fetched) {
  const D = ZE.resample(B4, ZE.day); if (!D.t.length) return D;
  const lastClose = B4.t[B4.t.length - 1] + H4, lastDay = D.t[D.t.length - 1];
  // a day counts once its last 4H candle has closed, or once the data was fetched after the day ended
  // (for a market that stops trading before midnight UTC, whose last candle closes early)
  if (lastClose < lastDay + DAY && !(fetched >= lastDay + DAY)) for (const k of 'tohlcv') D[k] = D[k].slice(0, -1);
  return D;
}
function gaugeStructure(cfg, load, cut, MD) {
  let man = {}; try { man = rd(path.join(MD, 'manifest.json')).series || {}; } catch (e) { /* no fetch times: open days are dropped */ }
  const src = gaugeBars(cfg, load, cut, cfg.gauges.series, cfg.bars.gauge_4h);
  const pack = (B, e, P) => e && { dir: e.dir, level: sig(e.level), sweep: sig(e.sweep), fvg: e.fvg ? [sig(e.fvg.lo), sig(e.fvg.hi)] : null, at: B.t[e.conf_i] + P, age: e.age, atr: sig(e.atr) };
  const list = {}, market = {};
  for (const [sym, keys, make, vote, upTxt, dnTxt] of GAUGE_DEF) {
    const row = { price: null, context: !vote, tf: {} };
    for (const [tf, P] of GTF) {
      const S = src;
      if (!keys.every((k) => S.R[k])) continue;
      let full = make(S.R, S.S); if (!full) continue;
      if (tf === '1D') full = toDays(full, Math.min(...keys.map((k) => (man[cfg.gauges.series[k]] || {}).fetched_at || 0)));
      if (full.c.length < 60) continue;
      const B = cut(full, -1000), ev = STRUCT.detect(B), n = B.c.length;
      const bull = STRUCT.activeAt(B, ev, 1), bear = STRUCT.activeAt(B, ev, -1);
      const now = bull && bear ? (bull.conf_i >= bear.conf_i ? bull : bear) : bull || bear;
      const lastE = ev.length ? ev[ev.length - 1] : null, last = lastE && Object.assign({}, lastE, { age: n - 1 - lastE.conf_i });
      const crypto = now && vote ? now.dir * vote : 0;
      row.tf[tf] = { state: now ? (now.dir > 0 ? 'BULLISH' : 'BEARISH') : 'NONE', read: now ? (now.dir > 0 ? upTxt : dnTxt) : 'No ' + tf + ' structure shift standing.',
        crypto: vote ? crypto : null, price: sig(B.c[n - 1]), asof: B.t[n - 1] + P,
        bull: pack(B, bull, P), bear: pack(B, bear, P), last: last && !now ? pack(B, last, P) : null };
      if (tf === '4H') row.price = row.tf[tf].price;
    }
    if (Object.keys(row.tf).length) list[sym] = row;
  }
  for (const [tf] of GTF) {
    const votes = GAUGE_DEF.filter((g) => g[3] && list[g[0]] && list[g[0]].tf[tf]).map((g) => ({ sym: g[0], v: list[g[0]].tf[tf].crypto }));
    if (!votes.length) continue;
    const on = votes.filter((x) => x.v > 0).map((x) => x.sym), off = votes.filter((x) => x.v < 0).map((x) => x.sym);
    market[tf] = { read: on.length && !off.length ? 'RISK-ON' : off.length && !on.length ? 'RISK-OFF' : on.length && off.length ? 'MIXED' : 'NO SHIFT', on, off, counted: votes.map((x) => x.sym) };
  }
  return { tfs: GTF.map((x) => x[0]).filter((tf) => market[tf]), market, list };
}

try { main(); } catch (e) { console.log('::warning::Structure layer skipped: ' + (e && e.stack || e)); process.exit(0); }
