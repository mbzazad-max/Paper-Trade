/* 04 · RSI Signal Desk checks (run in every build):
   1. engine: public/signal-desk-engine.js is byte-for-byte the engine script inside the original page
      (reference/signal-desk.original.html, the claude.ai Signal Desk as it was on 25 Nov 2026).
   2. data: Market-Data BTC (Binance) = the original page's saved BTC candles (TradingView BINANCE:BTCUSDT) on every
      shared candle, and the engine gives the same BTC trades on both over the original window.
   3. page: the ORIGINAL page and the new tab, opened in jsdom on the same saved candles at the same moment, show the
      same text in every section (signal panels, ETH <-> BTC link, tentative cycle, stats, months, trades) for BTC.
   4. the built public/signal-desk.json has BTC (and ETH, BTC's comparison coin) on 4H and 1D, closed candles only,
      and the tab renders BTC only, with no asset switch and no page errors.
   usage: node tests/signal-desk.js <market-data> <jsdom module path> */
'use strict';
const fs = require('fs'), path = require('path'), assert = require('assert/strict');
const ROOT = path.resolve(__dirname, '..'), MD = path.resolve(process.argv[2] || 'md');
const { JSDOM, VirtualConsole } = require(process.argv[3] || 'jsdom');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const REF_HTML = fs.readFileSync(path.join(ROOT, 'reference/signal-desk.original.html'), 'utf8');
const REF = JSON.parse(fs.readFileSync(path.join(ROOT, 'reference/signal-desk.data.original.json'), 'utf8'));
const ENGINE = fs.readFileSync(path.join(ROOT, 'public/signal-desk-engine.js'), 'utf8');
const UI = fs.readFileSync(path.join(ROOT, 'public/signal-desk-ui.js'), 'utf8');

