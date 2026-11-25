/* Paper-Trade page. Display only: every number comes from paper.json and s083-paper.json, built on GitHub.
   Uses the Coin Zones board's own styles (cards, key figures, tables, pills, chips). cloud.js adds the Refresh button,
   the freshness strip and the link back to all dashboards. The owner's Close all / Book % buttons appear only after
   /api/paper-trade/owner answers (it sits behind the home site's login). */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var fmt = function (x) { if (x == null || isNaN(x)) return '-'; var a = Math.abs(x); return a >= 1000 ? x.toLocaleString('en-US', { maximumFractionDigits: 0 }) : a >= 100 ? x.toFixed(1) : a >= 1 ? x.toFixed(3) : a >= 0.01 ? x.toFixed(5) : x.toPrecision(4); };
  var usd = function (x, sign) { if (x == null || isNaN(x)) return '-'; var a = Math.abs(x); return (x < 0 ? '-' : sign && x > 0 ? '+' : '') + '$' + (a >= 1000 ? a.toLocaleString('en-US', { maximumFractionDigits: 0 }) : a.toFixed(2)); };
  var pct = function (x, d) { return x == null || isNaN(x) ? '-' : (x > 0 ? '+' : '') + x.toFixed(d == null ? 2 : d) + '%'; };
  var cls = function (x) { return x > 0 ? 'good' : x < 0 ? 'bad' : ''; };
  var when = function (t) { if (!t) return '-'; var d = new Date(t * 1000); return d.toLocaleDateString([], { day: 'numeric', month: 'short' }) + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); };
  var kpi = function (lab, val, sub, k) { return '<div><b>' + lab + '</b><span class="' + (k || '') + '">' + val + '</span>' + (sub ? '<div class="note">' + sub + '</div>' : '') + '</div>'; };
  var slug = location.pathname.split('/')[1] || '', API = slug ? '/api/' + slug + '/' : 'api/';
  var TABS = ['mss', 's083', 'mss-rvol', 'rsi-desk'], tab = TABS.indexOf(location.hash.slice(1)) >= 0 ? location.hash.slice(1) : 'mss';
  var P = null, S = null, owner = false;

  function notYet(start) {
    return '<div class="card"><h2>Not started yet</h2><p>' + (typeof start === 'number' ? 'This account starts empty at <b>' + esc(when(start)) + '</b> (your time).' : 'This account starts empty at go-live.')
      + '</p><p class="note">Nothing from before the start is counted: no trades, advice or results are carried over from Coin Zones or anywhere else. Advice is recorded from the first build after the start.</p></div>';
  }
  function curve(cv, cap) {
    if (!cv || cv.length < 2) return '<p class="note" style="margin:0">The curve starts after the first closed 4H candle.</p>';
    var W = 1100, H = 220, L = 60, R = 10, T = 10, B = 24, x0 = cv[0][0], x1 = cv[cv.length - 1][0], ys = cv.map(function (p) { return p[1] / cap * 100; });
    var lo = Math.min(0, Math.min.apply(null, ys)), hi = Math.max(0, Math.max.apply(null, ys)); if (hi - lo < 0.5) { hi += 0.25; lo -= 0.25; }
    var X = function (t) { return L + (t - x0) / Math.max(1, x1 - x0) * (W - L - R); }, Y = function (v) { return T + (hi - v) / (hi - lo) * (H - T - B); };
    var d = cv.map(function (p, i) { return (i ? 'L' : 'M') + X(p[0]).toFixed(1) + ' ' + Y(p[1] / cap * 100).toFixed(1); }).join(' '), last = ys[ys.length - 1];
    var s = '<svg viewBox="0 0 ' + W + ' ' + H + '" width="100%" role="img" aria-label="Equity curve">';
    [hi, lo].forEach(function (v) { s += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + Y(v).toFixed(1) + '" y2="' + Y(v).toFixed(1) + '" stroke="var(--line)"/><text class="m" x="' + (L - 6) + '" y="' + (Y(v) + 4).toFixed(1) + '" text-anchor="end">' + (v > 0 ? '+' : '') + v.toFixed(2) + '%</text>'; });
    s += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + Y(0).toFixed(1) + '" y2="' + Y(0).toFixed(1) + '" stroke="var(--muted)" stroke-dasharray="3 3"/>';
    s += '<path d="' + d + '" fill="none" stroke="' + (last >= 0 ? 'var(--sup)' : 'var(--res)') + '" stroke-width="2"/>';
    return s + '<text class="m" x="' + L + '" y="' + (H - 6) + '">' + esc(when(x0)) + '</text><text class="m" x="' + (W - R) + '" y="' + (H - 6) + '" text-anchor="end">' + esc(when(x1)) + '</text></svg>';
  }
  function buttons(t, sym, canBook) {
    return '<div class="act"><input type="number" min="1" max="99" step="1" value="50" aria-label="Percent of ' + esc(sym) + ' to book" data-pct="' + t + ':' + esc(sym) + '"><span class="note">%</span>'
      + '<button class="chip book" type="button" data-do="book" data-t="' + t + '" data-sym="' + esc(sym) + '"' + (canBook ? '' : ' disabled title="Only a position in profit after fees can be booked"') + '>Book</button>'
      + '<button class="chip sell" type="button" data-do="close" data-t="' + t + '" data-sym="' + esc(sym) + '">Close all</button></div>';
  }
  function logCard(rows) {
    var h = '<div class="card"><h2>Your closes and bookings</h2>';
    if (!rows.length) return h + '<p class="note" style="margin:0">None yet.</p></div>';
    h += '<div class="scroll"><table><thead><tr><th>Coin</th><th>Action</th><th>4H close</th><th class="r">Filled at</th><th class="r">Left after</th><th class="r">P&amp;L of that part</th></tr></thead><tbody>';
    rows.forEach(function (a) { h += '<tr><td><b>' + esc(a.sym) + '</b></td><td>' + esc(a.action) + '</td><td class="num">' + esc(when(a.t)) + '</td><td class="num r">' + fmt(a.px) + '</td><td class="num r">' + Math.round(a.left_pct) + '%</td><td class="num r ' + cls(a.usd) + '">' + usd(a.usd, true) + '</td></tr>'; });
    return h + '</tbody></table></div></div>';
  }

  function top20(mode) {
    if (!P) return '<div class="card"><p class="note">Waiting for the first build.</p></div>';
    if (!P.started) return notYet(P.start);
    var d = P[mode], s = d.sum, fee = P.fee / 100, h = '';
    h += '<div class="card"><div class="row" style="margin-bottom:8px"><div class="grow"><h2 style="margin:0">' + 'Top 20 P&amp;L with MSS' + '</h2>'
      + '<div class="note">Started ' + esc(when(P.start)) + ' &middot; ' + P.cohort.length + ' coins &middot; ' + usd(P.size) + ' per trade, ' + P.fee + '% fee each side &middot; long only (spot)</div></div>'
      + '<span class="pill acc">Buy zone + 4H structure shift</span></div>';
    h += '<div class="kv">' + kpi('Net P&amp;L', usd(s.net, true), pct(s.net_pct) + ' of ' + usd(s.capital), cls(s.net))
      + kpi('Win / loss', s.wins + ' W &middot; ' + s.losses + ' L', s.win_rate == null ? 'no closed trades yet' : Math.round(s.win_rate) + '% win rate')
      + kpi('Realised', usd(s.realized, true), s.closed + ' closed trade' + (s.closed === 1 ? '' : 's'), cls(s.realized))
      + kpi('Open positions', String(s.open), 'unrealised ' + usd(s.open_pnl, true), cls(s.open_pnl))
      + kpi('Buy orders waiting', String(s.pending), 'until price reaches the entry')
      + kpi('Max drawdown', usd(s.max_dd), 'profit factor ' + (s.profit_factor == null ? '-' : s.profit_factor.toFixed(2)), s.max_dd < 0 ? 'bad' : '')
      + kpi('Buy &amp; hold', s.buy_hold_pct == null ? '-' : pct(s.buy_hold_pct), 'same coins, same start') + '</div>';
    h += '<h3 style="margin-top:14px">Equity (realised + open, % of capital)</h3>' + curve(s.curve, s.capital) + '</div>';
    var rows = d.coins.slice().sort(function (a, b) { return (b.open ? 2 : b.pending ? 1 : 0) - (a.open ? 2 : a.pending ? 1 : 0); });
    h += '<div class="card"><h2>Positions and buy orders</h2><div class="scroll"><table><thead><tr><th>Coin</th><th>Now</th><th class="r">Entry</th><th class="r">Stop</th><th class="r">T1</th><th class="r">T2</th><th class="r">Last 4H close</th><th class="r">Left</th><th class="r" title="All trades in this coin since the start, closed and open, after fees">Coin P&amp;L</th>' + (owner ? '<th class="r">Your action</th>' : '') + '</tr></thead><tbody>';
    rows.forEach(function (c) {
      var o = c.open, p = c.pending, lv = o || p, st;
      if (o) st = '<span class="pill sup">open' + (o.half ? ', T1 taken' : '') + '</span>';
      else if (p) st = '<span class="pill acc">buy order</span>';
      else st = '<span class="pill">' + esc(c.advice === 'setup' ? 'waiting for new advice' : c.advice ? String(c.advice).toLowerCase() : 'no advice yet') + '</span>';
      var canBook = o && (c.price - o.entry) - (c.price + o.entry) * fee > 0;
      h += '<tr><td><b>' + esc(c.sym) + '</b></td><td>' + st + '</td><td class="num r">' + (lv ? fmt(lv.entry) : '-') + '</td><td class="num r">' + (o ? fmt(o.now_stop) : p ? fmt(p.stop) : '-') + '</td>'
        + '<td class="num r">' + (lv && lv.t1 != null ? fmt(lv.t1) : '-') + '</td><td class="num r">' + (lv && lv.t2 != null ? fmt(lv.t2) : '-') + '</td><td class="num r">' + fmt(c.price) + '</td>'
        + '<td class="num r">' + (o ? Math.round(o.left_pct) + '%' : '-') + '</td><td class="num r ' + cls(c.net) + '">' + (o || c.realized ? usd(c.net, true) : '-') + '</td>'
        + (owner ? '<td class="r">' + (o ? buttons(mode, c.sym, canBook) : '') + '</td>' : '') + '</tr>';
    });
    h += '</tbody></table></div><p class="note" style="margin:8px 0 0">' + (mode === 'mss'
      ? 'Buys only when both agree: the board\'s buy zone and a 4H structure shift up from it. Entry is the middle of the shift\'s price gap (or a retest of the broken level when the shift leaves no gap), stop just below the sweep low, targets are the board\'s targets at least 1R away. An order stands for 12 candles.'
      : 'Buys at the board\'s spot-setup entry (the buy-zone middle) when a 4H candle trades down to it; stop is the setup stop. Orders follow the latest advice until filled.')
      + ' Coin P&amp;L counts every trade in that coin since the start, closed and open. Half is sold at T1 (the stop then moves to the entry), the rest at T2; if a candle touches both the stop and a target, the stop counts first. P&amp;L is after fees.</p></div>';
    var log = [], trades = [];
    d.coins.forEach(function (c) { log = log.concat(c.log); c.trades.forEach(function (t) { trades.push(Object.assign({ sym: c.sym }, t)); }); });
    log.sort(function (a, b) { return b.t - a.t; }); trades.sort(function (a, b) { return b.exit_t - a.exit_t; });
    h += logCard(log);
    h += '<div class="card"><h2>Closed trades</h2>';
    if (!trades.length) h += '<p class="note" style="margin:0">No closed trades yet.</p>';
    else {
      h += '<div class="scroll"><table><thead><tr><th>Coin</th><th>Bought</th><th class="r">At</th><th>Sold</th><th class="r">Avg exit</th><th>How</th><th class="r">P&amp;L</th><th class="r">%</th></tr></thead><tbody>';
      trades.slice(0, 50).forEach(function (t) { h += '<tr><td><b>' + esc(t.sym) + '</b></td><td class="num">' + esc(when(t.entry_t)) + '</td><td class="num r">' + fmt(t.entry) + '</td><td class="num">' + esc(when(t.exit_t)) + '</td><td class="num r">' + fmt(t.exit) + '</td><td><span class="pill ' + (t.usd > 0 ? 'sup' : t.usd < 0 ? 'res' : '') + '">' + esc(t.how) + '</span></td><td class="num r ' + cls(t.usd) + '">' + usd(t.usd, true) + '</td><td class="num r ' + cls(t.pct) + '">' + pct(t.pct) + '</td></tr>'; });
      h += '</tbody></table></div>';
    }
    return h + '</div>';
  }

  function s083() {
    if (!S) return '<div class="card"><p class="note">Waiting for the first build.</p></div>';
    if (!S.started) return notYet(S.start);
    var s = S.sum, p = S.params, h = '';
    h += '<div class="card"><div class="row" style="margin-bottom:8px"><div class="grow"><h2 style="margin:0">s083 Participation regime</h2>'
      + '<div class="note">Started ' + esc(when(S.start)) + ' &middot; ' + S.coins.join(', ') + ' &middot; ' + usd(S.size) + ' per trade, ' + S.fee + '% fee each side &middot; no leverage</div></div><span class="pill warn">Shorts are virtual</span></div>';
    h += '<div class="kv">' + kpi('Net P&amp;L', usd(s.net, true), 'closed + open', cls(s.net)) + kpi('Realised', usd(s.realized, true), s.closed + ' closed &middot; ' + s.wins + ' won', cls(s.realized))
      + kpi('Open P&amp;L', usd(s.unrealized, true), 'at the last 4H close', cls(s.unrealized)) + kpi('Open positions', s.open + ' of ' + S.coins.length, 'one per coin at most') + '</div>';
    h += '<p class="note" style="margin:10px 0 0">On each 4H close: when the average volume of the last ' + p.vfast + ' candles is above that of the last ' + p.vslow + ', go long if price is above its level ' + p.mom + ' candles ago and short if below; otherwise flat. No stop loss.'
      + (S.join ? '' : ' Fresh start: a long or short already standing at the start was not taken; each coin waits for its next new signal.') + '</p></div>';
    h += '<div class="card"><h2>Positions</h2><div class="scroll"><table><thead><tr><th>Coin</th><th>Signal now</th><th>Position</th><th class="r">Entry</th><th class="r">Last 4H close</th><th class="r">Left</th><th class="r">Open P&amp;L</th>' + (owner ? '<th class="r">Your action</th>' : '') + '</tr></thead><tbody>';
    S.coins.forEach(function (sym) {
      var c = S.per[sym], o = c.open, sig = c.signal > 0 ? '<span class="pill sup">Long</span>' : c.signal < 0 ? '<span class="pill res">Short</span>' : '<span class="pill">Flat</span>';
      h += '<tr><td><b>' + esc(sym) + '</b><div class="note">' + esc(when(c.last_close)) + '</div></td><td>' + sig + (c.waiting ? '<div class="note">waiting for a new signal</div>' : '') + '</td>'
        + '<td>' + (o ? (o.side > 0 ? 'Long' : 'Short (virtual)') + ' since ' + esc(when(o.entry_t)) : '-') + '</td><td class="num r">' + (o ? fmt(o.entry) : '-') + '</td><td class="num r">' + fmt(c.price) + '</td>'
        + '<td class="num r">' + (o ? Math.round(o.left_pct) + '%' : '-') + '</td><td class="num r ' + cls(o ? o.unrealized : 0) + '">' + (o ? usd(o.unrealized, true) : '-') + '</td>'
        + (owner ? '<td class="r">' + (o ? buttons('s083', sym, o.side * (c.price / o.entry - 1) > 0) : '') + '</td>' : '') + '</tr>';
    });
    h += '</tbody></table></div><p class="note" style="margin:8px 0 0">After <b>Close all</b> the same side is not taken again until the signal goes flat or turns.</p></div>';
    var log = [], trades = [];
    S.coins.forEach(function (sym) { log = log.concat(S.per[sym].log); S.per[sym].trades.forEach(function (t) { trades.push(Object.assign({ sym: sym }, t)); }); });
    log.sort(function (a, b) { return b.t - a.t; }); trades.sort(function (a, b) { return b.exit_t - a.exit_t; });
    h += logCard(log) + '<div class="card"><h2>Closed trades</h2>';
    if (!trades.length) return h + '<p class="note" style="margin:0">No closed trades yet.</p></div>';
    h += '<div class="scroll"><table><thead><tr><th>Coin</th><th>Side</th><th>Opened</th><th class="r">At</th><th>Closed</th><th class="r">Last exit</th><th>How</th><th class="r">P&amp;L</th></tr></thead><tbody>';
    trades.slice(0, 50).forEach(function (t) { h += '<tr><td><b>' + esc(t.sym) + '</b></td><td>' + (t.side > 0 ? 'Long' : 'Short') + '</td><td class="num">' + esc(when(t.entry_t)) + '</td><td class="num r">' + fmt(t.entry) + '</td><td class="num">' + esc(when(t.exit_t)) + '</td><td class="num r">' + fmt(t.exit) + '</td><td>' + esc(t.reason) + '</td><td class="num r ' + cls(t.usd) + '">' + usd(t.usd, true) + '</td></tr>'; });
    return h + '</tbody></table></div></div>';
  }

  function render() {
    document.querySelectorAll('[data-tab]').forEach(function (b) { b.setAttribute('aria-selected', String(b.getAttribute('data-tab') === tab)); });
    if (tab === 'rsi-desk') { $('main').innerHTML = window.SignalDeskView.html(); window.SignalDeskView.mount(); }
    else $('main').innerHTML = tab === 'mss-rvol' ? window.MssRvolView.render(window.MssRvolState, owner) : tab === 's083' ? s083() : top20(tab);
  }
  function say(text, kind) { var b = $('banner'); b.hidden = !text; b.textContent = text || ''; b.style.background = kind === 'ok' ? 'var(--sup-bg)' : ''; b.style.color = kind === 'ok' ? 'var(--sup)' : ''; }
  function nonce() { var a = new Uint8Array(16); (window.crypto || {}).getRandomValues ? crypto.getRandomValues(a) : a.forEach(function (_, i) { a[i] = Math.random() * 256; }); return Array.prototype.map.call(a, function (x) { return ('0' + x.toString(16)).slice(-2); }).join(''); }

  function act(btn) {
    var t = btn.getAttribute('data-t'), sym = btn.getAttribute('data-sym'), kind = btn.getAttribute('data-do');
    var c = t === 's083' ? S.per[sym] : P[t].coins.filter(function (x) { return x.sym === sym; })[0], o = c && c.open; if (!o) return;
    var share = kind === 'book' ? Number((document.querySelector('[data-pct="' + t + ':' + sym + '"]') || {}).value) : 100;
    if (kind === 'book' && !(Number.isInteger(share) && share >= 1 && share <= 99)) { alert('Enter a whole number from 1 to 99.'); return; }
    var name = t === 's083' ? 's083' : 'Top 20 with MSS';
    if (!confirm((kind === 'book' ? 'Book ' + share + '% of what is left of ' : 'Close all of ') + sym + ' in ' + name + ', at the last closed 4H price ' + fmt(c.price) + '?\n\nPaper only. The other tabs are not changed.')) return;
    var body = { tab: t, sym: sym, kind: kind, percent: share, nonce: nonce(), trade_id: o.id, journal_count: t === 's083' ? S.journal_count : P.journal_count, last_close: c.last_close };
    document.querySelectorAll('button[data-do]').forEach(function (b) { b.disabled = true; });
    say('Sending...');
    fetch(API + 'action', { method: 'POST', credentials: 'same-origin', redirect: 'manual', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
      .then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error(j.error || 'HTTP ' + r.status); }); })
      .then(function () { say('Sent, not filled yet. The build checks it and fills it at the last 4H close; this page reloads when it has finished (about 2 minutes).'); watch(Date.now()); })
      .catch(function (e) { say('Not sent: ' + e.message); document.querySelectorAll('button[data-do]').forEach(function (b) { b.disabled = false; }); });
  }
  function watch(since) {
    var n = 0;
    (function tick() {
      setTimeout(function () {
        fetch(API + 'status', { cache: 'no-store', credentials: 'same-origin', redirect: 'manual' }).then(function (r) { return r.json(); }).then(function (s) {
          if (s.status === 'completed' && Date.parse(s.started || 0) >= since - 20000) {
            if (s.conclusion === 'success') { say('Done.', 'ok'); setTimeout(function () { location.reload(); }, 1200); }
            else say('The update failed, so nothing was filled and the last good data stays. The reason is in the run on GitHub Actions.');
            return;
          }
          if (++n < 30) tick();
        }).catch(function () { if (++n < 30) tick(); });
      }, 7000);
    })();
  }

  document.addEventListener('click', function (e) {
    var t = e.target.closest('[data-tab]'); if (t) { tab = t.getAttribute('data-tab'); history.replaceState(null, '', '#' + tab); render(); return; }
    var b = e.target.closest('button[data-do]'); if (b && owner) act(b);
  });
  window.addEventListener('hashchange', function () { var t = location.hash.slice(1); if (TABS.indexOf(t) >= 0) { tab = t; render(); } });
  var get = function (f) { return fetch(f, { cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; }); };
  Promise.all([get('paper.json'), get('s083-paper.json'), get('mss-rvol.json')]).then(function (x) {
    P = x[0]; S = x[1]; window.MssRvolState = x[2];
    var st = (P && P.start) || (S && S.start), started = P && P.started;
    $('meta').textContent = (started ? 'Started ' + when(st) : typeof st === 'number' ? 'Starts ' + when(st) : 'Starts at go-live') + ' (your time) · fresh start, nothing carried over · closed 4H candles' + (P && P.generated ? ' · built ' + when(Date.parse(P.generated) / 1000) : '');
    render();
    return fetch(API + 'owner', { cache: 'no-store', credentials: 'same-origin', redirect: 'manual' }).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; });
  }).then(function (o) {
    if (!o || o.owner !== true) return;
    $('who').hidden = false; $('who').textContent = o.ready ? 'Owner' : 'Owner · buttons unavailable'; $('who').className = 'pill ' + (o.ready ? 'sup' : 'warn');
    if (!o.ready) { say('Signed in, but the buttons cannot reach GitHub: ' + (o.why || 'unknown') + '.'); return; }
    owner = true; render();
  });
})();
