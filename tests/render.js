/* Opens public/index.html (with cloud.js and app.js) in jsdom and checks the two tabs with no page errors:
     1. the real built files (before the start: "Not started" on every tab, no buttons);
     2. made-up started data as a visitor (no buttons, no Refresh) and as the signed-in owner (Book / Close all on
        open positions only, and a click sends the right request to /api/paper-trade/action).
   usage: node tests/render.js <jsdom module path> */
'use strict';
const fs = require('fs'), path = require('path'), assert = require('assert/strict');
const { JSDOM, VirtualConsole } = require(process.argv[2] || 'jsdom');
const PUB = path.resolve(__dirname, '../public'), sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const T = 1795000000 - (1795000000 % 14400), LC = T + 8 * 14400;

function started() {
  const sum = (o) => ({ closed: o, wins: 0, losses: o, win_rate: o ? 0 : null, realized: -50 * o, open_pnl: 12.5, net: 12.5 - 50 * o, net_pct: 0.05, capital: 2000, profit_factor: null, max_dd: -20, open: 1 - o, pending: 1, buy_hold_pct: 1.2, curve: [[T, 0], [T + 14400, 5]], same_as_pnl_js: 'all coins' });
  const coin = (sym, open, mode) => ({ sym, last_close: LC, price: 10.2, realized: 0, net: open ? 12.5 : 0, advice: 'setup', log: [], trades: mode === 'mss' ? [{ id: 'mss:' + sym + ':' + T, entry_t: T, entry: 10, exit_t: T + 14400, exit: 9.5, how: 'stop', usd: -50, pct: -5 }] : [],
    open: open ? { id: mode + ':' + sym + ':' + (T + 14400), entry_t: T + 14400, entry: 10, stop: 9, now_stop: 9, t1: 12, t2: 14, half: false, left_pct: 100, usd: 12.5, mark: 10.2 } : null,
    pending: open ? null : { since: T, entry: 9, stop: 8, t1: 11, t2: 12 } });
  const paper = { started: true, start: T, cohort: ['BTC', 'ETH'], size: 1000, fee: 0.1, journal_count: 2, generated: new Date(LC * 1000).toISOString(),
    mss: { sum: sum(0), coins: [coin('BTC', true, 'mss'), coin('ETH', false, 'mss')] } };
  const c = (open) => ({ price: 100, last_close: LC, signal: open ? -1 : 1, waiting: open ? 0 : 1, realized: 0, unrealized: open ? 4 : 0, net: open ? 4 : 0, trades: [], log: [],
    open: open ? { id: 'BTC:S:' + T, side: -1, entry_t: T, entry: 105, left_pct: 100, mark: 100, unrealized: 4, booked: 0, parts: [] } : null });
  const s083 = { started: true, start: T, name: 'Participation regime', coins: ['BTC', 'ETH', 'BNB', 'SOL'], size: 1000, fee: 0.1, params: { vfast: 42, vslow: 360, mom: 84 }, join: false, journal_count: 3,
    sum: { realized: 0, unrealized: 4, net: 4, closed: 0, wins: 0, losses: 0, open: 1 }, per: { BTC: c(true), ETH: c(), BNB: c(), SOL: c() } };
  return { 'paper.json': paper, 's083-paper.json': s083 };
}

