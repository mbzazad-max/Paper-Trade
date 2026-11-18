/* Coin Zones build: runs the ORIGINAL engine files (public/engine.js, series.js, holdodds.js, pnl.js, unchanged)
   over shared candles from the market-data repo, the same way the scheduled Claude refresh did:
     coins : ZE.buildCoin(sym, last 1000 closed 4H, last 1200 closed 1D, spot_symbol, fut_symbol)
             hold = HO.current(those 1D bars, data.hold.pool)
     gauges: SR.buildGauges(R) with globalThis.HO and HOLD_POOL_G = data.hold.poolG, 4H series last 5000
     P&L   : PNL.snap(now, coin.spot_setup) + PNL.mergeBars(old, 4H bars, start, now) for each cohort coin
   Only closed candles exist in market-data (the importer enforces it), so nothing here can see a forming candle.

   usage: node build/build.js <market-data dir> [--force]
   Writes public/data.json, public/pnl.json, public/freshness.json and state/pnl/*.json.
   A coin or gauge that cannot be built keeps its last good version and is reported; it is never invented.
   If the inputs are unchanged since the last build (and not --force), nothing is rebuilt. */
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const ROOT = path.resolve(__dirname, '..'), PUB = path.join(ROOT, 'public'), ST = path.join(ROOT, 'state', 'pnl');
const MD = path.resolve(process.argv[2] || '../market-data'), FORCE = process.argv.includes('--force');
const NOW = process.env.BUILD_NOW ? Number(process.env.BUILD_NOW) : Math.floor(Date.now() / 1000);

const ZE = require(path.join(PUB, 'engine.js'));
const HO = require(path.join(PUB, 'holdodds.js'));
const SR = require(path.join(PUB, 'series.js'));
const PNL = require(path.join(PUB, 'pnl.js'));

const rd = f => JSON.parse(fs.readFileSync(f, 'utf8'));
const wr = (f, o) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, JSON.stringify(o)); };
const cfg = rd(path.join(ROOT, 'config', 'board.json'));
const manifest = rd(path.join(MD, 'manifest.json')).series;
const prev = rd(path.join(PUB, 'data.json'));               // last good board
const removed = new Set(cfg.removed || []);                 // rows taken off the board for good: never kept as 'last good'
prev.coins = prev.coins.filter(c => !removed.has(c.sym));
const prevFresh = fs.existsSync(path.join(PUB, 'freshness.json')) ? rd(path.join(PUB, 'freshness.json')) : null;

function csvFile(id) { const [src, sym, tf] = id.split('/'); return path.join(MD, 'data', src, `${sym}_${tf}.csv`); }
function load(id) {                                          // {t,o,h,l,c,v} numeric arrays, oldest first
  const f = csvFile(id); if (!fs.existsSync(f)) return null;
  const lines = fs.readFileSync(f, 'utf8').trim().split('\n'); lines.shift();
  const B = { t: [], o: [], h: [], l: [], c: [], v: [] };
  for (const ln of lines) { const p = ln.split(','); B.t.push(+p[0]); B.o.push(+p[1]); B.h.push(+p[2]); B.l.push(+p[3]); B.c.push(+p[4]); B.v.push(+p[5]); }
  return B;
}
const last = (B, n) => { const o = {}; for (const k of 'tohlcv') o[k] = B[k].slice(-n); return o; };
const stampOf = s => new Date(s * 1000).toISOString().slice(0, 16).replace('T', ' ') + ' UTC';

// ---- which series are used, and have they changed since the last build? ----
const used = new Set();
cfg.coins.forEach(c => { used.add(c.series_4h); used.add(c.series_1d); });
Object.values(cfg.gauges.series).forEach(id => used.add(id));
const engineSum = ['engine.js', 'series.js', 'holdodds.js', 'pnl.js'].map(f => crypto.createHash('sha256').update(fs.readFileSync(path.join(PUB, f))).digest('hex')).join(',');
const inputsHash = crypto.createHash('sha256').update(JSON.stringify([engineSum, cfg, [...used].sort().map(id => [id, manifest[id] && manifest[id].last_open, manifest[id] && manifest[id].rows])])).digest('hex');

function freshnessRows() {
  return [...used].sort().map(id => {
    const m = manifest[id] || null;
    return { id, source: id.split('/')[0], symbol: m ? m.symbol : id.split('/')[1], tf: id.split('/')[2], period_s: m ? m.period_s : null,
      last_open: m ? m.last_open : null, last_close: m ? m.last_close : null, fetched_at: m ? m.fetched_at : null, rows: m ? m.rows : 0 };
  });
}

if (!FORCE && prevFresh && prevFresh.inputs_hash === inputsHash) {
  prevFresh.checked_at = NOW; prevFresh.series = freshnessRows();
  prevFresh.last_result = 'No new candles since the last build; board unchanged.';
  wr(path.join(PUB, 'freshness.json'), prevFresh);
  console.log(JSON.stringify({ skipped: true, reason: 'inputs unchanged', checked_at: NOW }));
  process.exit(0);
}

