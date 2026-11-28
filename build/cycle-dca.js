/* 05 · Cycle DCA (owner, 28 Nov 2026). Spot paper account: the build BUYS from the cycle-tab early bottom signs, the owner SELLS.
   Signs: the BTC & ETH dashboard's own cycle engine (cycle/build/usdtd.js, byte-identical, reference/SOURCE_SHA256SUMS) run on
   Market-Data for each coin; this file only reads its "⚡ Early warning (daily)" bottom block (bottom_watch.fast).
   Rules (config/cycle-dca.json):
     - Buy 1 ($size) at the close of the day the 2nd of the 6 early bottom signs fired after a 30-day closing low.
     - Buy 2 ($size, DCA) at the close of the day the last of the 4 price-action signs (key reversal, close above the 10D,
       close above the 20D, ★ swing break) fired in that same low. Only after buy 1 of that low.
     - At most these 2 buys per low; a new lower 30-day low is a new low (can buy again). Skipped if cash is short, or (buy 2) if the
       owner did Close all on that coin after buy 1 of the same low (both logged).
     - Fresh start: the first build sets the start to the next 00:00 UTC; a low whose 2nd sign fired on a day before the start is
       never bought (no old trades imported).
   Sells: owner only, through /api/paper-trade/action (tab "cycle-dca"): Close all, or Book N% (1-99) of what is held. Filled at the
   close of the coin's last closed Binance 4H candle in Market-Data, never a browser price; refused if that candle or the journal
   changed since the page loaded. No profit rule: in spot the owner decides.
   Ledger: average cost; fee on every buy and sell. Buys are appended to state/cycle-dca.json once (never rewritten); sells are the
   journal state/manual/cycle-dca.json. Everything else is recomputed from those two each build.
   Writes public/cycle-dca.json. On any failure nothing is written (the last good files stay).
   usage: node build/cycle-dca.js <market-data dir> */
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), { execFileSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..');
const CFG = path.join(ROOT, 'config', 'cycle-dca.json'), STATE = path.join(ROOT, 'state', 'cycle-dca.json');
const JOURNAL = path.join(ROOT, 'state', 'manual', 'cycle-dca.json'), PUB = path.join(ROOT, 'public', 'cycle-dca.json');
const ENGINE = path.join(ROOT, 'cycle', 'build', 'usdtd.js');
const DAY = 86400;
const rd = (f, d) => (fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : d);
const save = (f, v) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f + '.tmp', JSON.stringify(v, null, 1) + '\n'); fs.renameSync(f + '.tmp', f); };
const clock = () => (process.env.BUILD_NOW ? Number(process.env.BUILD_NOW) : Math.floor(Date.now() / 1000));
const r6 = (v) => +(+v).toPrecision(8), r2 = (v) => Math.round(v * 100) / 100;
const T = (d) => Date.parse(d + 'T00:00:00Z') / 1000;
const day = (t) => new Date(t * 1000).toISOString().slice(0, 10);

/* the cycle engine's output for one coin (its own JSON), in a temp folder so nothing of the dashboard's files is touched */
function cycleJson(md, sym) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cyc-')), out = path.join(dir, 'c.json');
  execFileSync(process.execPath, [ENGINE, md, '--asset=' + sym.toLowerCase()], { env: { ...process.env, USDTD_OUT: out, USDTD_LOG: path.join(dir, 'log.json') }, stdio: ['ignore', 'pipe', 'inherit'] });
  if (!fs.existsSync(out)) throw new Error(sym + ': the cycle engine wrote nothing');
  const J = JSON.parse(fs.readFileSync(out, 'utf8')); fs.rmSync(dir, { recursive: true, force: true }); return J;
}
/* last closed Binance 4H candle (Market-Data keeps closed candles only): {t: open time, c: close} */
function last4h(md, sym) {
  const f = path.join(md, 'data', 'binance', sym + 'USDT_4H.csv');
  const L = fs.readFileSync(f, 'utf8').trim().split('\n'), p = L[L.length - 1].split(',');
  return { t: +p[0], c: +p[4] };
}

/* what the early-warning block says, reduced to what the ledger needs */
function signals(J) {
  const F = J.bottom_watch && J.bottom_watch.fast;
  if (!F || !F.extreme || !Array.isArray(F.signs)) throw new Error('no early-warning bottom block');
  const close = new Map(((J.series && J.series.daily) || []).map((r) => [r[0], r[1]]));
  return {
    low: { day: F.extreme.day, v: F.extreme.v }, expired: !!F.expired, status: F.status || '',
    signs: F.signs.map((s) => ({ id: s.id, label: s.label, fired: s.fired || null, level: s.level == null ? null : r6(s.level), moved: s.moved, n: s.n })),
    close: (d) => (close.has(d) ? close.get(d) : null), last_day: J.now && J.now.day, last_close: J.now && J.now.usdtd,
  };
}

