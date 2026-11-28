/* 05 · Cycle DCA tab (display only; every number comes from cycle-dca.json, built on GitHub by build/cycle-dca.js).
   The build buys from the cycle-tab early bottom signs; the owner sells with Book % / Close all (owner-only buttons). */
(function () {
  'use strict';
  var doc = null, owner = false;
  var NAMES = { div: 'RSI divergence', div10: 'Divergence + 10D', rev: 'Key reversal', d10: 'Close > 10D', swing: '★ Swing break', d20: 'Close > 20D' };
  function esc(x) { return String(x == null ? '' : x).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function usd(v, sign) { if (v == null || isNaN(v)) return '—'; var a = Math.abs(v); return (v < 0 ? '-' : sign && v > 0 ? '+' : '') + '$' + (a >= 1000 ? a.toLocaleString('en-US', { maximumFractionDigits: 0 }) : a.toFixed(2)); }
  function px(v) { if (v == null) return '—'; return '$' + (v >= 1000 ? v.toLocaleString('en-US', { maximumFractionDigits: 0 }) : v >= 100 ? v.toFixed(2) : v >= 1 ? v.toFixed(3) : v.toFixed(5)); }
  function pct(v) { return v == null || isNaN(v) ? '—' : (v > 0 ? '+' : '') + v.toFixed(2) + '%'; }
  function cls(v) { return v > 0 ? 'good' : v < 0 ? 'bad' : ''; }
  function dd(d) { return d ? new Date(d + 'T00:00:00Z').toLocaleDateString([], { day: 'numeric', month: 'short', year: '2-digit', timeZone: 'UTC' }) : '—'; }
  function when(t) { if (!t) return '—'; var d = new Date(t * 1000); return d.toLocaleDateString([], { day: 'numeric', month: 'short' }) + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); }
  function kpi(l, v, k) { return '<div><b>' + l + '</b><span class="' + (k || '') + '">' + v + '</span></div>'; }

  function render(d, isOwner) {
    doc = d; owner = !!isOwner;
    if (!d) return '<div class="card"><h2>05 · Cycle DCA</h2><p class="note">No build yet. The next GitHub build creates this account.</p></div>';
    var h = '<div class="card"><div class="row"><div class="grow"><h2 style="margin:0">05 · Cycle DCA · spot, bought by the system, sold by you</h2>'
      + '<p class="note">' + esc(d.coins.map(function (c) { return c.sym; }).join(', ')) + ' · buy 1 ' + usd(d.size) + ' when 2 of the 6 early bottom signs have fired after a 30-day low · buy 2 ' + usd(d.size) + ' when all 4 price-action signs (key reversal, 10D, 20D, ★ swing break) have fired in that low · fills at that day\'s close · ' + d.fee_pct + '% fee each side</p></div>'
      + '<span class="pill acc">' + usd(d.capital) + ' paper</span></div>';
    if (!d.started) return h + '<p>This account starts empty at <b>' + esc(when(d.start)) + '</b> (your time). A low whose 2nd sign fires before then is never bought.</p></div>';
    h += '<div class="kv">' + kpi('Account value', usd(d.equity)) + kpi('P&amp;L', usd(d.pnl, true), cls(d.pnl)) + kpi('Return', pct(d.return_pct), cls(d.return_pct)) + kpi('Cash', usd(d.cash)) + kpi('In coins', usd(d.value)) + '</div>'
      + '<p class="note" style="margin:10px 0 0">Started ' + esc(when(d.start)) + ' · built ' + esc(d.generated) + ' UTC · ' + esc(d.source) + '</p></div>';

    h += '<div class="card"><h2>Holdings and signs</h2><div class="scroll"><table><thead><tr><th>Coin</th><th>Early bottom signs (current 30-day low)</th><th>Buys in this low</th><th class="r">Held</th><th class="r">Avg cost</th><th class="r">Last 4H close</th><th class="r">Value</th><th class="r">Open P&amp;L</th><th class="r">Realized</th>' + (owner ? '<th>Your sell</th>' : '') + '</tr></thead><tbody>';
    d.coins.forEach(function (c) {
      var fired = c.signs.filter(function (s) { return s.fired; }).map(function (s) { return NAMES[s.id] || s.id; });
      var sig = '<b>' + c.fired + '/6</b> after the ' + esc(dd(c.low.day)) + ' low ' + px(c.low.v) + (c.expired ? ' <span class="note">(old low)</span>' : '') + (fired.length ? '<div class="note">' + esc(fired.join(' · ')) + '</div>' : '');
      var lb = c.low_buys.length ? c.low_buys.map(function (b) { return (b.skipped ? '<s>' : '') + 'Buy ' + b.n + ' ' + esc(dd(b.day)) + ' ' + px(b.px) + (b.skipped ? '</s> <span class="note">' + esc(b.skipped) + '</span>' : ''); }).join('<br>') : '<span class="note">none</span>';
      var held = c.qty > 0;
      h += '<tr><td><b>' + esc(c.sym) + '</b></td><td>' + sig + '</td><td>' + lb + '</td><td class="r num">' + (held ? esc(c.qty) : '—') + '</td><td class="r num">' + (held ? px(c.avg) : '—') + '</td><td class="r num">' + px(c.price) + '</td><td class="r num">' + (held ? usd(c.value) : '—') + '</td><td class="r num ' + cls(c.unrealized) + '">' + (held ? usd(c.unrealized, true) + ' <span class="note">' + pct(c.cost ? c.unrealized / c.cost * 100 : null) + '</span>' : '—') + '</td><td class="r num ' + cls(c.realized) + '">' + (c.sells ? usd(c.realized, true) : '—') + '</td>';
      if (owner) h += '<td>' + (held ? '<input class="search" style="width:60px" type="number" min="1" max="99" value="50" aria-label="Percent of ' + esc(c.sym) + ' to sell" data-cd-pct="' + esc(c.sym) + '"><span class="note">%</span> <button class="chip book" type="button" data-cd-do="book" data-cd-sym="' + esc(c.sym) + '">Sell %</button> <button class="chip sell" type="button" data-cd-do="close" data-cd-sym="' + esc(c.sym) + '">Close all</button>' : '') + '</td>';
      h += '</tr>';
    });
    h += '</tbody></table></div><p class="note" style="margin:8px 0 0"><b>Your sells</b> fill at the coin\'s last closed 4H close (shown), never a live price, and are checked again by the build. <b>Sell %</b> sells that share of what is held (no profit rule). After <b>Close all</b>, the system does not make buy 2 into the same low; a new, lower 30-day low can be bought again.</p></div>';

    h += '<div class="card"><h2>Trades</h2>';
    if (!d.trades.length) h += '<p class="note" style="margin:0">No trades yet. Buys appear here when a coin\'s 2nd early bottom sign fires.</p>';
    else {
      h += '<div class="scroll"><table><thead><tr><th>When</th><th>Coin</th><th>What</th><th class="r">Price</th><th class="r">Amount</th><th class="r">Coins</th><th class="r">P&amp;L</th></tr></thead><tbody>';
      d.trades.forEach(function (t) {
        h += '<tr><td class="num">' + (t.kind === 'buy' ? esc(dd(t.day)) + ' close' : esc(when(t.t + 4 * 3600))) + '</td><td><b>' + esc(t.sym) + '</b></td><td>' + (t.kind === 'buy' ? 'Buy ' + t.n + ' <span class="note">(' + esc(t.signs.map(function (s) { return NAMES[s] || s; }).join(', ')) + ')</span>' : esc(t.what)) + '</td><td class="r num">' + px(t.px) + '</td><td class="r num">' + usd(t.usd) + '</td><td class="r num">' + esc(t.qty) + '</td><td class="r num ' + cls(t.pnl) + '">' + (t.kind === 'sell' ? usd(t.pnl, true) : '') + '</td></tr>';
      });
      h += '</tbody></table></div>';
    }
    if (d.skipped && d.skipped.length) h += '<p class="note" style="margin:8px 0 0">Not bought: ' + d.skipped.map(function (b) { return esc(b.sym + ' buy ' + b.n + ' ' + dd(b.day) + ' (' + b.skipped + ')'); }).join('; ') + '.</p>';
    return h + '<p class="note" style="margin:8px 0 0">Signs: the BTC &amp; ETH dashboard\'s cycle tabs (⚡ Early warning, daily). They call a bounce with many false alarms: about half of these buys went 10%+ lower first in the backtests. Paper only, not financial advice.</p></div>';
  }

  function nonce() { var a = new Uint8Array(16); crypto.getRandomValues(a); return Array.prototype.map.call(a, function (x) { return ('0' + x.toString(16)).slice(-2); }).join(''); }
  document.addEventListener('click', function (e) {
    var b = e.target.closest('[data-cd-do]'); if (!b || !owner || !doc) return;
    var sym = b.getAttribute('data-cd-sym'), kind = b.getAttribute('data-cd-do'), c = doc.coins.filter(function (x) { return x.sym === sym; })[0];
    if (!c || !(c.qty > 0)) return;
    var n = kind === 'book' ? Number((document.querySelector('[data-cd-pct="' + sym + '"]') || {}).value) : 100;
    if (kind === 'book' && !(Number.isInteger(n) && n >= 1 && n <= 99)) { alert('Enter a whole number from 1 to 99.'); return; }
    if (!confirm((kind === 'book' ? 'Sell ' + n + '% of your ' : 'Close all of your ') + sym + ' at the last closed 4H price ' + px(c.price) + '?\n\nPaper only (05 · Cycle DCA). The other tabs are not changed.')) return;
    var slug = location.pathname.split('/')[1] || '', api = slug ? '/api/' + slug + '/' : 'api/';
    var req = { tab: 'cycle-dca', sym: sym, kind: kind, percent: n, nonce: nonce(), trade_id: c.episode, journal_count: doc.journal_count, last_close: c.last_close };
    document.querySelectorAll('[data-cd-do]').forEach(function (x) { x.disabled = true; });
    fetch(api + 'action', { method: 'POST', credentials: 'same-origin', redirect: 'manual', headers: { 'content-type': 'application/json' }, body: JSON.stringify(req) })
      .then(function (r) { return r.json().then(function (x) { if (!r.ok) throw Error(x.error || 'HTTP ' + r.status); alert('Sent, not filled yet. The build checks it and fills it at the last 4H close; reload in about 2 minutes.'); }); })
      .catch(function (err) { document.querySelectorAll('[data-cd-do]').forEach(function (x) { x.disabled = false; }); alert('Not sent: ' + err.message); });
  });
  window.CycleDcaView = { render: render };
})();
