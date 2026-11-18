/* Paper-Trade fresh start. Runs first in every build.
     config/start.json  start: "auto" | unix seconds (a 4H boundary)
   --resolve  (the workflow on main passes it): an "auto" start becomes the next 4H candle boundary, once, for good.
   Before the start: no paper state may exist (state/pnl holds nothing but nothing), and nothing is recorded.
   At or after the start: state/pnl/cfg.json is written once from config/paper.json (the 26 coins, $1,000, 0.1% fee)
   with that start, so the unchanged Coin Zones build.js begins recording advice from then on. It never changes later.
   usage: node build/setup.js [--resolve]      env BUILD_NOW (unix s) overrides the clock (tests) */
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..'), H4 = 14400, DAY = 86400;
const NOW = process.env.BUILD_NOW ? Number(process.env.BUILD_NOW) : Math.floor(Date.now() / 1000);
const rd = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const wr = (f, o) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f + '.tmp', JSON.stringify(o, null, 1) + '\n'); fs.renameSync(f + '.tmp', f); };
const iso = (t) => new Date(t * 1000).toISOString().slice(0, 16).replace('T', ' ') + ' UTC';

function state(root) {
  const ST = path.join(root, 'state', 'pnl');
  return fs.existsSync(ST) ? fs.readdirSync(ST).filter((f) => f.endsWith('.json')) : [];
}

function main() {
  const sf = path.join(ROOT, 'config', 'start.json'), sc = rd(sf), pc = rd(path.join(ROOT, 'config', 'paper.json'));
  if (sc.start === 'auto' && process.argv.includes('--resolve')) {
    sc.start = Math.ceil((NOW + 1) / H4) * H4;                       // next 4H boundary strictly after now
    sc.set_at = NOW; sc.set_note = 'Set by the first build on main: ' + iso(sc.start);
    wr(sf, sc);
    console.log('Fresh start fixed at ' + iso(sc.start));
  }
  const start = sc.start;
  if (start !== 'auto' && !(Number.isInteger(start) && start % H4 === 0)) throw new Error('config/start.json start must be "auto" or a 4H boundary (unix seconds)');
  const files = state(ROOT), cf = path.join(ROOT, 'state', 'pnl', 'cfg.json');
  if (start === 'auto' || NOW < start) {
    if (files.length) throw new Error('Paper state exists before the start (' + files.join(', ') + '): refusing to carry anything over.');
    console.log(start === 'auto' ? 'Not started: the start is set at go-live.' : 'Not started: begins ' + iso(start) + '.');
    return;
  }
  if (fs.existsSync(cf)) {
    const c = rd(cf);
    if (c.start !== start) throw new Error('state/pnl/cfg.json start ' + c.start + ' differs from config/start.json ' + start + ': the start never changes.');
    console.log('Running since ' + iso(start) + '.');
    return;
  }
  if (files.length) throw new Error('Paper state without cfg.json: ' + files.join(', '));
  const z = pc.zone;
  wr(cf, { advice_source: 'Paper-Trade fresh start ' + iso(start) + ': no trades, advice or P&L carried over', cohort: z.cohort,
    created: new Date(NOW * 1000).toISOString().slice(0, 16) + 'Z', days: z.days, end: start + z.days * DAY, fee: z.fee, size: z.size, start });
  // make the unchanged build.js rebuild now (it skips when its inputs look unchanged), so the first advice is recorded
  const ff = path.join(ROOT, 'public', 'freshness.json');
  if (fs.existsSync(ff)) { const f = rd(ff); delete f.inputs_hash; fs.writeFileSync(ff, JSON.stringify(f)); }
  console.log('Fresh paper test opened: ' + z.cohort.length + ' coins from ' + iso(start) + '.');
}
try { main(); } catch (e) { console.error('::error::' + (e.message || e)); process.exit(1); }
