/* Paper-Trade ledgers with the owner's manual actions. Written for Paper-Trade on 18 Nov 2026.

   TOP 20 (tabs 01 and 02). runTop20(state, actions) follows the Coin Zones test in public/pnl.js (unchanged, checksummed)
   step by step: limit buy at the advice entry on a 4H candle whose low reaches it (filled at the entry or the open if
   lower), stop checked first, half at T1 with the stop moved to the entry, the rest at T2, fee on every fill, a new order
   only from advice saved after the last exit. With no actions it returns exactly what PNL.run returns (checked on every
   build). What it adds: an action fills at the CLOSE of the 4H candle it names, after that candle's own stop / target fills.
     close  sells everything left.
     book   sells `percent` of what is left (1-99) and needs that part to be in net profit after fees.
   After a booking, T1 sells half of what is left and T2 the rest, so the T1 / T2 split of the remaining position is kept.

   S083 (tab 03). runS083(...) uses the s083 signal from build/stratlab.js (unchanged, checksummed): on each 4H close the
   position becomes the signal (long, short or flat), filled at that close. Fees and the value of a trade are worked out
   exactly as stratlab.js does (gross capped at zero, fee on each side). With join=true and the same start it gives the
   Coin Zones s083 paper test's numbers (checked by tests/parity-ledgers.js). What it adds:
     fresh start (join=false)  the long or short standing at the start is not taken; the first trade is the next new signal.
     close   closes what is left at that close; the same side is not taken again until the signal goes flat or turns.
     book    closes `percent` of what is left and needs the trade to be in profit.
   Actions are checked hard: an action that does not match the open trade at its candle throws, so a bad journal can
   never be applied silently. */
'use strict';
const H4 = 14400;

/* ------------------------------------------------------------------ Top 20 ------------------------------------------ */
const usable = (s) => !!(s && !s.none && s.entry != null && s.stop != null && s.stop < s.entry);   // = PNL.okSnap(s, {})
const topId = (mode, sym, entryT) => mode + ':' + sym + ':' + entryT;