/* buys due for one coin from its current low (pure; tested in tests/cycle-dca.js) */
function due(cfg, startDay, sym, S, bought) {
  const out = [], key = sym + '|' + S.low.day;
  const fired = S.signs.filter((s) => s.fired).sort((a, b) => (a.fired < b.fired ? -1 : a.fired > b.fired ? 1 : 0));
  if (fired.length < cfg.entry1_signs) return out;
  const d1 = fired[cfg.entry1_signs - 1].fired;
  if (d1 < startDay) return out;                      // the 2nd sign came before the start: never bought
  if (!bought.has(key + '|1')) out.push({ id: key + '|1', sym, low: S.low.day, n: 1, day: d1, signs: fired.filter((s) => s.fired <= d1).map((s) => s.id) });
  const pa = cfg.entry2_ids.map((id) => S.signs.find((s) => s.id === id));
  if (pa.every((s) => s && s.fired)) {
    const d2 = pa.map((s) => s.fired).sort().pop();
    if (!bought.has(key + '|2')) out.push({ id: key + '|2', sym, low: S.low.day, n: 2, day: d2 < d1 ? d1 : d2, signs: cfg.entry2_ids.slice() });   // never before buy 1
  }
  return out;
}

/* the account from the stored buys and the owner's sells (pure) */
function account(cfg, buys, journal, prices) {
  const fee = cfg.fee_pct / 100, coins = {};
  for (const s of cfg.coins) coins[s] = { sym: s, qty: 0, cost: 0, realized: 0, fees: 0, buys: 0, sells: 0 };
  let cash = cfg.capital;
  const ev = buys.filter((b) => !b.skipped).map((b) => ({ k: 'buy', t: T(b.day) + DAY, b }))
    .concat(journal.map((a) => ({ k: 'sell', t: a.t + 4 * 3600, a })))
    .sort((x, y) => x.t - y.t || (x.k === 'buy' ? -1 : 1));
  const trades = [];
  for (const e of ev) {
    if (e.k === 'buy') {
      const c = coins[e.b.sym]; if (!c) continue;
      const f = e.b.size * fee, qty = (e.b.size - f) / e.b.px;
      c.qty += qty; c.cost += e.b.size; c.fees += f; c.buys++; cash -= e.b.size;
      trades.push({ kind: 'buy', sym: c.sym, n: e.b.n, day: e.b.day, px: e.b.px, qty: r6(qty), usd: e.b.size, low: e.b.low, signs: e.b.signs });
    } else {
      const c = coins[e.a.sym]; if (!c || c.qty <= 0) continue;
      const share = e.a.kind === 'close' ? 1 : e.a.percent / 100, qty = c.qty * share, gross = qty * e.a.px, f = gross * fee, basis = c.cost * share;
      c.realized += gross - f - basis; c.fees += f; c.qty -= qty; c.cost -= basis; c.sells++; cash += gross - f;
      if (e.a.kind === 'close') { c.qty = 0; c.cost = 0; }
      trades.push({ kind: 'sell', sym: c.sym, what: e.a.kind === 'close' ? 'Close all' : 'Book ' + e.a.percent + '%', t: e.a.t, px: e.a.px, qty: r6(qty), usd: r2(gross - f), pnl: r2(gross - f - basis) });
    }
  }
  let value = 0;
  for (const c of Object.values(coins)) {
    const p = prices[c.sym]; c.price = p ? p.c : null; c.price_t = p ? p.t : null;
    c.value = c.qty > 0 && p ? c.qty * p.c : 0; c.avg = c.qty > 0 ? c.cost / c.qty : null;   // cost per coin, buy fees included
    c.unrealized = c.qty > 0 ? c.value - c.cost : 0; value += c.value;
  }
  return { cash, value, equity: cash + value, coins, trades: trades.reverse() };
}

