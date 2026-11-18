/* Opens public/index.html in jsdom and checks the three tabs with no page errors:
     1. the real built files (before go-live: "Not started" on every tab, no buttons);
     2. made-up started data, as a visitor (no buttons) and as the signed-in owner (Book % / Close all on open trades,
        and a click sends a correct request to /api/paper-trade/trade).
   usage: node tests/render.js <jsdom module path> */
'use strict';
const fs = require('fs'), path = require('path'), assert = require('assert/strict');
const { JSDOM, VirtualConsole } = require(process.argv[2] || 'jsdom');
const PUB = path.resolve(__dirname, '../public'), sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const T = 1795000000 - (1795000000 % 14400);

function started() {
  const coin = (sym, open) => ({ sym,
    zone: { net: open ? 12.5 : 0, realized: 0, closed: 0, trades: [], pending: open ? null : { t: T, entry: 9, stop: 8, t1: 11, t2: 12 }, latest: { t: T, none: false },
      open: open ? { sym, id: 'zone:' + sym + ':' + T + ':' + (T + 14400), entry_t: T + 14400, entry: 10, stop: 9, active_stop: 9, target1: 12, target2: 14, half: false, remaining_pct: 100, usd: 12.5, mark: 10.2 } : null,
      last_close: T + 8 * 14400, last_price: 10.2, manual_log: [] },
    mss: { net: 0, realized: 0, closed: 1, trades: [{ sym, entry_t: T, entry: 10, exit_t: T + 14400, exit: 9.5, reason: 'stop', usd: -50.2 }], open: null, pending: null, latest: { t: T, none: true, state: 'WAIT: NO STRUCTURE SHIFT' }, last_close: T + 8 * 14400, last_price: 10.2, manual_log: [] } });
  const live = (o) => ({ closed: o, wins: 0, losses: o, win_rate: o ? 0 : null, realized: -50.2 * o, unrealized: 12.5, net: 12.5 - 50.2 * o, net_pct: 0.01, capital: 26000, open: 1 - o, pending: 1, curve: [[T, 0], [T + 14400, 5]] });
  const paper = { generated: '', start: T, started: true, cohort: ['BTC', 'ETH'], cohort_count: 2, size: 1000, fee_pct_each_side: 0.1, zone_event_count: 0,
    zone: { name: 'Buy zone only (without MSS)', live: live(0) }, mss: { name: 'Buy zone + 4H structure shift (with MSS)', live: live(1) }, per_coin: [coin('BTC', true), coin('ETH', false)] };
  const c = (sym, open) => ({ sym, price: 100, last_close: T + 8 * 14400, signal: open ? -1 : 1, blocked_side: open ? 0 : 1, closed: 0, wins: 0, losses: 0, realized: 0, unrealized: open ? 4 : 0, net: open ? 4 : 0, trades: [], manual_log: [],
    open: open ? { id: sym + ':-1:' + T, side: -1, entry_t: T, entry: 105, left_pct: 100, mark: 100, unrealized: 4, legs: [] } : null });
  const s083 = { start: T, started: true, name: 'Participation regime', size: 1000, fee_pct_each_side: 0.1, params: { vfast: 42, vslow: 360, mom: 84 }, order: ['BTC', 'ETH', 'BNB', 'SOL'], join_open_regime: false, event_count: 3,
    coins: { BTC: c('BTC', true), ETH: c('ETH'), BNB: c('BNB'), SOL: c('SOL') }, summary: { realized: 0, unrealized: 4, net: 4, closed: 0, wins: 0, losses: 0, open: 1 } };
  return { 'paper.json': paper, 's083-paper.json': s083 };
}

