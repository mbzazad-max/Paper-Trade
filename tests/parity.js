/* Copied from coin-zones tests/parity.js; the only change is marked "Paper-Trade change".
   Parity test: the ORIGINAL page code (reference/index.original.html, its own "Refresh all from TradingView")
   versus build/build.js, fed the SAME candles.
   usage: node tests/parity.js <market-data dir with every series> <jsdom module path>
   The page asks TradingView for 4H x1000 and 1D x1200 per coin and 4H x5000 per gauge; the mock answers with
   exactly the bars build.js uses. Everything the page saves (board docs) is compared with build.js output.
   Known, intended difference: the page drops its last daily bar before computing hold odds, because in the page
   that bar is TradingView's still-forming candle. market-data holds closed candles only, so build.js uses all of them,
   as the scheduled Claude refresh did. The test reports hold separately. */
'use strict';
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const MD = path.resolve(process.argv[2]), { JSDOM } = require(process.argv[3]);
const ROOT = path.resolve(__dirname, '..'), REF = path.join(ROOT, 'reference'), PUB = path.join(ROOT, 'public');
const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'config/board.json'), 'utf8'));
const load = id => { const [s, y, t] = id.split('/'); const L = fs.readFileSync(path.join(MD, 'data', s, `${y}_${t}.csv`), 'utf8').trim().split('\n').slice(1);
  const B = { t: [], o: [], h: [], l: [], c: [], v: [] }; for (const x of L) { const p = x.split(','); 'tohlcv'.split('').forEach((k, i) => B[k].push(+p[i])); } return B; };
const tail = (B, n) => { const o = {}; for (const k in B) o[k] = B[k].slice(-n); return o; };
// page symbol -> series
const SYM = {};
cfg.coins.forEach(c => { SYM[c.spot_symbol + '|4h'] = c.series_4h; SYM[c.spot_symbol + '|1D'] = c.series_1d; });
const GS = { T2: 'CRYPTOCAP:TOTAL2ES', TOT: 'CRYPTOCAP:TOTAL', T3: 'CRYPTOCAP:TOTAL3ES', USDT: 'CRYPTOCAP:USDT.D', USDC: 'CRYPTOCAP:USDC.D', ETHBTC: 'BINANCE:ETHBTC' };
for (const [k, s] of Object.entries(GS)) SYM[s + '|4h'] = cfg.gauges.series[k];

// Paper-Trade change: before the fresh start there is no state/pnl/cfg.json, so the page's P&L part is checked with a
// parity-only config (the 26 coins, started 30 days ago) that lives only in this test and its temp copy.
const CFG_FILE = path.join(ROOT, 'state/pnl/cfg.json'), PZ = JSON.parse(fs.readFileSync(path.join(ROOT, 'config/paper.json'), 'utf8')).zone;
const T30 = Math.floor(Date.now() / 1000 / 14400) * 14400 - 30 * 86400;
const pnlCfg = fs.existsSync(CFG_FILE) ? JSON.parse(fs.readFileSync(CFG_FILE, 'utf8')) : { cohort: PZ.cohort, start: T30, end: T30 + PZ.days * 86400, days: PZ.days, size: PZ.size, fee: PZ.fee };
const store = { 'pnl/cfg': pnlCfg };
const mkSnap = col => ({ docs: Object.keys(store).filter(k => k.startsWith(col + '/')).map(k => ({ id: k.slice(col.length + 1), data: () => JSON.parse(JSON.stringify(store[k])) })) });
const DB = { collection: c => ({ get: async () => mkSnap(c) }), doc: p => ({ set: async o => { store[p] = JSON.parse(JSON.stringify(o)); }, get: async () => ({ exists: p in store, data: () => store[p] }) }) };
const MCP = { callTool: async (server, tool, a) => {
  const id = SYM[a.symbol + '|' + a.interval]; if (!id) throw { code: 'tool_error', message: 'no fixture for ' + a.symbol };
  return { payload: { success: true, bars: tail(load(id), a.count) } }; } };