function build(md, now) {
  const cfg = rd(CFG);
  let st = rd(STATE, null);
  if (!st) { const s = (Math.floor(now / DAY) + 1) * DAY; st = { version: 1, about: 'Cycle DCA buys (build/cycle-dca.js), append-only. start = first day whose signs count.', start: s, buys: [] }; }
  const startDay = day(st.start), started = now >= st.start, journal = rd(JOURNAL, []);
  const bought = new Set(st.buys.map((b) => b.id)), prices = {}, rows = {};
  for (const sym of cfg.coins) {
    const S = signals(cycleJson(md, sym)); prices[sym] = last4h(md, sym);
    rows[sym] = S;
    if (!started) continue;
    for (const b of due(cfg, startDay, sym, S, bought)) {
      const px = S.close(b.day); if (px == null) throw new Error(sym + ': no close for ' + b.day);
      const acc = account(cfg, st.buys, journal, prices);
      const rec = { ...b, px, size: cfg.size, at: now };
      // the owner closed this coin after this low's first buy: no DCA back into the same low
      const b1 = st.buys.find((x) => x.id === b.sym + '|' + b.low + '|1');
      if (b.n === 2 && b1 && journal.some((a) => a.sym === b.sym && a.kind === 'close' && a.t + 4 * 3600 > T(b1.day) + DAY)) rec.skipped = 'you closed ' + b.sym + ' after buy 1 of this low';
      else if (acc.cash < cfg.size) rec.skipped = 'cash $' + Math.round(acc.cash) + ' under $' + cfg.size;
      st.buys.push(rec); bought.add(b.id);
      console.log('Cycle DCA ' + (rec.skipped ? 'SKIPPED ' : '') + 'buy ' + b.n + ' ' + sym + ' at the ' + b.day + ' close ' + px + (rec.skipped ? ' (' + rec.skipped + ')' : ''));
    }
  }
  const A = account(cfg, st.buys, journal, prices);
  const pub = {
    generated: new Date(now * 1000).toISOString().slice(0, 16).replace('T', ' '), start: st.start, started, journal_count: journal.length,
    capital: cfg.capital, size: cfg.size, fee_pct: cfg.fee_pct, entry1_signs: cfg.entry1_signs, entry2_ids: cfg.entry2_ids,
    cash: r2(A.cash), value: r2(A.value), equity: r2(A.equity), pnl: r2(A.equity - cfg.capital), return_pct: r2((A.equity / cfg.capital - 1) * 100),
    coins: cfg.coins.map((s) => {
      const c = A.coins[s], S = rows[s], key = s + '|' + S.low.day, nb = st.buys.filter((b) => b.sym === s && b.low === S.low.day);
      return { sym: s, qty: r6(c.qty), avg: c.avg == null ? null : r6(c.avg), cost: r2(c.cost), price: c.price, last_close: c.price_t, value: r2(c.value),
        unrealized: r2(c.unrealized), realized: r2(c.realized), buys: c.buys, sells: c.sells,
        low: S.low, expired: S.expired, status: S.status, signs: S.signs, fired: S.signs.filter((x) => x.fired).length,
        low_buys: nb.map((b) => ({ n: b.n, day: b.day, px: b.px, skipped: b.skipped || null })), episode: key };
    }),
    trades: A.trades.slice(0, 100), skipped: st.buys.filter((b) => b.skipped).slice(-20),
    source: 'Signs: the BTC & ETH dashboard cycle engine (byte-identical copy) on Market-Data daily closes. Prices: Market-Data Binance <COIN>USDT 4H (last closed candle).',
  };
  return { st, pub, A, journal, cfg };
}

function main() {
  const md = path.resolve(process.argv[2] || '../market-data'), now = clock();
  const { st, pub } = build(md, now);
  save(STATE, st); if (!fs.existsSync(JOURNAL)) save(JOURNAL, []); save(PUB, pub);
  console.log('Cycle DCA: ' + (pub.started ? 'equity $' + pub.equity + ', cash $' + pub.cash + ', ' + st.buys.filter((b) => !b.skipped).length + ' buys' : 'starts ' + day(pub.start)));
}

/* one owner action (from build/apply-action.js): {tab:'cycle-dca', sym, kind:'close'|'book', percent, nonce, trade_id, journal_count, last_close} */
function recordManualAction(md, p) {
  const cfg = rd(CFG), st = rd(STATE, null), journal = rd(JOURNAL, []), now = clock();
  if (!st || now < st.start) throw new Error('Action refused: the Cycle DCA account has not started');
  if (!cfg.coins.includes(p.sym) || !['close', 'book'].includes(p.kind)) throw new Error('Action refused: malformed request');
  if (p.kind === 'book' && !(Number.isInteger(p.percent) && p.percent >= 1 && p.percent <= 99)) throw new Error('Action refused: Book % must be 1-99');
  if (journal.some((a) => a.nonce === p.nonce)) { console.log('Already done (same request id); nothing changed.'); return; }
  if (p.journal_count !== journal.length) throw new Error('Action refused: another action was saved since the page loaded; reload and try again');
  const prices = {}; for (const s of cfg.coins) prices[s] = last4h(md, s);
  const c = account(cfg, st.buys, journal, prices).coins[p.sym];
  if (!(c.qty > 0)) throw new Error('Action refused: nothing held in ' + p.sym);
  if (prices[p.sym].t !== p.last_close) throw new Error('Action refused: a new 4H candle has closed since the page loaded; reload and check again');
  const a = { nonce: p.nonce, sym: p.sym, kind: p.kind, percent: p.kind === 'close' ? 100 : p.percent, t: prices[p.sym].t, px: prices[p.sym].c, at: now };
  const after = account(cfg, st.buys, journal.concat(a), prices).coins[p.sym];
  if (!(after.qty < c.qty)) throw new Error('Action refused: the sale did not apply');
  save(JOURNAL, journal.concat(a));
  console.log('Saved: cycle-dca ' + (p.kind === 'close' ? 'Close all' : 'Book ' + p.percent + '%') + ' ' + p.sym + ' at the 4H close ' + a.px + ' (' + new Date(a.t * 1000).toISOString().slice(0, 16) + ' UTC)');
}

module.exports = { signals, due, account, build, recordManualAction };
if (require.main === module) { try { main(); } catch (e) { console.error('::error::Cycle DCA not updated, last good kept: ' + (e.message || e)); process.exit(1); } }
