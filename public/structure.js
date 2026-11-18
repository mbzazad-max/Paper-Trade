/* Market structure on closed 4H candles (added 15 Nov 2026 at the owner's request; the same rules as the BTC & ETH
   dashboard's build/structure.js): liquidity sweep -> market structure shift (MSS) with displacement -> entry on the
   fair value gap (FVG) the displacement left behind. Works in the browser and in node. Not part of the original engine.

   Bullish MSS (a buy signal; the bearish one is the exact mirror and is used for trims, never for shorts):
     1. Swings     fractal pivots with K = 3 candles each side, usable only once the 3 candles after them have closed.
     2. Bearish structure: the last swing high before the break is a LOWER high, so breaking it is a shift.
     3. Sweep      the lowest low between that lower high and the break took out an earlier swing low (liquidity).
     4. Shift      a 4H candle CLOSES above that lower high (the first close above it).
     5. Displacement: the leg from the sweep to the break leaves a bullish FVG (gap >= 0.1 x ATR), or the breaking
                   candle's body is >= 1.2 x 4H ATR(14).
     Entry         the middle of the newest FVG in that leg; with no FVG, a retest of the broken lower high.
     Stop          the sweep low minus 0.25 x 4H ATR.
     Active        for 30 4H candles (5 days), until a 4H close below the sweep low or an opposite MSS.

   simMss: the Top 20 P&L paper test's own money rules (pnl.js: fixed size, fee each side, half off at T1 and stop to
   breakeven, rest at T2, stop checked first) with a different ENTRY: only after a bullish MSS whose sweep low reached
   the board's buy zone (at or below the zone top + 0.25 ATR), limit buy at the MSS entry for up to 12 candles, stop
   below the sweep low. Targets are the board's T1 and T2 that sit at least 1R above the entry (none: no trade).
   Closed candles only. Rules of thumb, spot only, not financial advice. */
