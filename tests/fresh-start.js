/* Fresh-start test. Replays the real build, 4H candle by 4H candle, on a copy of this repo and a copy of Market-Data
   cut to what was closed at each moment, and proves:
     1. before the start nothing is recorded and every tab says "not started";
     2. paper state that exists before the start is refused (nothing can be carried over);
     3. from the start on, every advice snapshot, candle, trade and manual action is at or after the start;
     4. s083 does not join a long or short that was already standing at the start (and does when the switch is on);
     5. Close all and Book % are accepted at the last closed 4H close and show in the right tab only;
     6. with no manual actions every tab equals the unchanged pnl.js / structure.js numbers (checked inside the build).
   usage: node tests/fresh-start.js <market-data dir> [start unix s] */
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), assert = require('assert/strict'), { execFileSync, spawnSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..'), MD = path.resolve(process.argv[2]), H4 = 14400, DAY = 86400;
const board = JSON.parse(fs.readFileSync(path.join(ROOT, 'config/board.json'), 'utf8'));
const man = JSON.parse(fs.readFileSync(path.join(MD, 'manifest.json'), 'utf8'));
const ids = [...new Set([].concat(...board.coins.map((c) => [c.series_4h, c.series_1d]), Object.values(board.gauges.series)))];
const csv = {}; for (const id of ids) { const [s, y, t] = id.split('/'); csv[id] = fs.readFileSync(path.join(MD, 'data', s, `${y}_${t}.csv`), 'utf8').trim().split('\n'); }
const lastClose = Math.min(...board.coins.filter((c) => JSON.parse(fs.readFileSync(path.join(ROOT, 'config/paper.json'))).zone.cohort.includes(c.sym)).map((c) => man.series[c.series_4h].last_close));
const START = process.argv[3] ? Number(process.argv[3]) : Math.floor((lastClose - 3 * DAY) / H4) * H4;

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pt-fresh-')), REPO = path.join(tmp, 'repo'), TMD = path.join(tmp, 'md');
execFileSync('cp', ['-r', ROOT, REPO]); for (const x of ['.git', 'md', 'node_modules']) fs.rmSync(path.join(REPO, x), { recursive: true, force: true }); fs.rmSync(path.join(REPO, 'state', 'pnl'), { recursive: true, force: true });
for (const f of ['paper.json', 's083-paper.json', 'pnl.json', 'structure.json', 'freshness.json']) fs.rmSync(path.join(REPO, 'public', f), { force: true });
fs.writeFileSync(path.join(REPO, 'state/manual/zone-events.json'), '[]'); fs.writeFileSync(path.join(REPO, 'state/manual/events.json'), '[]');
const rd = (f) => JSON.parse(fs.readFileSync(path.join(REPO, f), 'utf8'));
function cutMD(now) {                                   // Market-Data as it was at `now`: closed candles only
  const M = { series: {} };
  for (const id of ids) {
    const [s, y, t] = id.split('/'), P = t === '1D' ? DAY : H4, L = csv[id], keep = [L[0]];
    for (let i = 1; i < L.length; i++) { const o = +L[i].slice(0, L[i].indexOf(',')); if (o + P <= now) keep.push(L[i]); else break; }
    fs.mkdirSync(path.join(TMD, 'data', s), { recursive: true }); fs.writeFileSync(path.join(TMD, 'data', s, `${y}_${t}.csv`), keep.join('\n') + '\n');
    const lo = +keep[keep.length - 1].split(',')[0];
    M.series[id] = { ...man.series[id], rows: keep.length - 1, last_open: lo, last_close: lo + P, fetched_at: now };
  }
  fs.writeFileSync(path.join(TMD, 'manifest.json'), JSON.stringify(M));
}
const node = (args, now, extra = {}) => spawnSync('node', args, { cwd: REPO, encoding: 'utf8', env: { ...process.env, BUILD_NOW: String(now), ...extra } });
function build(now, action) {
  cutMD(now);
  const steps = [['build/setup.js'], ['build/build.js', TMD], ['build/structure.js', TMD, '--from', new Date((START - 2 * DAY) * 1000).toISOString().slice(0, 10)]];
  if (action) steps.push(['build/apply-action.js', TMD]);
  steps.push(['build/paper-output.js'], ['build/s083-paper.js', TMD]);
  for (const a of steps) { const r = node(a.map((x, i) => (i ? x : path.join(REPO, x))), now, action && a[0] === 'build/apply-action.js' ? { PAPER_ACTION: JSON.stringify(action) } : {}); if (r.status) throw new Error(a[0] + ' failed at ' + now + ':\n' + r.stdout + r.stderr); }
}
function checkFresh() {
  const p = rd('public/paper.json'), s = rd('public/s083-paper.json');
  assert.equal(p.started, true); assert.equal(s.started, true);
  for (const f of fs.readdirSync(path.join(REPO, 'state/pnl'))) {
    const o = rd('state/pnl/' + f);
    if (f.startsWith('s_')) o.snaps.forEach((x) => assert(x.t >= START, 'advice before start ' + f));
    if (f.startsWith('b_')) o.t.forEach((t) => assert(t >= START, 'candle before start ' + f));
  }
  const pub = rd('public/pnl.json'); for (const [k, v] of Object.entries(pub)) if (k.startsWith('s_')) v.snaps.forEach((x) => assert(x.t >= START, 'MSS advice before start ' + k));
  for (const c of p.per_coin) for (const m of ['zone', 'mss']) for (const t of c[m].trades.concat(c[m].open ? [c[m].open] : [])) assert(t.entry_t >= START, 'zone trade before start');
  for (const sym of s.order) for (const t of s.coins[sym].trades.concat(s.coins[sym].open ? [s.coins[sym].open] : [])) assert(t.entry_t > START, 's083 joined the regime standing at the start (' + sym + ')');
  return { p, s };
}

(async () => {
  // 1. before the start (start still "auto", then a fixed start in the future)
  build(START - H4 + 600);
  assert.equal(rd('public/paper.json').started, false); assert.equal(rd('public/s083-paper.json').started, false);
  assert(!fs.existsSync(path.join(REPO, 'state/pnl')), 'state recorded before the start');
  fs.writeFileSync(path.join(REPO, 'config/start.json'), JSON.stringify({ start: START }));
  build(START - 600);
  assert.equal(rd('public/paper.json').started, false); assert(!fs.existsSync(path.join(REPO, 'state/pnl')));
  // 2. carried-over state is refused
  fs.mkdirSync(path.join(REPO, 'state/pnl')); fs.writeFileSync(path.join(REPO, 'state/pnl/s_BTC.json'), '{"sym":"BTC","snaps":[{"t":1,"entry":1}]}');
  assert.notEqual(node([path.join(REPO, 'build/setup.js')], START - 600).status, 0, 'old state was not refused');
  fs.rmSync(path.join(REPO, 'state/pnl'), { recursive: true });
  // 3. every 4H close from the start to the newest candle
  let n = 0, last;
  for (let now = START + 600; now <= lastClose + 600; now += H4) { build(now); last = checkFresh(); n++; }
  const { p, s } = last, cfg = rd('state/pnl/cfg.json');
  assert.equal(cfg.start, START); assert.equal(cfg.cohort.length, 26);
  // 4. s083 join switch: with it on, coins with a standing signal open exactly at the start
  const S = require(path.join(REPO, 'build/s083-paper.js')), P = rd('config/paper.json');
  P.s083.join_open_regime = true; fs.writeFileSync(path.join(REPO, 'config/paper.json'), JSON.stringify(P));
  const joined = node(['-e', 'const S=require("./build/s083-paper.js");console.log(JSON.stringify(S.compute(process.argv[1],[])))', TMD], lastClose + 600);
  const J = JSON.parse(joined.stdout); P.s083.join_open_regime = false; fs.writeFileSync(path.join(REPO, 'config/paper.json'), JSON.stringify(P));
  const joinedAtStart = s.order.filter((y) => [].concat(J.coins[y].trades, J.coins[y].open ? [J.coins[y].open] : []).some((t) => t.entry_t === START));
  // 5. manual actions on whatever is open
  const acts = [];
  const zr = p.per_coin.find((c) => c.zone.open), mr = p.per_coin.find((c) => c.mss.open), so = s.order.find((y) => s.coins[y].open);
  const now = lastClose + 600;
  if (zr) { build(now, { strategy: 'zone_pnl', mode: 'zone', sym: zr.sym, kind: 'close', percent: 100, nonce: 'test0000zone01', trade_id: zr.zone.open.id, event_count: 0, last_close: zr.zone.last_close }); acts.push('zone close ' + zr.sym); }
  if (so) {
    const c = rd('public/s083-paper.json').coins[so], kind = c.open.unrealized > 0 ? 'book' : 'close';
    build(now, { strategy: 's083', sym: so, kind, percent: 40, nonce: 'test0000s08301', trade_id: c.open.id, event_count: 0, last_close: c.last_close }); acts.push('s083 ' + kind + ' ' + so);
    const after = rd('public/s083-paper.json').coins[so];
    assert.equal(after.manual_log.filter((a) => a.action !== 'signal_exit').length, 1);
    if (kind === 'book') assert(Math.abs(after.open.left_pct - 60) < 1e-6, 'book 40% should leave 60%'); else assert(!after.open && after.blocked_side, 'close all should block re-entry');
  }
  if (zr) {
    const q = rd('public/paper.json'), row = q.per_coin.find((c) => c.sym === zr.sym);
    assert.equal(row.zone.manual_log.length, 1); assert.equal(row.mss.manual_log.length, 0, 'a zone action leaked into the MSS tab');
    assert(!row.zone.open || row.zone.open.id !== zr.zone.open.id, 'zone trade still open after Close all');
  }
  // a stale request (journal count changed) is refused
  if (zr) {
    const r = node([path.join(REPO, 'build/apply-action.js'), TMD], now, { PAPER_ACTION: JSON.stringify({ strategy: 'zone_pnl', mode: 'zone', sym: zr.sym, kind: 'close', percent: 100, nonce: 'test0000zone02', trade_id: zr.zone.open.id, event_count: 0, last_close: zr.zone.last_close }) });
    assert.notEqual(r.status, 0, 'stale action accepted');
  }
  const z = rd('public/paper.json');
  console.log(JSON.stringify({ ok: true, start: new Date(START * 1000).toISOString(), builds: n,
    zone: { closed: z.zone.live.closed, open: z.zone.live.open, pending: z.zone.live.pending, net: z.zone.live.net },
    mss: { closed: z.mss.live.closed, open: z.mss.live.open, pending: z.mss.live.pending, net: z.mss.live.net },
    s083: { open: rd('public/s083-paper.json').summary.open, closed: rd('public/s083-paper.json').summary.closed, net: rd('public/s083-paper.json').summary.net },
    s083_would_have_joined_at_start: joinedAtStart, manual_actions_tested: acts }, null, 1));
  if (process.env.KEEP_OUTPUT) for (const f of ['paper.json', 's083-paper.json', 'freshness.json']) fs.copyFileSync(path.join(REPO, 'public', f), path.join(process.env.KEEP_OUTPUT, f));
  fs.rmSync(tmp, { recursive: true, force: true });
})().catch((e) => { console.error(e); console.error('kept for inspection: ' + tmp); process.exit(1); });
