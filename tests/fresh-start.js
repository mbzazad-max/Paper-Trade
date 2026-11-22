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
fs.writeFileSync(path.join(REPO, 'state/manual/top20.json'), '[]'); fs.writeFileSync(path.join(REPO, 'state/manual/s083.json'), '[]');
// the copy starts from "auto" (as before go-live): the live repo's fixed start must not decide what this replay calls "before the start"
fs.writeFileSync(path.join(REPO, 'config/start.json'), JSON.stringify({ start: 'auto' }));
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
  steps.push(['build/paper.js', TMD]);
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
  for (const m of ['mss']) { assert.match(p[m].sum.same_as_pnl_js, /coin/); for (const c of p[m].coins) for (const t of c.trades.concat(c.open ? [c.open] : [])) assert(t.entry_t >= START, 'trade before start'); }
  for (const sym of s.coins) for (const t of s.per[sym].trades.concat(s.per[sym].open ? [s.per[sym].open] : [])) assert(t.entry_t > START, 's083 took the regime standing at the start (' + sym + ')');
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
  const P = rd('config/paper.json'); P.s083.join_open_regime = true; fs.writeFileSync(path.join(REPO, 'config/paper.json'), JSON.stringify(P));
  build(lastClose + 600); const J = rd('public/s083-paper.json');
  P.s083.join_open_regime = false; fs.writeFileSync(path.join(REPO, 'config/paper.json'), JSON.stringify(P)); build(lastClose + 600);
  const joinedAtStart = J.coins.filter((y) => [].concat(J.per[y].trades, J.per[y].open ? [J.per[y].open] : []).some((t) => t.entry_t === START));
  // 5. manual actions on whatever is open, through apply-action.js like the workflow does
  const acts = [], now = lastClose + 600, nonce = (k) => 'test' + k + '0000000000000000';
  const zr = p.mss.coins.find((c) => c.open), so = s.coins.find((y) => s.per[y].open);
  let n083 = 0, nTop = 0;
  // the without-MSS tab was removed (22 Nov 2026): a request for it must be refused
  assert.notEqual(node([path.join(REPO, 'build/apply-action.js'), TMD], now, { PAPER_ACTION: JSON.stringify({ tab: 'zone', sym: 'BTC', kind: 'close', percent: 100, nonce: nonce(9), trade_id: 'zone:BTC:1', journal_count: 0, last_close: lastClose }) }).status, 0, 'removed tab accepted');
  if (zr) {
    build(now, { tab: 'mss', sym: zr.sym, kind: 'close', percent: 100, nonce: nonce(1), trade_id: zr.open.id, journal_count: nTop++, last_close: zr.last_close }); acts.push('with MSS: Close all ' + zr.sym);
    const q = rd('public/paper.json'); assert.equal(q.mss.coins.find((c) => c.sym === zr.sym).log.length, 1); assert(!q.mss.coins.find((c) => c.sym === zr.sym).open || q.mss.coins.find((c) => c.sym === zr.sym).open.id !== zr.open.id);
    assert.equal(q.zone, undefined, 'the without-MSS tab is back in paper.json');
    assert.match(q.mss.sum.same_as_pnl_js, /without a manual action/);
    // the same request again is ignored; a stale one (old journal count) is refused
    assert.equal(node([path.join(REPO, 'build/apply-action.js'), TMD], now, { PAPER_ACTION: JSON.stringify({ tab: 'mss', sym: zr.sym, kind: 'close', percent: 100, nonce: nonce(1), trade_id: zr.open.id, journal_count: 0, last_close: zr.last_close }) }).status, 0);
    assert.notEqual(node([path.join(REPO, 'build/apply-action.js'), TMD], now, { PAPER_ACTION: JSON.stringify({ tab: 'mss', sym: zr.sym, kind: 'close', percent: 100, nonce: nonce(2), trade_id: zr.open.id, journal_count: 0, last_close: zr.last_close }) }).status, 0, 'stale action accepted');
  }
  const zb = rd('public/paper.json').mss.coins.find((c) => c.open && (c.price - c.open.entry) - (c.price + c.open.entry) * 0.001 > 0);
  if (zb) { build(now, { tab: 'mss', sym: zb.sym, kind: 'book', percent: 25, nonce: nonce(3), trade_id: zb.open.id, journal_count: nTop++, last_close: zb.last_close }); acts.push('with MSS: Book 25% ' + zb.sym);
    assert(Math.abs(rd('public/paper.json').mss.coins.find((c) => c.sym === zb.sym).open.left_pct - 75) < 1e-6); }
  if (so) {
    const c = rd('public/s083-paper.json').per[so], kind = c.open.side * (c.price / c.open.entry - 1) > 0 ? 'book' : 'close';
    build(now, { tab: 's083', sym: so, kind, percent: 40, nonce: nonce(5), trade_id: c.open.id, journal_count: n083++, last_close: c.last_close }); acts.push('s083: ' + kind + ' ' + so);
    const after = rd('public/s083-paper.json').per[so]; assert.equal(after.log.length, 1);
    if (kind === 'book') assert(Math.abs(after.open.left_pct - 60) < 1e-6); else assert(!after.open && after.waiting);
  }
  const z = rd('public/paper.json');
  console.log(JSON.stringify({ ok: true, start: new Date(START * 1000).toISOString(), builds: n,
    with_mss: (({ closed, open, pending, net }) => ({ closed, open, pending, net }))(z.mss.sum),
    s083: rd('public/s083-paper.json').sum,
    s083_would_have_joined_at_start: joinedAtStart, manual_actions_tested: acts }, null, 1));
  if (process.env.KEEP_OUTPUT) for (const f of ['paper.json', 's083-paper.json', 'freshness.json']) fs.copyFileSync(path.join(REPO, 'public', f), path.join(process.env.KEEP_OUTPUT, f));
  fs.rmSync(tmp, { recursive: true, force: true });
})().catch((e) => { console.error(e); console.error('kept for inspection: ' + tmp); process.exit(1); });