(function(root){
'use strict';
const K = 3, EXPIRY = 30, SL_ATR = 0.25, DISP_ATR = 1.2, GAP_ATR = 0.1;

function atrSeries(B, n = 14) {                          // Wilder ATR, same as the page; out[i] = ATR at candle i (null early)
  const { h, l, c } = B, out = new Array(c.length).fill(null);
  if (c.length < n + 1) return out;
  let a = 0;
  for (let i = 0; i < c.length; i++) {
    const tr = i ? Math.max(h[i] - l[i], Math.abs(h[i] - c[i - 1]), Math.abs(l[i] - c[i - 1])) : h[i] - l[i];
    if (i < n) { a += tr; if (i === n - 1) out[i] = a / n; continue; }
    out[i] = (out[i - 1] * (n - 1) + tr) / n;
  }
  return out;
}

// every MSS in the series, both directions, in the order they were confirmed
function detect(B) {
  const { o, h, l, c } = B, n = c.length, A = atrSeries(B), ev = [];
  const PH = [], PL = [];                                // confirmed pivots [index, price], in order of confirmation
  let usedH = -1, usedL = -1;                            // pivot already broken (one MSS per swing)
  for (let j = 2 * K; j < n; j++) {
    const p = j - K;                                     // a pivot at p is confirmed once candle j = p + K has closed
    let isH = true, isL = true;
    for (let q = p - K; q <= p + K; q++) { if (h[q] > h[p]) isH = false; if (l[q] < l[p]) isL = false; }
    if (isH) PH.push([p, h[p]]);
    if (isL) PL.push([p, l[p]]);
    const a = A[j]; if (a == null) continue;
    for (const dir of [1, -1]) {
      const P = dir > 0 ? PH : PL, Q = dir > 0 ? PL : PH;
      if (P.length < 2) continue;
      const [hi, hp] = P[P.length - 1], prevP = P[P.length - 2][1];
      if ((dir > 0 ? usedH : usedL) === hi) continue;
      if (dir > 0 ? !(hp < prevP) : !(hp > prevP)) continue;                    // 2. lower high / higher low
      if (dir > 0 ? !(c[j] > hp && c[j - 1] <= hp) : !(c[j] < hp && c[j - 1] >= hp)) continue;   // 4. first close through
      let s = hi + 1;                                    // 3. the extreme of the leg between the swing and the break
      for (let q = hi + 1; q < j; q++) if (dir > 0 ? l[q] < l[s] : h[q] > h[s]) s = q;
      if (s >= j) continue;
      const sweepPx = dir > 0 ? l[s] : h[s];
      const prior = Q.filter(([qi]) => qi < s && qi + K <= s);
      if (!prior.length) continue;
      const lastQ = prior[prior.length - 1][1];
      if (dir > 0 ? !(sweepPx < lastQ) : !(sweepPx > lastQ)) continue;
      let gap = null;                                    // 5. newest FVG with its middle candle in the leg
      for (let i = Math.max(s + 1, 1); i <= j && i + 1 <= n - 1 && i + 1 <= j + 1; i++) {
        const lo = dir > 0 ? h[i - 1] : h[i + 1], hiG = dir > 0 ? l[i + 1] : l[i - 1];
        if (hiG - lo >= GAP_ATR * a) gap = { lo, hi: hiG, at: i + 1 };
      }
      const body = dir > 0 ? c[j] - o[j] : o[j] - c[j];
      if (!gap && !(body >= DISP_ATR * a)) continue;
      const conf = gap ? Math.max(j, gap.at) : j;
      const entry = gap ? (gap.lo + gap.hi) / 2 : hp;
      ev.push({ dir, swing_i: hi, level: hp, sweep_i: s, sweep: sweepPx, break_i: j, conf_i: conf, atr: a,
        fvg: gap ? { lo: gap.lo, hi: gap.hi } : null, entry, stop: sweepPx - dir * SL_ATR * a });
      if (dir > 0) usedH = hi; else usedL = hi;
    }
  }
  return ev.sort((x, y) => x.conf_i - y.conf_i);
}

// the MSS of direction dir still standing at candle `at` (default: the last closed candle), or null
function activeAt(B, ev, dir, at) {
  const { c } = B; at = at == null ? c.length - 1 : at;
  const mine = ev.filter((e) => e.dir === dir && e.conf_i <= at && at - e.conf_i < EXPIRY);
  for (let k = mine.length - 1; k >= 0; k--) {
    const e = mine[k];
    if (ev.some((x) => x.dir === -dir && x.conf_i > e.conf_i && x.conf_i <= at)) continue;   // an opposite shift came later
    let failed = false;
    for (let i = e.conf_i; i <= at; i++) if (dir > 0 ? c[i] < e.sweep : c[i] > e.sweep) { failed = true; break; }
    if (!failed) return Object.assign({}, e, { age: at - e.conf_i });
  }
  return null;
}


const H4 = 14400, FILL_WAIT = 12, ZONE_ATR = 0.25;
const okSnap = (s) => !!(s && !s.none && s.entry != null && s.stop != null && s.hi != null);
// B: full 4H bars {t,o,h,l,c} (history before R.start is used only to find structure). snaps: board advice [{t,entry,stop,t1,t2,lo,hi}]
function simMss(sym, snaps, B, R, mark, ev) {
  const S = (snaps || []).slice().sort((a, b) => a.t - b.t), T = [], fee = R.fee / 100, n = B.t.length;
  ev = ev || detect(B);
  const at = {}; for (const e of ev) if (e.dir > 0) (at[e.conf_i] = at[e.conf_i] || []).push(e);
  const cur = (t) => { let s = null; for (const x of S) { if (x.t > t) break; s = x; } return s; };
  let pos = null, pend = null, realized = 0;
  const fin = (t, why) => { let g = 0, fe = pos.size * fee; for (const L of pos.legs) { g += L.q * (L.px - pos.px); fe += L.q * L.px * fee; }
    pos.pnl = g - fe; pos.ret = pos.pnl / pos.size * 100; pos.exitT = t; pos.out = why; pos.exitPx = pos.legs.reduce((a, L) => a + L.q * L.px, 0) / pos.qty;
    pos.res = pos.pnl > 0 ? 'W' : pos.pnl < 0 ? 'L' : 'BE'; pos.r = pos.pnl / (pos.size * (pos.px - pos.stop) / pos.px); realized += pos.pnl; T.push(pos); pos = null; };
  const close = (px, t, why) => { pos.legs.push({ px, q: pos.qty * pos.left, t, why }); pos.left = 0; fin(t, why); };
  for (let i = 0; i < n; i++) {
    const t = B.t[i], o = B.o[i], h = B.h[i], l = B.l[i];
    if (t >= R.start && t < R.end) {
      let fresh = false;
      if (!pos && pend && i <= pend.until && l <= pend.entry) {
        const px = Math.min(pend.entry, o);
        if (px > pend.stop) { pos = { sym, mssT: pend.t, entryT: t, px, lim: pend.entry, stop: pend.stop, cs: pend.stop, t1: pend.t1, t2: pend.t2, size: R.size, qty: R.size / px, left: 1, half: false, legs: [] }; fresh = true; }
        pend = null;
      }
      if (pend && i > pend.until) pend = null;
      if (pos) {
        if (l <= pos.cs) close(Math.min(pos.cs, o), t, pos.half ? 'stop at breakeven after T1' : 'stop');
        else if (!fresh || o <= pos.px) {
          if (!pos.half && h >= pos.t1) {
            if (pos.t2 == null) close(pos.t1, t, 'T1');
            else { pos.legs.push({ px: pos.t1, q: pos.qty * 0.5, t, why: 'T1' }); pos.left = 0.5; pos.half = true; pos.cs = pos.px; if (h >= pos.t2) close(pos.t2, t, 'T1 + T2'); }
          } else if (pos.half && h >= pos.t2) close(pos.t2, t, 'T1 + T2');
        }
      }
    }
    // a shift confirmed at this candle's close becomes a pending order for the next candles
    if (!pos && at[i] && B.t[i] + H4 >= R.start && B.t[i] + H4 < R.end) {
      const s = cur(B.t[i] + H4);
      if (okSnap(s)) for (const e of at[i]) {
        if (e.sweep > s.hi + ZONE_ATR * e.atr) continue;            // the sweep never reached the buy zone
        const risk = e.entry - e.stop, tg = [s.t1, s.t2].filter((x) => x != null && x - e.entry >= risk).sort((a, b) => a - b);
        if (!(risk > 0) || !tg.length) continue;                    // no board target at least 1R away
        pend = { t: B.t[i] + H4, until: i + FILL_WAIT, entry: e.entry, stop: e.stop, t1: tg[0], t2: tg[1] == null ? null : tg[1], level: e.level, sweep: e.sweep, fvg: e.fvg }; break;
      }
    }
  }
  let open = null;
  if (pos) { const px = mark != null ? mark : B.c[n - 1]; let g = 0; for (const L of pos.legs) g += L.q * (L.px - pos.px); g += pos.qty * pos.left * (px - pos.px);
    pos.mark = px; pos.pnl = g - (pos.size * fee + pos.qty * pos.left * px * fee); pos.ret = pos.pnl / pos.size * 100; open = pos; }
  return { sym, trades: T, open, pending: open ? null : pend, realized };
}
function summary(coins, size) {
  const all = [].concat(...coins.map((c) => c.trades)), W = all.filter((x) => x.res === 'W'), L = all.filter((x) => x.res === 'L');
  const gw = W.reduce((a, x) => a + x.pnl, 0), gl = -L.reduce((a, x) => a + x.pnl, 0), openP = coins.reduce((a, c) => a + (c.open ? c.open.pnl : 0), 0);
  const best = all.length ? Math.max(...all.map((x) => x.pnl)) : 0;
  return { closed: all.length, wins: W.length, losses: L.length, win_rate: all.length ? W.length / all.length * 100 : null, realized: gw - gl, open: coins.filter((c) => c.open).length, open_pnl: openP,
    net: gw - gl + openP, avg_ret: all.length ? (gw - gl) / all.length / size * 100 : null, avg_ret_ex_best: all.length > 1 ? (gw - gl - best) / (all.length - 1) / size * 100 : null,
    best_ret: all.length ? best / size * 100 : null, pf: gl > 0 ? gw / gl : (gw > 0 ? null : null), pending: coins.filter((c) => c.pending).length };
}
const api = { detect, activeAt, atrSeries, simMss, summary, K, EXPIRY, SL_ATR, DISP_ATR, GAP_ATR, FILL_WAIT, ZONE_ATR };
if (typeof module !== 'undefined') module.exports = api; else root.STRUCT = api;
})(typeof window !== 'undefined' ? window : globalThis);