function top20Coin(mode, sym, snaps, B, R, actions) {
  const S = (snaps || []).slice().sort((a, b) => a.t - b.t), fee = R.fee / 100, trades = [], eq = [], log = [], used = [];
  const byClose = new Map();
  for (const a of actions) if (a.sym === sym) { if (!byClose.has(a.t)) byClose.set(a.t, []); byClose.get(a.t).push(a); }
  let pos = null, lastExit = -Infinity, realized = 0;
  const advice = (t) => { let s = null; for (const x of S) { if (x.t > t) break; if (x.t > lastExit) s = x; } return s; };
  const sell = (px, q, t, why) => { pos.legs.push({ px, q, t, why }); pos.left = Math.max(0, pos.left - q / pos.qty); };
  const finish = (t, why) => {
    let g = 0, f = pos.size * fee; for (const L of pos.legs) { g += L.q * (L.px - pos.px); f += L.q * L.px * fee; }
    Object.assign(pos, { left: 0, pnl: g - f, ret: (g - f) / pos.size * 100, exitT: t, out: why, exitPx: pos.legs.reduce((a, L) => a + L.q * L.px, 0) / pos.qty });
    pos.res = pos.pnl > 0 ? 'W' : pos.pnl < 0 ? 'L' : 'BE';
    realized += pos.pnl; trades.push(pos); lastExit = t; pos = null;
  };
  const n = B && B.t ? B.t.length : 0;
  for (let i = 0; i < n; i++) {
    const t = B.t[i], o = B.o[i], h = B.h[i], l = B.l[i], c = B.c[i];
    if (t < R.start || t >= R.end) continue;
    let fresh = false;
    if (!pos) {
      const s = advice(t);
      if (usable(s) && l <= s.entry) {
        const px = Math.min(s.entry, o);
        pos = { sym, id: topId(mode, sym, t), snapT: s.t, entryT: t, px, lim: s.entry, stop: s.stop, cs: s.stop, t1: s.t1, t2: s.t2, rr2: s.rr2, lo: s.lo, hi: s.hi,
          size: R.size, qty: R.size / px, left: 1, half: false, legs: [] };
        fresh = true;
      }
    }
    if (pos) {
      if (l <= pos.cs) { sell(Math.min(pos.cs, o), pos.qty * pos.left, t, 'stop'); finish(t, pos.half ? 'stop at breakeven after T1' : 'stop'); }
      else if (!fresh || o <= pos.px) {
        if (!pos.half && pos.t1 != null && h >= pos.t1) {
          sell(pos.t1, pos.qty * pos.left / 2, t, 'T1'); pos.half = true; pos.cs = pos.px;
          if (pos.t2 != null && h >= pos.t2) { sell(pos.t2, pos.qty * pos.left, t, 'T2'); finish(t, 'T1 + T2'); }
        } else if (pos.half && pos.t2 != null && h >= pos.t2) { sell(pos.t2, pos.qty * pos.left, t, 'T2'); finish(t, 'T1 + T2'); }
      }
    }
    const tc = t + H4;
    for (const a of byClose.get(tc) || []) {
      if (!pos || a.trade_id !== pos.id) throw new Error(mode + ' action ' + a.nonce + ' does not match an open ' + sym + ' trade at ' + tc);
      const share = a.kind === 'close' ? 100 : a.percent;
      if (a.kind !== 'close' && !(a.kind === 'book' && Number.isInteger(share) && share >= 1 && share <= 99)) throw new Error('bad action ' + a.nonce);
      const q = pos.qty * pos.left * share / 100, net = q * (c - pos.px) - q * (c + pos.px) * fee;
      if (a.kind === 'book' && !(net > 0)) throw new Error('book ' + a.nonce + ': not in net profit');
      sell(c, q, tc, a.kind === 'close' ? 'Close all' : 'Book ' + share + '%');
      log.push({ sym, trade_id: pos.id, nonce: a.nonce, t: tc, px: c, action: a.kind === 'close' ? 'Close all' : 'Book ' + share + '%', usd: net, left_pct: pos.left * 100 });
      used.push(a.nonce);
      if (a.kind === 'close' || pos.left < 1e-9) finish(tc, a.kind === 'close' ? 'Close all' : 'Booked out');
    }
    let open = 0;
    if (pos) { let g = 0; for (const L of pos.legs) g += L.q * (L.px - pos.px); g += pos.qty * pos.left * (c - pos.px); open = g - pos.size * fee; }
    eq.push([t, realized + open]);
  }
  for (const a of actions) if (a.sym === sym && !used.includes(a.nonce)) throw new Error(mode + ' action ' + a.nonce + ' was never applied');
  let openPos = null;
  if (pos) {
    const px = n ? B.c[n - 1] : pos.px; let g = 0; for (const L of pos.legs) g += L.q * (L.px - pos.px); g += pos.qty * pos.left * (px - pos.px);
    Object.assign(pos, { mark: px, pnl: g - pos.size * fee - pos.qty * pos.left * px * fee }); pos.ret = pos.pnl / pos.size * 100; openPos = pos;
  }
  const last = n ? B.t[n - 1] : null, s = advice(last == null ? Infinity : last + H4), i0 = n ? B.t.findIndex((t) => t >= R.start) : -1;
  return { sym, trades, open: openPos, pending: !openPos && usable(s) ? s : null, latest: S.length ? S[S.length - 1] : null, eq, realized,
    bh: i0 >= 0 ? (B.c[n - 1] / B.o[i0] - 1) * 100 : null, bars: n, last, last_close: n ? last + H4 : null, last_price: n ? B.c[n - 1] : null, log, used };
}
/* state = {cfg:{cohort,start,end,size,fee}, snaps:{SYM:{snaps}}, bars:{SYM:{t,o,h,l,c}}}; actions for this tab only */
function runTop20(mode, st, actions) {
  const R = st.cfg, coins = R.cohort.map((sym) => top20Coin(mode, sym, (st.snaps[sym] || {}).snaps, st.bars[sym], R, actions));
  const all = [].concat(...coins.map((c) => c.trades)), W = all.filter((x) => x.res === 'W'), L = all.filter((x) => x.res === 'L');
  const gw = W.reduce((a, x) => a + x.pnl, 0), gl = -L.reduce((a, x) => a + x.pnl, 0), openP = coins.reduce((a, c) => a + (c.open ? c.open.pnl : 0), 0);
  const ts = [...new Set([].concat(...coins.map((c) => c.eq.map((p) => p[0]))))].sort((a, b) => a - b);
  const curve = ts.map((t) => { let v = 0; for (const c of coins) { let lv = 0; for (const p of c.eq) { if (p[0] > t) break; lv = p[1]; } v += lv; } return [t, v]; });
  let pk = 0, dd = 0; for (const [, v] of curve) { if (v > pk) pk = v; if (v - pk < dd) dd = v - pk; }
  const cap = R.size * R.cohort.length, bh = coins.filter((c) => c.bh != null);
  return { coins, sum: { closed: all.length, wins: W.length, losses: L.length, be: all.length - W.length - L.length, winRate: all.length ? W.length / all.length * 100 : null,
    realized: gw - gl, openPnl: openP, net: gw - gl + openP, netPct: (gw - gl + openP) / cap * 100, cap, pf: gl > 0 ? gw / gl : gw > 0 ? Infinity : null,
    maxDD: dd, open: coins.filter((c) => c.open).length, pending: coins.filter((c) => c.pending).length,
    bh: bh.length ? bh.reduce((a, c) => a + c.bh, 0) / bh.length : null, curve } };
}
/* the ledger with no actions must be PNL.run (public/pnl.js) to the cent, coin by coin; coins listed in `skip` had actions */
function sameAsPnl(mine, pnl, skip) {
  const near = (a, b) => (a == null && b == null) || Math.abs(a - b) < 1e-6;
  const bad = [];
  mine.coins.forEach((c, i) => {
    const p = pnl.coins[i]; if ((skip || []).includes(c.sym)) return;
    const ok = c.sym === p.sym && c.trades.length === p.trades.length && near(c.realized, p.realized) && !!c.open === !!p.open && (!c.open || near(c.open.pnl, p.open.pnl))
      && !!c.pending === !!p.pending && c.trades.every((x, k) => x.entryT === p.trades[k].entryT && x.exitT === p.trades[k].exitT && near(x.pnl, p.trades[k].pnl) && x.out === p.trades[k].out)
      && c.eq.length === p.eq.length && c.eq.every((e, k) => e[0] === p.eq[k][0] && near(e[1], p.eq[k][1]));
    if (!ok) bad.push(c.sym);
  });
  return bad;
}

