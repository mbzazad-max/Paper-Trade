/* Paper-Trade page: display only. Every number comes from the JSON the GitHub build writes (paper.json,
   s083-paper.json, freshness.json). Owner buttons send a request to /api/paper-trade/ (behind the home site's login);
   the build checks it and fills it at the last closed 4H candle's close. Layout adapted from Paper-Test. */
(() => {
'use strict';
const $ = (s) => document.querySelector(s);
const esc = (x) => String(x == null ? '' : x).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = (n) => !Number.isFinite(n) ? '—' : (n < 0 ? '−' : n > 0 ? '+' : '') + '$' + Math.abs(n).toLocaleString('en-AU', { maximumFractionDigits: 2, minimumFractionDigits: 2 });
const pct = (n) => !Number.isFinite(n) ? '—' : (n < 0 ? '−' : n > 0 ? '+' : '') + Math.abs(n).toFixed(2) + '%';
const plain = (n) => !Number.isFinite(n) ? '—' : Math.abs(n).toFixed(0) + '%';
const price = (n) => !Number.isFinite(n) ? '—' : n.toLocaleString('en-AU', { maximumFractionDigits: n < 1 ? 7 : n < 100 ? 4 : 2 });
const tone = (n) => n > 0 ? 'positive' : n < 0 ? 'negative' : 'neutral';
const when = (t) => {
  if (!Number.isFinite(t)) return '—';
  return new Intl.DateTimeFormat('en-AU', { timeZone: 'Australia/Sydney', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }).format(new Date(t * 1000));
};
const slug = (location.pathname.match(/^\/([a-z0-9-]+)\//) || [])[1];
const API = slug ? '/api/' + slug + '/' : 'api/';
const TABS = ['zone', 'mss', 's083'];
let paper = null, s083 = null, fresh = null, owner = false, tab = TABS.includes(location.hash.slice(1)) ? location.hash.slice(1) : 'zone';
const getJSON = async (p) => { try { const r = await fetch(p, { cache: 'no-store', credentials: 'same-origin', redirect: 'manual' }); return r.ok ? await r.json() : null; } catch (e) { return null; } };
const metric = (name, val, note, colour) => '<div class="card metric"><div class="name">' + esc(name) + '</div><div class="value ' + (colour || '') + '">' + esc(val) + '</div><div class="hint">' + esc(note || '') + '</div></div>';
const notice = (t) => { $('#fresh').textContent = t; };
const nonce = () => (crypto.randomUUID ? crypto.randomUUID().replace(/-/g, '') : Date.now().toString(36) + Math.random().toString(36).slice(2, 12) + 'xx');

function notStarted(start) {
  const s = Number.isFinite(start) ? 'Fresh paper trading starts at ' + when(start) + '.' : 'Fresh paper trading starts at go-live, at the next 4H candle boundary.';
  return '<div class="card"><h2>Not started yet</h2><p>' + esc(s) + ' Nothing from before the start is counted: no trades, advice or P&amp;L are carried over from Coin Zones or Paper-Test.</p></div>';
}
function curve(cv, cap) {
  if (!cv || cv.length < 2) return '<p class="quiet">The equity curve starts after the first closed 4H candle.</p>';
  const W = 640, H = 170, L = 52, R = 8, T = 8, B = 22, xs = cv.map((p) => p[0]), ys = cv.map((p) => p[1] / cap * 100);
  const x0 = xs[0], x1 = xs[xs.length - 1]; let lo = Math.min(0, ...ys), hi = Math.max(0, ...ys); if (hi - lo < 0.5) { hi += 0.25; lo -= 0.25; }
  const X = (t) => L + (t - x0) / Math.max(1, x1 - x0) * (W - L - R), Y = (v) => T + (hi - v) / (hi - lo) * (H - T - B);
  const d = cv.map((p, i) => (i ? 'L' : 'M') + X(p[0]).toFixed(1) + ' ' + Y(p[1] / cap * 100).toFixed(1)).join(' '), last = ys[ys.length - 1];
  let s = '<svg viewBox="0 0 ' + W + ' ' + H + '" width="100%" role="img" aria-label="Equity curve">';
  [hi, 0, lo].forEach((v) => { s += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + Y(v).toFixed(1) + '" y2="' + Y(v).toFixed(1) + '" stroke="#293a50"' + (v === 0 ? ' stroke-dasharray="3 3"' : '') + '/><text x="' + (L - 6) + '" y="' + (Y(v) + 4).toFixed(1) + '" text-anchor="end">' + (v > 0 ? '+' : '') + v.toFixed(2) + '%</text>'; });
  return s + '<path d="' + d + '" fill="none" stroke="' + (last >= 0 ? '#6ee7ba' : '#ff8e9d') + '" stroke-width="2"/></svg>';
}
function controls(attrs, canBook, pctAttr) {
  return '<div class="manual-controls"><input class="field" type="number" min="1" max="99" step="1" value="50" aria-label="Percent to book" ' + pctAttr + '>'
    + '<button class="btn good" data-act="book" ' + attrs + (canBook ? '' : ' disabled title="Only a position in net profit can be booked"') + '>Book %</button>'
    + '<button class="btn danger" data-act="close" ' + attrs + '>Close all</button></div>';
}

function showZone(mode) {
  if (!paper) { $('#content').innerHTML = '<div class="card"><h2>Waiting for the first build</h2></div>'; return; }
  if (!paper.started) { $('#content').innerHTML = notStarted(paper.start); return; }
  const d = paper[mode], S = d.live, fee = paper.fee_pct_each_side / 100;
  const rows = paper.per_coin.slice();
  const logs = rows.flatMap((x) => x[mode].manual_log || []).sort((a, b) => b.t - a.t);
  const booked = logs.reduce((n, x) => n + (Number(x.usd) || 0), 0);
  let h = '<div class="grid">' + metric('Net P&L', money(S.net), pct(S.net_pct) + ' of ' + money(S.capital).replace('+', ''), tone(S.net))
    + metric('Closed trades', String(S.closed), S.wins + ' won · ' + S.losses + ' lost' + (S.win_rate != null ? ' · ' + plain(S.win_rate) + ' win rate' : ''))
    + metric('Open positions', String(S.open), 'unrealised ' + money(S.unrealized), tone(S.unrealized))
    + metric('Manual closes and bookings', money(booked), logs.length + ' action' + (logs.length === 1 ? '' : 's') + ' in this tab', tone(booked)) + '</div>';
  h += '<div class="card"><h2>' + esc(d.name) + '</h2><p>Started ' + esc(when(paper.start)) + ' · ' + paper.cohort_count + ' coins · $' + paper.size.toLocaleString('en-AU') + ' per trade · ' + paper.fee_pct_each_side + '% fee each side · long only (spot) · ' + S.pending + ' buy order' + (S.pending === 1 ? '' : 's') + ' waiting</p>'
    + (mode === 'mss' ? '<p class="quiet">Buys only when both agree: the board\'s buy zone and a 4H market structure shift up from it. Entry is the middle of the shift\'s gap, stop just below the sweep low, targets are the board\'s targets at least 1R away. An order stands for 12 candles.</p>'
      : '<p class="quiet">Buys at the board\'s spot-setup entry (buy-zone middle) when a 4H candle trades down to it. Stop is the setup stop.</p>')
    + '<p class="quiet">Automatic exits: half at T1 (stop then moves to entry), the rest at T2; a stop is assumed to hit first if a candle touches both. <b>Close all</b> closes what is left; <b>Book %</b> closes that share of what is left and needs the position to be in net profit. Both fill at the last closed 4H close.</p>'
    + curve(S.curve, S.capital) + '</div>';
  h += '<div class="card"><h2>Positions and orders</h2><div class="scroll"><table><thead><tr><th>Coin</th><th>State</th><th class="num">Entry</th><th class="num">Stop</th><th class="num">T1</th><th class="num">T2</th><th class="num">Last 4H close</th><th class="num">Left</th><th class="num">P&amp;L</th><th class="num">Owner</th></tr></thead><tbody>';
  rows.sort((a, b) => (b[mode].open ? 1 : 0) - (a[mode].open ? 1 : 0) || (b[mode].pending ? 1 : 0) - (a[mode].pending ? 1 : 0));
  for (const row of rows) {
    const x = row[mode], p = x.open, n = x.pending, lv = p || n;
    const state = p ? 'Open long' + (p.half ? ' · T1 taken' : '') : n ? 'Buy order' : (x.latest && !x.latest.none ? 'Waiting for new advice' : esc((x.latest && x.latest.state) || 'No advice yet').toLowerCase());
    const canBook = p && (p.mark - p.entry) - fee * (p.mark + p.entry) > 0;
    h += '<tr><td><strong>' + esc(row.sym) + '</strong></td><td>' + state + '</td>'
      + '<td class="num">' + (lv ? price(lv.entry) : '—') + '</td><td class="num">' + (p ? price(p.active_stop) : n ? price(n.stop) : '—') + '</td>'
      + '<td class="num">' + (p ? price(p.target1) : n ? price(n.t1) : '—') + '</td><td class="num">' + (p ? price(p.target2) : n ? price(n.t2) : '—') + '</td>'
      + '<td class="num">' + price(x.last_price) + '</td><td class="num">' + (p ? plain(p.remaining_pct) : '—') + '</td>'
      + '<td class="num ' + tone(p ? p.usd : x.realized) + '">' + (p || x.closed ? money(x.net) : '—') + '</td><td class="num">'
      + (p && owner ? controls('data-strategy="zone_pnl" data-mode="' + mode + '" data-sym="' + esc(row.sym) + '"', canBook, 'data-pct="' + mode + ':' + esc(row.sym) + '"') : p ? '<span class="hint">sign in</span>' : '') + '</td></tr>';
  }
  h += '</tbody></table></div></div>';
  h += logTable(logs) + tradesTable(rows.flatMap((r) => r[mode].trades || []).sort((a, b) => (b.exit_t || 0) - (a.exit_t || 0)).slice(0, 40), false);
  $('#content').innerHTML = h;
}
function logTable(logs) {
  let h = '<div class="card"><h2>Manual closes and bookings</h2><div class="scroll"><table><thead><tr><th>Coin</th><th>Action</th><th>4H close</th><th class="num">Fill</th><th class="num">Left after</th><th class="num">P&amp;L of that part</th></tr></thead><tbody>';
  for (const a of logs.slice(0, 50)) h += '<tr><td>' + esc(a.sym) + '</td><td>' + esc(String(a.action).replace(/_/g, ' ')) + '</td><td>' + esc(when(a.t)) + '</td><td class="num">' + price(a.px) + '</td><td class="num">' + plain(a.remaining_pct) + '</td><td class="num ' + tone(a.usd) + '">' + money(a.usd) + '</td></tr>';
  return h + (logs.length ? '' : '<tr><td colspan="6">None yet.</td></tr>') + '</tbody></table></div></div>';
}
function tradesTable(trades, sides) {
  let h = '<div class="card"><h2>Closed trades</h2><div class="scroll"><table><thead><tr><th>Coin</th>' + (sides ? '<th>Side</th>' : '') + '<th>Opened</th><th class="num">Entry</th><th>Closed</th><th class="num">Avg exit</th><th>How</th><th class="num">P&amp;L</th></tr></thead><tbody>';
  for (const t of trades) h += '<tr><td>' + esc(t.sym) + '</td>' + (sides ? '<td>' + (t.side > 0 ? 'Long' : 'Short') + '</td>' : '') + '<td>' + esc(when(t.entry_t)) + '</td><td class="num">' + price(t.entry) + '</td><td>' + esc(when(t.exit_t)) + '</td><td class="num">' + price(t.exit) + '</td><td>' + esc(String(t.reason || '—').replace(/_/g, ' ')) + '</td><td class="num ' + tone(t.usd) + '">' + money(t.usd) + '</td></tr>';
  return h + (trades.length ? '' : '<tr><td colspan="' + (sides ? 8 : 7) + '">No closed trades yet.</td></tr>') + '</tbody></table></div></div>';
}

function showS083() {
  if (!s083) { $('#content').innerHTML = '<div class="card"><h2>Waiting for the first build</h2></div>'; return; }
  if (!s083.started) { $('#content').innerHTML = notStarted(s083.start); return; }
  const q = s083.summary, P = s083.params;
  let h = '<div class="grid">' + metric('Net P&L', money(q.net), 'closed + open', tone(q.net)) + metric('Realised', money(q.realized), q.closed + ' closed · ' + q.wins + ' won', tone(q.realized))
    + metric('Open P&L', money(q.unrealized), 'at the last 4H close', tone(q.unrealized)) + metric('Open positions', q.open + ' of ' + s083.order.length, 'one per coin at most') + '</div>';
  h += '<div class="card"><h2>s083 Participation regime</h2><p>Started ' + esc(when(s083.start)) + ' · ' + s083.order.join(', ') + ' · $' + s083.size.toLocaleString('en-AU') + ' per trade · ' + s083.fee_pct_each_side + '% fee each side · no leverage</p>'
    + '<p class="quiet">On each 4H close: if the average volume of the last ' + P.vfast + ' candles is above that of the last ' + P.vslow + ', go long when price is above its level ' + P.mom + ' candles ago and short when below; otherwise flat. No stop loss. Shorts are virtual (paper only).'
    + (s083.join_open_regime ? '' : ' Fresh start: a long or short that was already standing at the start is not joined; each coin waits for its next new signal.') + '</p>'
    + '<p class="quiet"><b>Close all</b> closes what is left and the same side is not reopened until the signal goes flat or turns. <b>Book %</b> closes that share of what is left and needs the trade to be in profit. Both fill at the last closed 4H close.</p></div>';
  h += '<div class="card"><h2>Positions</h2><div class="scroll"><table><thead><tr><th>Coin</th><th>Signal now</th><th class="num">Last 4H close</th><th>Position</th><th class="num">Entry</th><th class="num">Left</th><th class="num">Open P&amp;L</th><th class="num">Owner</th></tr></thead><tbody>';
  for (const sym of s083.order) {
    const c = s083.coins[sym], p = c.open, sig = c.signal > 0 ? 'Long' : c.signal < 0 ? 'Short' : 'Flat';
    h += '<tr><td><strong>' + esc(sym) + '</strong><div class="hint">' + esc(when(c.last_close)) + '</div></td><td>' + sig + (c.blocked_side && !p ? '<div class="hint">waiting for a new signal</div>' : '') + '</td>'
      + '<td class="num">' + price(c.price) + '</td><td>' + (p ? (p.side > 0 ? 'Long' : 'Short (virtual)') : 'None') + '</td><td class="num">' + (p ? price(p.entry) : '—') + '</td>'
      + '<td class="num">' + (p ? plain(p.left_pct) : '—') + '</td><td class="num ' + tone(p ? p.unrealized : 0) + '">' + (p ? money(p.unrealized) : '—') + '</td><td class="num">'
      + (p && owner ? controls('data-strategy="s083" data-sym="' + esc(sym) + '"', p.side * (c.price / p.entry - 1) > 0, 'data-pct="s083:' + esc(sym) + '"') : p ? '<span class="hint">sign in</span>' : '') + '</td></tr>';
  }
  h += '</tbody></table></div></div>';
  const logs = s083.order.flatMap((s) => (s083.coins[s].manual_log || []).filter((a) => a.action !== 'signal_exit')).sort((a, b) => b.t - a.t);
  h += logTable(logs) + tradesTable(s083.order.flatMap((s) => (s083.coins[s].trades || []).map((t) => ({ ...t, sym: s }))).sort((a, b) => b.exit_t - a.exit_t).slice(0, 40), true);
  $('#content').innerHTML = h;
}

function render() {
  document.querySelectorAll('[data-tab]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === tab)));
  if (tab === 's083') showS083(); else showZone(tab);
}
function freshLine() {
  if (!fresh) return 'Built data not found yet.';
  const ids = (paper && paper.cohort ? paper.cohort : ['BTC']).map((s) => 'binance/' + s + 'USDT/4H');
  const rows = (fresh.series || []).filter((x) => ids.includes(x.id) && Number.isFinite(x.last_close));
  const common = rows.length ? Math.min(...rows.map((x) => x.last_close)) : null;
  const old = common && Date.now() / 1000 - common > 8 * 3600;
  return 'Last build ' + when(fresh.built_at) + ' · latest closed 4H candle for all coins ' + when(common) + (old ? ' (more than 8 hours old)' : '') + ' · ' + (fresh.last_result || '');
}
async function ownerCheck() {
  const a = await getJSON(API + 'access');
  owner = !!(a && a.owner === true && a.actions_ready === true);
  $('#role').textContent = owner ? 'Owner' : a && a.owner ? 'Signed in · controls unavailable' : 'View only';
  $('#refresh').hidden = !owner;
  if (a && a.owner && !owner) notice('Signed in, but the controls cannot reach GitHub: ' + (a.error || 'unknown error') + '.');
  else if (owner && a.workflow && (a.workflow.status === 'queued' || a.workflow.status === 'in_progress')) notice('An update is running. The page shows the last good data until it finishes.');
  render();
}
async function send(b) {
  const strategy = b.dataset.strategy, mode = b.dataset.mode, sym = b.dataset.sym, kind = b.dataset.act;
  const key = strategy === 's083' ? 's083:' + sym : mode + ':' + sym, field = document.querySelector('[data-pct="' + key + '"]');
  const percent = kind === 'book' ? Number(field && field.value) : 100;
  if (kind === 'book' && !(Number.isInteger(percent) && percent >= 1 && percent <= 99)) { alert('Enter a whole number from 1 to 99.'); return; }
  let payload, px, label;
  if (strategy === 's083') {
    const c = s083.coins[sym]; px = c.price; label = 's083 ' + sym;
    payload = { strategy, sym, kind, percent, nonce: nonce(), trade_id: c.open.id, event_count: s083.event_count, last_close: c.last_close };
  } else {
    const x = paper.per_coin.find((r) => r.sym === sym)[mode]; px = x.last_price; label = (mode === 'mss' ? 'With MSS' : 'Without MSS') + ' ' + sym;
    payload = { strategy, mode, sym, kind, percent, nonce: nonce(), trade_id: x.open.id, event_count: paper.zone_event_count, last_close: x.last_close };
  }
  if (!confirm((kind === 'book' ? 'Book ' + percent + '% of what is left of ' : 'Close all of ') + label + ' at the last closed 4H price ' + price(px) + '? Paper only; the other tabs are not affected.')) return;
  const r = await fetch(API + 'trade', { method: 'POST', credentials: 'same-origin', redirect: 'manual', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
  let j = {}; try { j = await r.json(); } catch (e) { /* no body */ }
  if (!r.ok) { alert(j.error || 'Refused. Reload and try again.'); return; }
  document.querySelectorAll('button[data-act]').forEach((x) => { x.disabled = true; });
  notice('Queued, not filled yet. The page reloads when the update has finished (about 2 minutes).');
  track(Date.now());
}
function track(since) {
  let n = 0;
  const tick = async () => {
    n++; const s = await getJSON(API + 'status');
    if (s && s.status === 'completed' && Date.parse(s.started || 0) >= since - 15000) {
      if (s.conclusion === 'success') { location.reload(); return; }
      notice('The update failed, so nothing was filled and the last good data stays. Check the run on GitHub Actions.'); return;
    }
    if (s && (s.status === 'queued' || s.status === 'in_progress')) notice('Update ' + s.status.replace('_', ' ') + '…');
    if (n < 30) setTimeout(tick, 8000);
  };
  setTimeout(tick, 6000);
}
document.addEventListener('click', async (e) => {
  const t = e.target.closest('[data-tab]'); if (t) { tab = t.dataset.tab; history.replaceState(null, '', '#' + tab); render(); return; }
  const b = e.target.closest('button[data-act]'); if (b && owner) { try { await send(b); } catch (err) { alert('Request failed: ' + err.message); } }
});
window.addEventListener('hashchange', () => { const t = location.hash.slice(1); if (TABS.includes(t)) { tab = t; render(); } });
$('#refresh').addEventListener('click', async () => {
  $('#refresh').disabled = true;
  try {
    const r = await fetch(API + 'refresh', { method: 'POST', credentials: 'same-origin', redirect: 'manual', headers: { 'content-type': 'application/json' }, body: '{}' });
    const j = await r.json(); if (!r.ok) throw new Error(j.error || r.status);
    notice('Refresh started. It uses the candles already in Market-Data.'); track(Date.now());
  } catch (err) { notice('Could not start the refresh: ' + err.message); $('#refresh').disabled = false; }
});
Promise.all([getJSON('paper.json'), getJSON('s083-paper.json'), getJSON('freshness.json')]).then(async ([a, b, c]) => {
  paper = a; s083 = b; fresh = c; notice(freshLine()); render(); await ownerCheck();
});
})();
