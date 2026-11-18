/* Coin Zones on Cloudflare: Refresh button (asks GitHub to rebuild from the newest shared data)
   and a freshness strip that flags every series more than one candle old. Uses the page's own styles. */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  // Controls live at /api/<slug>/ on the home site, which always needs the owner's login.
  // Visitors without the login (the public view) never see the Refresh button.
  var slug = location.pathname.split('/')[1] || '';
  var API = slug ? '/api/' + slug + '/' : 'api/';
  var row = document.querySelector('header .row');
  var pill = document.createElement('span'); pill.className = 'pill'; pill.id = 'runState'; pill.hidden = true;
  var btn = document.createElement('button'); btn.className = 'chip main'; btn.type = 'button'; btn.id = 'ghRefresh'; btn.textContent = 'Refresh'; btn.hidden = true;
  btn.title = 'Ask GitHub to rebuild the board from the newest shared data';
  row.appendChild(pill); row.appendChild(btn);
  var strip = document.createElement('div'); strip.className = 'banner'; strip.id = 'fresh'; strip.hidden = true;
  $('banner').parentNode.insertBefore(strip, $('banner').nextSibling);

  var t2s = function (s) { if (!s) return '-'; var d = new Date(s * 1000); return d.toLocaleDateString([], { day: 'numeric', month: 'short' }) + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); };
  function state(text, kind) { pill.hidden = false; pill.className = 'pill ' + (kind || ''); pill.textContent = text; }

  function showFresh(F) {
    var now = Date.now() / 1000, rows = F.series.map(function (s) {
      var behind = s.last_close ? Math.max(0, Math.floor((now - s.last_close) / s.period_s)) : null;
      return { s: s, behind: behind, flag: behind === null || behind > 1 };
    });
    var flagged = rows.filter(function (r) { return r.flag; });
    var head = 'Board built ' + esc(F.generated) + ' · last check ' + esc(t2s(F.checked_at)) + ' · ' + rows.length + ' data series, ' +
      (flagged.length ? '<b>' + flagged.length + ' more than one candle old</b>' : 'all within one candle');
    if (F.kept && F.kept.length) head += ' · kept last good: ' + F.kept.map(function (k) { return esc(k.sym); }).join(', ');
    var body = rows.map(function (r) {
      var s = r.s, label = esc(s.symbol + ' ' + s.tf) + ' <span class="note">(' + esc(s.source) + ')</span>';
      var st = r.behind === null ? 'no data yet' : r.behind === 0 ? 'current' : r.behind + ' candle' + (r.behind > 1 ? 's' : '') + ' behind';
      return '<tr' + (r.flag ? ' style="color:var(--warn)"' : '') + '><td>' + label + '</td><td>' + esc(t2s(s.last_close)) + '</td><td>' + st + '</td></tr>';
    }).join('');
    var kept = (F.kept || []).map(function (k) { return '<li>' + esc(k.sym) + ': ' + esc(k.why) + '</li>'; }).join('');
    strip.hidden = false;
    strip.style.background = flagged.length ? 'var(--warn-bg)' : 'var(--sup-bg)';
    strip.style.color = flagged.length ? 'var(--warn)' : 'var(--sup)';
    strip.innerHTML = '<details><summary>' + head + '</summary>' +
      (kept ? '<p class="note" style="margin:8px 0 4px">These rows show their last good version:</p><ul class="note" style="margin:0 0 8px">' + kept + '</ul>' : '') +
      '<table style="margin-top:8px;border-collapse:collapse;font-size:13px"><thead><tr><th style="text-align:left;padding-right:16px">Series</th>' +
      '<th style="text-align:left;padding-right:16px">Last closed candle (your time)</th><th style="text-align:left">Status</th></tr></thead><tbody>' + body + '</tbody></table>' +
      '<p class="note" style="margin:8px 0 0">' + esc(F.last_result || '') + ' Only closed candles are used. "Behind" counts closed candles missing right now.</p></details>';
  }
  function loadFresh() {
    return fetch('freshness.json', { cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : null; }).then(function (F) { if (F) showFresh(F); }).catch(function () {});
  }

  var polling = null;
  function poll(startedAt) {
    clearTimeout(polling);
    fetch(API + 'status', { cache: 'no-store', redirect: 'manual', credentials: 'same-origin' }).then(function (r) { if (!r.ok) throw new Error('no access'); return r.json(); }).then(function (s) {
      btn.hidden = false;
      if (s.status && s.status !== 'completed') { state('Running…', 'warn'); btn.disabled = true; polling = setTimeout(function () { poll(startedAt || Date.now()); }, 8000); return; }
      btn.disabled = false;
      if (!startedAt) return;
      if (s.conclusion === 'success') { state('Done ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), 'sup'); setTimeout(function () { location.reload(); }, 1500); }
      else state('Refresh failed, last good board kept', 'warn');
    }).catch(function () { btn.disabled = false; if (startedAt) state('Could not check progress', 'warn'); else btn.hidden = true; });
  }
  btn.addEventListener('click', function () {
    btn.disabled = true; state('Starting…', '');
    fetch(API + 'refresh', { method: 'POST', redirect: 'manual', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: '{}' })
      .then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error(j.error || ('HTTP ' + r.status)); return j; }); })
      .then(function () { state('Running…', 'warn'); setTimeout(function () { poll(Date.now()); }, 5000); })
      .catch(function (e) { btn.disabled = false; state('Refresh not started: ' + e.message, 'warn'); });
  });
  loadFresh();
  poll(0);
})();

/* "← Dashboards" link back to the home site, same as the Data check page. Added on Cloudflare only; the page itself is unchanged. */
(function () {
  'use strict';
  var st = document.createElement('style');
  st.textContent = '.dash-back{display:inline-block;font-size:13px;line-height:1.4;color:var(--muted,var(--color-fg-muted,#586878));text-decoration:none;white-space:nowrap}' +
    '.dash-back:hover{text-decoration:underline}.dash-back-row{margin:0 0 6px}';
  document.head.appendChild(st);
  var a = document.createElement('a'); a.className = 'dash-back'; a.href = '/'; a.textContent = '← Dashboards';
  a.title = 'Back to the list of dashboards';
  var host = document.body.firstElementChild;
  while (host && (/^(SCRIPT|STYLE|LINK|META|NOSCRIPT|TITLE|TEMPLATE)$/.test(host.tagName) || getComputedStyle(host).display === 'none')) host = host.nextElementSibling;
  var row = document.createElement('div'); row.className = 'dash-back-row'; row.appendChild(a);
  if (host && host.classList.contains('fx-bar')) { a.style.marginRight = '6px'; host.insertBefore(a, host.firstChild); }
  else if (host) host.insertBefore(row, host.firstChild);
  else document.body.insertBefore(row, document.body.firstChild);
})();