async function open(files, isOwner) {
  const errors = [], posts = [], vc = new VirtualConsole(); vc.on('jsdomError', (e) => errors.push(String(e.message || e)));
  const html = fs.readFileSync(path.join(PUB, 'index.html'), 'utf8').replace(/<script src="(cloud|app|mss-rvol-ui|signal-desk-engine|signal-desk-ui)\.js"><\/script>/g, '').replace(/<link[^>]*fonts[^>]*>/g, '');
  const dom = new JSDOM(html, { url: 'https://dashboards.example/paper-trade/', runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc,
    beforeParse(w) {
      const noop = () => {}, ctx = new Proxy({}, { get: (o, k) => (k in o ? o[k] : noop), set: (o, k, v) => { o[k] = v; return true; } });
      w.HTMLCanvasElement.prototype.getContext = () => ctx;   // jsdom has no canvas; the Signal Desk charts draw into this no-op
      w.confirm = () => true; w.alert = (m) => errors.push('alert: ' + m);
      w.fetch = async (u, o) => {
        u = String(u);
        if (u.startsWith('/api/paper-trade/')) {
          if (!isOwner) return { ok: false, status: 302, json: async () => ({}) };
          if (u.endsWith('/owner')) return { ok: true, status: 200, json: async () => ({ owner: true, ready: true }) };
          if (u.endsWith('/action')) { posts.push(JSON.parse(o.body)); return { ok: true, status: 202, json: async () => ({ state: 'started' }) }; }
          return { ok: true, status: 200, json: async () => ({ status: 'completed', conclusion: 'success', started: '2020-01-01T00:00:00Z' }) };
        }
        const name = u.replace(/^.*\//, '');
        if (files && files[name]) return { ok: true, status: 200, json: async () => JSON.parse(JSON.stringify(files[name])) };
        const f = path.join(PUB, name); if (!fs.existsSync(f)) return { ok: false, status: 404, json: async () => null };
        return { ok: true, status: 200, json: async () => JSON.parse(fs.readFileSync(f, 'utf8')) };
      };
    } });
  for (const f of ['cloud.js', 'mss-rvol-ui.js', 'signal-desk-engine.js', 'signal-desk-ui.js', 'app.js']) { const s = dom.window.document.createElement('script'); s.textContent = fs.readFileSync(path.join(PUB, f), 'utf8'); dom.window.document.body.appendChild(s); }
  await sleep(300);
  return { d: dom.window.document, errors, posts };
}
const tabs = async (d, fn) => { for (const t of ['mss', 's083']) { d.querySelector('[data-tab="' + t + '"]').click(); await sleep(20); fn(t, d.getElementById('main').textContent); } };

(async () => {
  // 1. the real built files
  let { d, errors } = await open(null, false);
  assert.deepEqual([...d.querySelectorAll('[data-tab]')].map((b) => b.textContent), ['01 · Top 20 P&L — with MSS', '02 · s083 Participation Regime', '03 · MSS-RVOL', '04 · RSI Signal Desk']);
  assert.equal(d.querySelector('h1').textContent, 'Paper-Trade'); assert(d.querySelector('.dash-back'), 'link back to all dashboards missing');
  const real = JSON.parse(fs.readFileSync(path.join(PUB, 'paper.json'), 'utf8'));
  await tabs(d, (t, txt) => { if (!real.started) assert.match(txt, /Not started yet/, t); assert(txt.length > 40, t + ' empty'); });
  assert.equal(d.querySelectorAll('button[data-do]').length, 0);
  d.querySelector('[data-tab="mss-rvol"]').click(); await sleep(20);
  assert.match(d.getElementById('main').textContent, /MSS-RVOL/);
  d.querySelector('[data-tab="rsi-desk"]').click(); await sleep(300);
  assert.match(d.getElementById('main').textContent, /BTC RSI Signal Desk/); assert.match(d.getElementById('trades').textContent, /\d/, 'RSI Signal Desk trade history empty');
  assert.equal(d.querySelectorAll('#sd button[data-do]').length, 0, 'the Signal Desk has no owner buttons');
  assert.deepEqual(errors, []);
  // 2a. started, visitor
  ({ d, errors } = await open(started(), false));
  await tabs(d, (t, txt) => { assert.match(txt, t === 's083' ? /s083 Participation regime/ : /with MSS/); assert.doesNotMatch(txt, /Not started/); });
  assert.equal(d.querySelectorAll('button[data-do]').length, 0, 'a visitor must not see the buttons');
  d.querySelector('[data-tab="mss-rvol"]').click(); await sleep(20);
  assert.equal(d.querySelectorAll('button[data-mrv-action]').length, 0, 'visitor must not see MSS-RVOL owner actions'); assert.equal(d.getElementById('ghRefresh').hidden, true, 'a visitor must not see Refresh');
  assert.deepEqual(errors, []);
  // 2b. started, owner
  let posts; ({ d, errors, posts } = await open(started(), true));
  assert.equal(d.getElementById('who').textContent, 'Owner'); assert.equal(d.getElementById('ghRefresh').hidden, false, 'owner should see Refresh');
  assert.equal(d.querySelector('[data-tab="zone"]'), null, 'the without-MSS tab was removed');
  d.querySelector('[data-tab="mss"]').click(); await sleep(20);
  assert.equal(d.querySelectorAll('button[data-do]').length, 2, 'with MSS: one open position, two buttons');
  d.querySelector('[data-pct="mss:BTC"]').value = '30'; d.querySelector('button[data-do="book"][data-t="mss"]').click(); await sleep(30);
  assert.equal(posts.length, 1); const p0 = { ...posts[0] }; assert.match(p0.nonce, /^[0-9a-f]{32}$/); delete p0.nonce;
  assert.deepEqual(p0, { tab: 'mss', sym: 'BTC', kind: 'book', percent: 30, trade_id: 'mss:BTC:' + (T + 14400), journal_count: 2, last_close: LC });
  ({ d, errors, posts } = await open(started(), true));
  d.querySelector('[data-tab="s083"]').click(); await sleep(20);
  assert.match(d.getElementById('main').textContent, /Short \(virtual\)/); assert.match(d.getElementById('main').textContent, /waiting for a new signal/);
  d.querySelector('button[data-do="close"][data-t="s083"]').click(); await sleep(30);
  assert.deepEqual([posts[0].tab, posts[0].sym, posts[0].kind, posts[0].percent, posts[0].journal_count, posts[0].trade_id], ['s083', 'BTC', 'close', 100, 3, 'BTC:S:' + T]);
  assert.deepEqual(errors, []);
  console.log('render: ok (Coin Zones look; 4 tabs; old tabs unchanged; visitor and owner views; manual actions validated)');
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