/* ------------------------------------------------------------------ s083 -------------------------------------------- */
function runS083(sym, B, sig, opt, start, actions) {
  const f = opt.fee / 100, trades = [], log = [], used = [], byClose = new Map();
  for (const a of actions) if (a.sym === sym) { if (!byClose.has(a.t)) byClose.set(a.t, []); byClose.get(a.t).push(a); }
  // value of `q` units opened at `entry`, closed at `px`, as stratlab.js counts a trade: gross capped at 0, fee each side
  const closed = (p, q, px) => p.entry * q * (Math.max(0, 1 + p.side * (px / p.entry - 1)) * (1 - f) * (1 - f) - 1);
  const openVal = (p, q, px) => p.entry * q * (Math.max(0, 1 + p.side * (px / p.entry - 1)) * (1 - f) - 1);
  let pos = null, hold = 0, first = true, realized = 0, last = null;
  const exit = (q, tc, px, why, nonce) => {
    const usd = closed(pos, q, px); pos.left -= q; pos.got += usd; realized += usd;
    pos.parts.push({ t: tc, px, pct: q / pos.qty * 100, usd, why });
    if (nonce) log.push({ sym, trade_id: pos.id, nonce, t: tc, px, action: why, usd, left_pct: Math.max(0, pos.left / pos.qty * 100) });
    if (pos.left <= pos.qty * 1e-9) {
      trades.push({ id: pos.id, side: pos.side, entry_t: pos.t, entry: pos.entry, exit_t: tc, exit: px, usd: pos.got, ret: pos.got / opt.size * 100, reason: why, parts: pos.parts });
      pos = null;
    }
  };
  for (let i = 0; i < B.t.length; i++) {
    const tc = B.t[i] + H4, px = B.c[i], want = sig[i];
    if (tc < start) continue;
    last = { tc, px, want };
    if (first) {
      first = false;
      if (!opt.join) { hold = tc === start ? want : i > 0 ? sig[i - 1] : 0; if (tc === start) continue; }
    }
    if (hold && want !== hold) hold = 0;
    if (pos && want !== pos.side) exit(pos.left, tc, px, 'Signal ' + (want > 0 ? 'long' : want < 0 ? 'short' : 'flat'));
    if (!pos && want && want !== hold) pos = { id: sym + ':' + (want > 0 ? 'L' : 'S') + ':' + tc, side: want, t: tc, entry: px, qty: opt.size / px, left: opt.size / px, got: 0, parts: [] };
    for (const a of byClose.get(tc) || []) {
      if (!pos || a.trade_id !== pos.id) throw new Error('s083 action ' + a.nonce + ' does not match an open ' + sym + ' trade at ' + tc);
      const share = a.kind === 'close' ? 100 : a.percent;
      if (a.kind !== 'close' && !(a.kind === 'book' && Number.isInteger(share) && share >= 1 && share <= 99)) throw new Error('bad action ' + a.nonce);
      if (a.kind === 'book' && !(pos.side * (px / pos.entry - 1) > 0)) throw new Error('book ' + a.nonce + ': not in profit');
      const side = pos.side;
      exit(a.kind === 'close' ? pos.left : pos.left * share / 100, tc, px, a.kind === 'close' ? 'Close all' : 'Book ' + share + '%', a.nonce);
      used.push(a.nonce);
      if (!pos) hold = side;
    }
  }
  for (const a of actions) if (a.sym === sym && !used.includes(a.nonce)) throw new Error('s083 action ' + a.nonce + ' was never applied');
  const un = pos ? openVal(pos, pos.left, last.px) : 0;
  return { sym, price: last ? last.px : null, last_close: last ? last.tc : null, signal: last ? last.want : 0, waiting: !pos && hold ? hold : 0,
    open: pos ? { id: pos.id, side: pos.side, entry_t: pos.t, entry: pos.entry, left_pct: pos.left / pos.qty * 100, mark: last.px, unrealized: un, booked: pos.got, parts: pos.parts } : null,
    trades, closed: trades.length, wins: trades.filter((x) => x.usd > 0).length, losses: trades.filter((x) => x.usd <= 0).length,
    realized, unrealized: un, net: realized + un, log, used };
}

module.exports = { H4, topId, runTop20, sameAsPnl, runS083 };