// 1. engine
const scripts = [...REF_HTML.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
assert.equal(scripts[0], ENGINE, 'signal-desk-engine.js differs from the engine inside the original page');
global.window = undefined; eval(ENGINE); const SIG = globalThis.SIG;

// 2. data: Market-Data BTC vs the original saved BTC candles
function csv(sym, tf) {
  const L = fs.readFileSync(path.join(MD, 'data/binance', sym + 'USDT_' + tf + '.csv'), 'utf8').trim().split('\n'); L.shift();
  const m = new Map(); for (const x of L) { const v = x.split(',').map(Number); m.set(v[0], v); } return m;
}
const T_END = REF['4H'].t[REF['4H'].t.length - 1] + 14400;          // the moment the original data was saved (its forming 4H bar's close)
for (const tf of ['4H', '1D']) {
  const md = csv('BTC', tf), r = REF[tf]; let same = 0, missing = 0;
  for (let i = 0; i < r.t.length; i++) {
    const v = md.get(r.t[i]); if (!v) { missing++; continue; }
    const last = i === r.t.length - 1;                                 // the original's last bar was still forming when saved
    if (!last) { for (const [k, j] of [['h', 2], ['l', 3], ['c', 4]]) assert(Math.abs(v[j] - r[k][i]) <= 1e-6 * v[j], `BTC ${tf} ${k} differs at ${r.t[i]}: ${v[j]} vs ${r[k][i]}`); same++; }
  }
  assert(missing <= 2, `BTC ${tf}: ${missing} original candles not in Market-Data`);
  const b = { t: [], h: [], l: [], c: [] };
  for (const t of r.t) { const v = md.get(t); if (v) { b.t.push(t); b.h.push(v[2]); b.l.push(v[3]); b.c.push(v[4]); } }
  const A = SIG.run(r, tf, T_END - 1), B = SIG.run(b, tf, T_END - 1), key = (x) => x.trades.map((q) => [q.et, q.xt, q.why, q.e, +q.x.toFixed(6)].join('|'));
  assert.deepEqual(key(B), key(A), `BTC ${tf}: Market-Data gives different trades from the original data`);
  console.log(`data: BTC ${tf} ${same} candles identical to the original (TradingView BINANCE:BTCUSDT); ${A.trades.length} trades identical`);
}

// 3 + 4. pages in jsdom
function stubCanvas(w) {
  const noop = () => {}, ctx = new Proxy({}, { get: (o, k) => (k in o ? o[k] : noop), set: (o, k, v) => { o[k] = v; return true; } });
  w.HTMLCanvasElement.prototype.getContext = () => ctx;
}
const IDS = ['p4H', 'p1D', 'links', 'cycles', 'stats', 'months', 'trades'];
const text = (d) => Object.fromEntries(IDS.map((id) => [id, d.getElementById(id).textContent.replace(/\s+/g, ' ').trim()]));
async function original(nowMs) {
  const errors = [], vc = new VirtualConsole(); vc.on('jsdomError', (e) => errors.push(String(e.message || e)));
  const dom = new JSDOM(REF_HTML.replace(/<link[^>]*fonts[^>]*>/g, ''), { url: 'https://claude.example/artifact/', runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc,
    beforeParse(w) { stubCanvas(w); w.Date.now = () => nowMs; w.fetch = async () => ({ ok: true, json: async () => JSON.parse(JSON.stringify(REF)) }); } });
  await sleep(200); return { d: dom.window.document, errors };
}
async function tab(nowMs, data) {
  const errors = [], vc = new VirtualConsole(); vc.on('jsdomError', (e) => errors.push(String(e.message || e)));
  const html = '<!doctype html><html><body><main id="main"></main><script>' + ENGINE + '</script><script>' + UI + '</script></body></html>';
  const dom = new JSDOM(html, { url: 'https://dashboards.example/paper-trade/#rsi-desk', runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc,
    beforeParse(w) { stubCanvas(w); w.Date.now = () => nowMs; w.fetch = async (u) => { assert.equal(String(u), 'signal-desk.json'); return { ok: true, json: async () => JSON.parse(JSON.stringify(data)) }; }; } });
  const w = dom.window; w.document.getElementById('main').innerHTML = w.SignalDeskView.html(); w.SignalDeskView.mount();
  await sleep(200); return { d: w.document, errors };
}
(async () => {
  const nowMs = (T_END - 3600) * 1000;                                // inside the original's forming 4H candle, as when it was saved
  const asData = { generated: REF.generated, assets: { BTC: { sym: REF.symbol, '4H': REF['4H'], '1D': REF['1D'] }, ETH: { sym: REF.ethSymbol, '4H': REF.ETH['4H'], '1D': REF.ETH['1D'] } } };
  const o = await original(nowMs), n = await tab(nowMs, asData);
  for (const a of ['BTC']) {
    const A = text(o.d), B = text(n.d);
    for (const id of IDS) { assert(A[id].length > 10, `${a} ${id}: the original page shows nothing`); assert.equal(B[id], A[id], `${a} ${id}: the tab shows different text from the original page`); }
    o.d.getElementById('t1D').click(); n.d.getElementById('t1D').click(); await sleep(20);
    assert.equal(text(n.d).trades, text(o.d).trades, a + ' 1D trades differ'); assert.equal(text(n.d).stats, text(o.d).stats, a + ' 1D stats differ');
    o.d.getElementById('t4H').click(); n.d.getElementById('t4H').click(); await sleep(20);
    console.log(`page: ${a} identical to the original page in ${IDS.length} sections (${IDS.reduce((n, id) => n + A[id].length, 0)} characters), 4H and 1D history`);
  }
  assert.deepEqual(o.errors, []); assert.deepEqual(n.errors, []);

  const built = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/signal-desk.json'), 'utf8')), now = Date.now() / 1000;
  assert.deepEqual(Object.keys(built.assets).sort(), ['BTC', 'ETH'], 'live for BTC only (ETH as its comparison coin)');
  for (const a of ['BTC', 'ETH']) for (const [tf, sec] of [['4H', 14400], ['1D', 86400]]) {
    const b = built.assets[a][tf]; assert(b && b.t.length >= 300, a + ' ' + tf + ' missing'); assert(b.t[b.t.length - 1] + sec <= now, a + ' ' + tf + ' has a forming candle');
    assert(b.t.length === b.h.length && b.t.length === b.l.length && b.t.length === b.c.length, a + ' ' + tf + ' arrays differ in length');
  }
  const live = await tab(Date.now(), built);
  assert.equal(live.d.getElementById('sdTitle').textContent, 'BTC RSI Signal Desk'); assert.equal(live.d.querySelector('#sd .asset'), null, 'BTC only: no asset switch');
  const t = text(live.d); for (const id of IDS) assert(t[id].length > 10, 'BTC ' + id + ' is empty');
  assert.match(t.links, /ETH RSI\(7\)/, 'BTC: the link section compares ETH with BTC'); assert.match(t.p4H, /ETH check:/, 'BTC: ETH check line missing');
  assert.deepEqual(live.errors, []);
  console.log('built: BTC (+ ETH for the link) on 4H and 1D, closed candles only; the tab renders BTC with no errors');
  console.log('signal-desk: ok');
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