(async () => {
  const html = fs.readFileSync(path.join(REF, 'index.original.html'), 'utf8');
  const vc = new (require(process.argv[3]).VirtualConsole)();
  const dom = new JSDOM(html, { virtualConsole: vc, url: 'file://' + path.join(PUB, 'index.html'), runScripts: 'dangerously', resources: 'usable', pretendToBeVisual: true,
    beforeParse(w) {
      w.RF_GAP_MS = 0;
      w.claude = { use: async k => (k === 'mcp' ? MCP : k === 'db' ? DB : null) };
      w.fetch = async u => { const f = path.join(PUB, String(u).replace(/^.*\//, '')); const b = fs.readFileSync(f.endsWith('data.json') ? path.join(REF, 'data.original.json') : f, 'utf8');
        return { ok: true, status: 200, json: async () => JSON.parse(b), text: async () => b }; };
    } });
  // the original page loads engine.js etc. from its own folder: serve them from public/ (byte-identical, checksummed)
  const w = dom.window, sleep = ms => new Promise(r => setTimeout(r, ms));
  for (let i = 0; i < 200 && (!w.document.getElementById('full') || w.document.getElementById('full').hidden); i++) await sleep(50);
  if (w.document.getElementById('full').hidden) throw new Error('page did not offer the full refresh (mock not picked up)');
  w.document.getElementById('full').click();
  for (let i = 0; i < 1200 && !/^Refresh all/.test(w.document.getElementById('full').textContent); i++) await sleep(100);
  const ts = (store['board/meta'] || {}).ts; if (!ts) throw new Error('page saved nothing: ' + w.document.getElementById('live').textContent);
  // run build.js on the same candles at the same moment
  const tmp = fs.mkdtempSync('/tmp/cz-parity-'); execFileSync('cp', ['-r', ROOT + '/.', tmp]);
  fs.copyFileSync(path.join(REF, 'data.original.json'), path.join(tmp, 'public/data.json')); try { fs.unlinkSync(path.join(tmp, 'public/freshness.json')); } catch (e) {}
  fs.mkdirSync(path.join(tmp, 'state/pnl'), { recursive: true }); fs.writeFileSync(path.join(tmp, 'state/pnl/cfg.json'), JSON.stringify(pnlCfg));
  for (const f of fs.readdirSync(path.join(tmp, 'state/pnl'))) if (f !== 'cfg.json') fs.unlinkSync(path.join(tmp, 'state/pnl', f));
  execFileSync('node', [path.join(tmp, 'build/build.js'), MD, '--force'], { env: { ...process.env, BUILD_NOW: String(Math.floor(ts / 1000)) } });
  const ours = JSON.parse(fs.readFileSync(path.join(tmp, 'public/data.json'), 'utf8'));
  const ourPnl = JSON.parse(fs.readFileSync(path.join(tmp, 'public/pnl.json'), 'utf8'));
  const strip = o => { const c = JSON.parse(JSON.stringify(o)); for (const k of Object.keys(c)) if (k[0] === '_' || k === 'hold') delete c[k];
    (c.zones || []).forEach(z => delete z.strongest); return c; };
  const diffs = (a, b, p = '') => { if (JSON.stringify(a) === JSON.stringify(b)) return []; if (typeof a !== 'object' || typeof b !== 'object' || !a || !b) return [p || '(root)'];
    return [...new Set([...Object.keys(a), ...Object.keys(b)])].flatMap(k => diffs(a[k], b[k], p + '.' + k)); };
  const res = { identical: [], different: {}, hold_same: [], hold_differs: [], missing: [] };
  for (const [k, doc] of Object.entries(store)) {
    if (!k.startsWith('board/c_')) continue;
    const o = ours.coins.find(c => 'c_' + c.sym.replace(/[^A-Za-z0-9]+/g, '_') === k.slice(6));
    if (!o) { res.missing.push(k); continue; }
    const d = diffs(strip(doc), strip(o)); if (d.length) res.different[o.sym] = d.slice(0, 5); else res.identical.push(o.sym);
    if (doc.hold || o.hold) (JSON.stringify(doc.hold) === JSON.stringify(o.hold) ? res.hold_same : res.hold_differs).push(o.sym);
  }
  // every hold difference must be explained by the page dropping its last daily bar and nothing else
  const HO = require(path.join(PUB, 'holdodds.js')), pool = JSON.parse(fs.readFileSync(path.join(REF, 'data.original.json'), 'utf8')).hold.pool;
  res.hold_explained = []; res.hold_unexplained = [];
  for (const sym of res.hold_differs) { const c = cfg.coins.find(x => x.sym === sym); if (!c) { res.hold_unexplained.push(sym); continue; }
    const bd = tail(load(c.series_1d), cfg.bars.coin_1d), cut = {}; for (const k in bd) cut[k] = bd[k].slice(0, -1);
    const k = 'board/c_' + sym.replace(/[^A-Za-z0-9]+/g, '_');
    (JSON.stringify(HO.current(cut, pool)) === JSON.stringify(store[k].hold) ? res.hold_explained : res.hold_unexplained).push(sym); }
  // P&L: bars must match exactly; advice snapshots must match apart from the time stamp
  const pd = [], notOnPage = []; for (const sym of store['pnl/cfg'].cohort) {
    // Paper-Trade change: the original page only has its 28 coins; AVAX, ARB, RENDER, RAY, FET and WIF were added to
    // the board later (16 Nov 2026), so the page cannot record them. Listed, not counted (coin-zones' own test shows the same).
    if (!store['board/c_' + sym.replace(/[^A-Za-z0-9]+/g, '_')]) { notOnPage.push(sym); continue; }
    const pb = store['pnl/b_' + sym], ob = ourPnl['b_' + sym], ps = store['pnl/s_' + sym], os = ourPnl['s_' + sym];
    if (JSON.stringify(pb) !== JSON.stringify(ob)) pd.push(sym + ' bars');
    const st = s => s && s.snaps.map(x => { const y = { ...x }; delete y.t; return y; });
    if (JSON.stringify(st(ps)) !== JSON.stringify(st(os))) pd.push(sym + ' advice'); }
  res.pnl_differences = pd; res.pnl_not_on_original_page = notOnPage;
  console.log(JSON.stringify({ page_message: w.document.getElementById('live').textContent, compared: res.identical.length + Object.keys(res.different).length, ...res }, null, 1));
  w.close(); process.exit(Object.keys(res.different).length || res.missing.length || pd.length || res.hold_unexplained.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