// ---- coins ----
const built = {}, kept = [], bars4 = {};
for (const c of cfg.coins) {
  const B4 = load(c.series_4h), Bd = load(c.series_1d);
  if (!B4 || !Bd || B4.t.length < 60 || Bd.t.length < 2) { kept.push({ sym: c.sym, why: `missing data (${!B4 ? c.series_4h : !Bd ? c.series_1d : 'too few candles'})` }); continue; }
  try {
    const b4 = last(B4, cfg.bars.coin_4h), bd = last(Bd, cfg.bars.coin_1d);
    const n = ZE.buildCoin(c.sym, b4, bd, c.spot_symbol, c.fut_symbol);
    try { n.hold = HO.current(bd, prev.hold && prev.hold.pool); } catch (e) { /* same as the original: hold left out if it fails */ }
    built[c.sym] = n; bars4[c.sym] = B4;
  } catch (e) { kept.push({ sym: c.sym, why: 'engine error: ' + (e && e.message || e) }); }
}

// ---- gauges ----
const R = {}, gaugeMissing = [];
for (const [k, id] of Object.entries(cfg.gauges.series)) { const B = load(id); if (B) R[k] = last(B, cfg.bars.gauge_4h); else gaugeMissing.push(k); }
globalThis.HO = HO; globalThis.ZE = ZE; globalThis.HOLD_POOL_G = prev.hold && prev.hold.poolG;
let G = [];
try { G = SR.buildGauges(R); } catch (e) { kept.push({ sym: 'gauges', why: 'engine error: ' + (e && e.message || e) }); }
G = G.filter(g => !removed.has(g.sym));
G.forEach(g => { built[g.sym] = g; });

// ---- assemble the board: same order as the last good board; unbuilt rows keep their last good version ----
const out = JSON.parse(JSON.stringify(prev));
out.coins = prev.coins.map(c => built[c.sym] || c);
const gaugeSyms = new Set(prev.coins.filter(c => c.kind === 'gauge').map(c => c.sym));
prev.coins.filter(c => c.kind === 'gauge' && !built[c.sym]).forEach(c => kept.push({ sym: c.sym, why: 'gauge input missing or too short' }));
G.filter(g => !gaugeSyms.has(g.sym)).forEach(g => out.coins.unshift(g));
// coins added to config/board.json since the last good board: appended in config order once they have data
const onBoard = new Set(out.coins.map(c => c.sym)), waiting = new Set();
for (const c of cfg.coins) {
  if (onBoard.has(c.sym)) continue;
  if (built[c.sym]) out.coins.push(built[c.sym]); else waiting.add(c.sym);   // no data yet: not on the board until it arrives
}
out.meta.generated = stampOf(NOW);
out.meta.gauges = out.coins.filter(c => c.kind === 'gauge').length;   // the page header shows these counts
out.meta.n = out.coins.length - out.meta.gauges;

// ---- validate before writing anything ----
const problems = [];
for (const c of cfg.coins) if (!waiting.has(c.sym) && !out.coins.find(x => x.sym === c.sym)) problems.push(`${c.sym} missing from board`);
for (const c of out.coins) if (!(c.price > 0) || !Array.isArray(c.zones)) problems.push(`${c.sym}: invalid price or zones`);
if (problems.length) { console.error('Validation failed, nothing written:\n' + problems.join('\n')); process.exit(1); }

// ---- P&L paper test (state lives in state/pnl, mirrors the page database collection "pnl") ----
let pnlNote = 'not set up';
if (fs.existsSync(path.join(ST, 'cfg.json'))) {
  const pc = rd(path.join(ST, 'cfg.json')); let n = 0;
  if (NOW >= pc.end) pnlNote = 'test window has ended, no new advice recorded';
  else {
    for (const sym of pc.cohort) {
      const c = built[sym]; if (!c || !bars4[sym]) continue;
      const sf = path.join(ST, `s_${sym}.json`), bf = path.join(ST, `b_${sym}.json`);
      const S = fs.existsSync(sf) ? rd(sf) : { sym, snaps: [] }, Bo = fs.existsSync(bf) ? rd(bf) : null;
      S.snaps = (S.snaps || []).concat([PNL.snap(NOW, c.spot_setup)]);
      wr(sf, S); wr(bf, PNL.mergeBars(Bo, bars4[sym], pc.start, NOW)); n++;
    }
    pnlNote = `advice recorded for ${n} of ${pc.cohort.length} coins`;
  }
  const docs = {};
  for (const f of fs.readdirSync(ST)) if (f.endsWith('.json')) docs[f.slice(0, -5)] = rd(path.join(ST, f));
  wr(path.join(PUB, 'pnl.json'), docs);
}

wr(path.join(PUB, 'data.json'), out);
const fresh = { built_at: NOW, checked_at: NOW, generated: out.meta.generated, inputs_hash: inputsHash,
  built: Object.keys(built).length, kept, gauge_inputs_missing: gaugeMissing, pnl: pnlNote,
  last_result: kept.length ? `Built ${Object.keys(built).length}; ${kept.length} kept their last good version.` : `Built all ${Object.keys(built).length}.`,
  series: freshnessRows() };
wr(path.join(PUB, 'freshness.json'), fresh);
console.log(JSON.stringify({ built: Object.keys(built).length, kept, gaugeMissing, pnl: pnlNote, generated: out.meta.generated }));
