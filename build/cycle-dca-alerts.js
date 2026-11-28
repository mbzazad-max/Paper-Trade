/* 05 · Cycle DCA buy emails (owner, 28 Nov 2026: "i need email from 05 Cycle DCA every time it buys").
   One email per new buy in state/cycle-dca.json (buy 1 or buy 2, and a skipped buy too, marked SKIPPED), sent as a GitHub issue
   in this repo that mentions @mbzazad-max (GitHub emails the mention), by the workflow step "Cycle DCA buy emails".
   State state/cycle-dca-alerts.json: ids already emailed + a log. An id is marked only after its issue was created, so a failed send
   is tried again on the next build; a buy is never emailed twice. The first run (no state file) marks the buys already there as sent.
   usage: node build/cycle-dca-alerts.js prepare <out dir>   -> <out>/<k>.id, <k>.title, <k>.md for each buy still to email
          node build/cycle-dca-alerts.js mark <buy id> [issue url] */
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..');
const BUYS = path.join(ROOT, 'state', 'cycle-dca.json'), ALERTS = path.join(ROOT, 'state', 'cycle-dca-alerts.json');
const PUB = path.join(ROOT, 'public', 'cycle-dca.json');
const LINK = 'https://dashboards.mbzazad.workers.dev/paper-trade/#cycle-dca';
const OWNER = '@mbzazad-max';
const LABEL = { div: 'RSI bullish divergence', div10: 'RSI divergence (10D)', rev: 'Key reversal', d10: 'Close above the 10D', d20: 'Close above the 20D', swing: '★ Swing break' };
const rd = (f, d) => (fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : d);
const save = (f, v) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f + '.tmp', JSON.stringify(v, null, 1) + '\n'); fs.renameSync(f + '.tmp', f); };
const usd = (v) => '$' + (+v).toLocaleString('en-US', { maximumFractionDigits: Math.abs(v) >= 100 ? 2 : 6 });
const fresh = () => ({ about: 'Cycle DCA buy emails (build/cycle-dca-alerts.js): buy ids already emailed.', sent: [], log: [] });

function load(buys) {
  let A = rd(ALERTS, null);
  if (!A) { A = fresh(); A.sent = buys.map((b) => b.id); A.seeded = new Date().toISOString().slice(0, 16); save(ALERTS, A); }
  return A;
}

/* the email for one buy (pure; tested in tests/cycle-dca.js) */
function email(b, pub, cfg) {
  const coin = pub && pub.coins ? pub.coins.find((c) => c.sym === b.sym) : null;
  const fee = (cfg && cfg.fee_pct != null ? cfg.fee_pct : 0.1) / 100, qty = (b.size - b.size * fee) / b.px;
  const signLabel = (id) => (coin && coin.signs && (coin.signs.find((s) => s.id === id) || {}).label) || LABEL[id] || id;
  const signDay = (id) => (coin && coin.low && coin.low.day === b.low && (coin.signs.find((s) => s.id === id) || {}).fired) || '';
  const what = b.n === 1 ? 'Buy 1 (2 early bottom signs after a 30-day low)' : 'Buy 2 / DCA (all 4 price-action signs in the same low)';
  const title = (b.skipped ? 'Cycle DCA: SKIPPED buy ' : 'Cycle DCA: bought ') + b.sym + ' (buy ' + b.n + ') at ' + usd(b.px) + ' · ' + b.day + ' close';
  const L = [];
  L.push(OWNER + ' 05 · Cycle DCA ' + (b.skipped ? '**did not buy** ' + b.sym + ': ' + b.skipped + '.' : '**bought ' + b.sym + '** on the paper account.'), '');
  L.push('| | |', '|---|---|');
  L.push('| Coin | ' + b.sym + 'USDT (spot, paper) |');
  L.push('| Buy | ' + what + ' |');
  L.push('| Fill | ' + usd(b.px) + ' = the ' + b.day + ' daily close |');
  if (!b.skipped) { L.push('| Size | ' + usd(b.size) + ' (fee ' + usd(b.size * fee) + ') |'); L.push('| Coins bought | ' + (+qty.toPrecision(8)) + ' ' + b.sym + ' |'); }
  L.push('| 30-day low | ' + b.low + (coin && coin.low && coin.low.day === b.low ? ' at ' + usd(coin.low.v) + ' (' + ((b.px / coin.low.v - 1) * 100).toFixed(1) + '% above)' : '') + ' |');
  L.push('| Signs | ' + (b.signs || []).map((id) => signLabel(id) + (signDay(id) ? ' (' + signDay(id) + ')' : '')).join(', ') + ' |');
  if (coin && !b.skipped) L.push('| ' + b.sym + ' held now | ' + coin.qty + ' ' + b.sym + ', avg cost ' + (coin.avg == null ? '-' : usd(coin.avg)) + ', ' + coin.buys + ' buy(s) |');
  if (pub && pub.equity != null) L.push('| Account | cash ' + usd(pub.cash) + ', equity ' + usd(pub.equity) + ' (' + (pub.return_pct >= 0 ? '+' : '') + pub.return_pct + '%) |');
  L.push('', b.n === 1 && !b.skipped ? 'Next: buy 2 comes when all 4 price-action signs (key reversal, 10D, 20D, ★ swing break) have fired in this low. Selling is yours (Book % / Close all).' : 'Selling is yours (Book % / Close all on the tab).');
  L.push('', 'Open the tab: ' + LINK, '', '_Paper trade, not advice. Sent by the Paper-Trade build after the daily candle._');
  return { title, body: L.join('\n') };
}

function prepare(out) {
  const st = rd(BUYS, { buys: [] }), A = load(st.buys), sent = new Set(A.sent);
  const pub = rd(PUB, null), cfg = rd(path.join(ROOT, 'config', 'cycle-dca.json'), {});
  fs.mkdirSync(out, { recursive: true });
  let k = 0;
  for (const b of st.buys) {
    if (sent.has(b.id)) continue;
    const e = email(b, pub, cfg); k++;
    fs.writeFileSync(path.join(out, k + '.id'), b.id); fs.writeFileSync(path.join(out, k + '.title'), e.title); fs.writeFileSync(path.join(out, k + '.md'), e.body);
  }
  console.log('Cycle DCA emails to send: ' + k);
}

function mark(id, url) {
  const st = rd(BUYS, { buys: [] }), A = load(st.buys);
  if (A.sent.includes(id)) return;
  A.sent.push(id); A.log.push({ id, at: new Date().toISOString().slice(0, 16), issue: url || null }); A.log = A.log.slice(-500);
  save(ALERTS, A); console.log('Emailed: ' + id + (url ? ' ' + url : ''));
}

module.exports = { email };
if (require.main === module) {
  const [cmd, a, b] = process.argv.slice(2);
  if (cmd === 'prepare') prepare(a || 'cycle-dca-mail');
  else if (cmd === 'mark' && a) mark(a, b);
  else { console.error('usage: prepare <dir> | mark <id> [url]'); process.exit(2); }
}