async function open(files, isOwner) {
  const errors = [], posts = [], vc = new VirtualConsole(); vc.on('jsdomError', (e) => errors.push(String(e.message || e)));
  const dom = new JSDOM(fs.readFileSync(path.join(PUB, 'index.html'), 'utf8').replace('<script src="app.js" defer></script>', ''), { url: 'https://dashboards.example/paper-trade/', resources: 'usable', runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc,
    beforeParse(w) {
      w.confirm = () => true; w.alert = (m) => errors.push('alert: ' + m);
      w.fetch = async (u, o) => {
        u = String(u);
        if (u.startsWith('/api/paper-trade/')) {
          if (!isOwner) return { ok: false, status: 302, json: async () => null };
          if (u.endsWith('access')) return { ok: true, status: 200, json: async () => ({ owner: true, actions_ready: true, workflow: { status: 'completed' } }) };
          if (u.endsWith('trade')) { posts.push(JSON.parse(o.body)); return { ok: true, status: 202, json: async () => ({ state: 'queued' }) }; }
          return { ok: true, status: 200, json: async () => ({ status: 'in_progress' }) };
        }
        const name = u.replace(/^.*\//, '');
        if (files && files[name]) return { ok: true, status: 200, json: async () => JSON.parse(JSON.stringify(files[name])) };
        const f = path.join(PUB, name); if (!fs.existsSync(f)) return { ok: false, status: 404, json: async () => null };
        return { ok: true, status: 200, json: async () => JSON.parse(fs.readFileSync(f, 'utf8')) };
      };
    } });
  // jsdom loads app.js from file:// relative to the page URL only for file URLs: inject it directly
  const s = dom.window.document.createElement('script'); s.textContent = fs.readFileSync(path.join(PUB, 'app.js'), 'utf8'); dom.window.document.body.appendChild(s);
  await sleep(300);
  return { dom, d: dom.window.document, errors, posts };
}
const tabs = async (d, fn) => { for (const t of ['zone', 'mss', 's083']) { d.querySelector('[data-tab="' + t + '"]').click(); await sleep(30); fn(t, d.getElementById('content').textContent); } };

(async () => {
  // 1. real built files
  let { d, errors } = await open(null, false);
  assert.equal(d.querySelectorAll('[data-tab]').length, 3);
  assert.deepEqual([...d.querySelectorAll('[data-tab]')].map((b) => b.textContent), ['01 · Top 20 P&L — without MSS', '02 · Top 20 P&L — with MSS', '03 · s083 Participation Regime']);
  const realStarted = JSON.parse(fs.readFileSync(path.join(PUB, 'paper.json'), 'utf8')).started;
  await tabs(d, (t, txt) => { if (!realStarted) assert.match(txt, /Not started yet/, t); assert(txt.length > 40, t + ' empty'); });
  assert.equal(d.querySelectorAll('button[data-act]').length, 0); assert.deepEqual(errors, []);
  // 2a. started, visitor
  ({ d, errors } = await open(started(), false));
  await tabs(d, (t, txt) => { assert.match(txt, t === 's083' ? /Participation regime/ : /Positions and orders/, t); assert.doesNotMatch(txt, /Not started/); });
  assert.equal(d.querySelectorAll('button[data-act]').length, 0, 'visitor must not see controls'); assert.equal(d.getElementById('refresh').hidden, true); assert.deepEqual(errors, []);
  // 2b. started, owner
  let posts; ({ d, errors, posts } = await open(started(), true));
  assert.equal(d.getElementById('role').textContent, 'Owner'); assert.equal(d.getElementById('refresh').hidden, false);
  d.querySelector('[data-tab="zone"]').click(); await sleep(30);
  assert.equal(d.querySelectorAll('button[data-act]').length, 2, 'zone: one open trade, two buttons');
  d.querySelector('[data-pct="zone:BTC"]').value = '30'; d.querySelector('button[data-act="book"][data-mode="zone"]').click(); await sleep(50);
  assert.deepEqual({ ...posts[0], nonce: 'x' }, { strategy: 'zone_pnl', mode: 'zone', sym: 'BTC', kind: 'book', percent: 30, nonce: 'x', trade_id: 'zone:BTC:' + T + ':' + (T + 14400), event_count: 0, last_close: T + 8 * 14400 });
  ({ d, errors, posts } = await open(started(), true));
  d.querySelector('[data-tab="mss"]').click(); await sleep(30); assert.equal(d.querySelectorAll('button[data-act]').length, 0, 'mss: nothing open');
  d.querySelector('[data-tab="s083"]').click(); await sleep(30);
  assert.match(d.getElementById('content').textContent, /Short \(virtual\)/); assert.match(d.getElementById('content').textContent, /waiting for a new signal/);
  d.querySelector('button[data-act="close"][data-strategy="s083"]').click(); await sleep(50);
  assert.equal(posts[0].strategy, 's083'); assert.equal(posts[0].kind, 'close'); assert.equal(posts[0].percent, 100); assert.equal(posts[0].event_count, 3);
  assert.deepEqual(errors, []);
  console.log('render: ok (3 tabs; not-started, visitor and owner views; buttons send the right request)');
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
