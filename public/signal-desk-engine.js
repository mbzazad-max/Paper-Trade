
/* RSI(7) spot signal engine. 4H: RSI<30 inside fib 0.5-0.786 of last 30-day swing. 1D: RSI<30 above EMA200. 4H exit: RSI>70. 1D exit: 0.236 fib target of the entry swing, or a close below the swing low. */
(function (root) {
  'use strict';
  var FEE = 0.001;
  var CFG = {
    '4H': { sec: 14400, lookback: 180, fib: [0.5, 0.786], ema: 200, warm: 210, filter: 'fib' },
    '1D': { sec: 86400, lookback: 120, fib: [0.5, 0.786], ema: 200, warm: 210, filter: 'ema', exit: 'fib', target: 0.236 }
  };
  function rsi(c, n) {
    var r = new Array(c.length).fill(null), g = 0, l = 0;
    for (var i = 1; i < c.length; i++) {
      var ch = c[i] - c[i - 1], up = Math.max(ch, 0), dn = Math.max(-ch, 0);
      if (i <= n) { g += up / n; l += dn / n; } else { g = (g * (n - 1) + up) / n; l = (l * (n - 1) + dn) / n; }
      if (i >= n) r[i] = l === 0 ? 100 : 100 - 100 / (1 + g / l);
    }
    return r;
  }
  function ema(c, n) {
    var k = 2 / (n + 1), e = [c[0]];
    for (var i = 1; i < c.length; i++) e.push(e[i - 1] + k * (c[i] - e[i - 1]));
    return e;
  }
  function swing(b, i, L) {
    var a = Math.max(0, i - L), ph = a;
    for (var k = a; k <= i; k++) if (b.h[k] > b.h[ph]) ph = k;
    var H = b.h[ph], lo = Infinity;
    for (k = a; k <= ph; k++) if (b.l[k] < lo) lo = b.l[k];
    var valid = ph !== a && H / lo >= 1.08;
    return { valid: valid, high: H, low: lo, ret: valid ? (H - b.c[i]) / (H - lo) : null };
  }
  function run(b, tf, nowSec) {
    var cfg = CFG[tf], c = b.c, n = c.length;
    var r = rsi(c, 7), E = ema(c, cfg.ema);
    var lastT = b.t[n - 1];
    var forming = nowSec != null ? (lastT + cfg.sec > nowSec) : true;
    var N = forming ? n - 1 : n; /* bars < N are closed */
    var trades = [], pos = null, events = [], esw = null;
    function lvl(s, f) { return s.high - f * (s.high - s.low); }
    function close(i, px, why) {
      var lo = Infinity; for (var k = pos; k <= i; k++) lo = Math.min(lo, b.l[k]);
      trades.push({ ei: pos, xi: i, et: b.t[pos], xt: b.t[i], e: c[pos], x: px, why: why, pnl: (px / c[pos]) * (1 - FEE) * (1 - FEE) - 1, bars: i - pos, mae: lo / c[pos] - 1 });
      events.push({ i: i, type: 'SELL', why: why }); pos = null; esw = null;
    }
    for (var i = cfg.warm; i < N; i++) {
      if (r[i] == null) continue;
      if (pos === null) {
        if (r[i] < 30) {
          var ok;
          if (cfg.filter === 'fib') { var s = swing(b, i, cfg.lookback); ok = s.valid && s.ret >= cfg.fib[0] && s.ret <= cfg.fib[1]; }
          else ok = c[i] > E[i];
          if (ok) { pos = i; esw = swing(b, i, cfg.lookback); events.push({ i: i, type: 'BUY' }); }
        }
      } else if (cfg.exit === 'fib') {
        var tgt = lvl(esw, cfg.target), stp = esw.low;
        if (c[i] < stp) close(i, c[i], 'Stop');
        else if (b.h[i] >= tgt) close(i, Math.max(tgt, b.l[i]), 'Target');
      } else if (r[i] > 70) close(i, c[i], 'RSI > 70');
    }
    var li = N - 1; /* last closed bar */
    var sw = swing(b, li, cfg.lookback);
    var st = {
      tf: tf, lastClosedT: b.t[li], lastClose: c[li], rsi: r[li], rsiLive: forming ? r[n - 1] : null,
      livePrice: c[n - 1], ema: E[li], swing: sw,
      fibBand: [sw.high - cfg.fib[1] * (sw.high - sw.low), sw.high - cfg.fib[0] * (sw.high - sw.low)],
      open: pos === null ? null : { ei: pos, et: b.t[pos], e: c[pos], pnl: c[n - 1] / c[pos] - 1, bars: li - pos,
        target: cfg.exit === 'fib' ? lvl(esw, cfg.target) : null, stop: cfg.exit === 'fib' ? esw.low : null, swing: esw }
    };
    var lastEv = events.length ? events[events.length - 1] : null;
    st.signalNow = lastEv && lastEv.i === li ? lastEv.type : null;
    st.signalWhy = lastEv && lastEv.i === li ? (lastEv.why || null) : null;
    st.nextTarget = cfg.exit === 'fib' ? lvl(sw, cfg.target) : null; st.nextStop = cfg.exit === 'fib' ? sw.low : null;
    return { trades: trades, events: events, state: st, rsi: r, ema: E, N: N, cfg: cfg };
  }
  function stats(trades) {
    var eq = 1, pk = 1, dd = 0, w = [], ls = [];
    trades.forEach(function (t) { eq *= 1 + t.pnl; pk = Math.max(pk, eq); dd = Math.min(dd, eq / pk - 1); (t.pnl > 0 ? w : ls).push(t.pnl); });
    var avg = function (a) { return a.length ? a.reduce(function (x, y) { return x + y; }, 0) / a.length : 0; };
    return { n: trades.length, wins: w.length, losses: ls.length, total: eq - 1, maxDD: dd, avgW: avg(w), avgL: avg(ls) };
  }
  function monthly(trades) {
    var m = {};
    trades.forEach(function (t) {
      var d = new Date(t.xt * 1000), k = d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0');
      var o = m[k] || (m[k] = { k: k, n: 0, w: 0, l: 0, eq: 1 });
      o.n++; t.pnl > 0 ? o.w++ : o.l++; o.eq *= 1 + t.pnl;
    });
    return Object.keys(m).sort().reverse().map(function (k) { return m[k]; });
  }
  root.SIG = { run: run, stats: stats, monthly: monthly, CFG: CFG, FEE: FEE };
})(typeof window !== 'undefined' ? window : globalThis);


