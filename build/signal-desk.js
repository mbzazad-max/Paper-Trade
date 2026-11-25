/* RSI Signal Desk tab (04, BTC only): loads closed Binance candles from Market-Data for BTC (the signals) and ETH (only for
   BTC's ETH <-> BTC link section and ETH check line, as on the original page) and writes
   public/signal-desk.json. All signal logic stays in the original engine (public/signal-desk-engine.js, byte-identical
   to the claude.ai Signal Desk page, checked by reference/SOURCE_SHA256SUMS) and runs in the page, as it did before.
   Windows are the original page's TradingView pulls: 4H = the last 5,000 candles, 1D = from 1 Oct 2020.
   This step only converts data. On any problem it writes nothing, so the last good file stays.
   usage: node build/signal-desk.js <market-data checkout>   (BUILD_NOW=<unix s> to replay a past moment) */
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..');
const MD = path.resolve(process.argv[2] || 'md');
const OUT = path.join(ROOT, 'public/signal-desk.json');
const ASSETS = ['BTC', 'ETH'];   // owner, 25 Nov 2026: live for BTC only; ETH is loaded as BTC's comparison coin
const TF = { '4H': { sec: 14400, keep: 5000 }, '1D': { sec: 86400, from: Date.UTC(2020, 9, 1) / 1000 } };
const now = process.env.BUILD_NOW ? +process.env.BUILD_NOW : Math.floor(Date.now() / 1000);

function load(sym, tf) {
  const file = path.join(MD, 'data', 'binance', sym + 'USDT_' + tf + '.csv');
  const lines = fs.readFileSync(file, 'utf8').trim().split(/\r?\n/);
  if (lines[0].trim() !== 'time,open,high,low,close,volume') throw Error('Unexpected columns in ' + file);
  const b = { t: [], h: [], l: [], c: [] }, sec = TF[tf].sec;
  let prev = -1;
  for (let i = 1; i < lines.length; i++) {
    const v = lines[i].split(',').map(Number);
    if (v.length < 5 || v.slice(0, 5).some((x) => !Number.isFinite(x))) throw Error('Bad candle in ' + file + ' row ' + i);
    if (v[0] <= prev) throw Error('Candles out of order in ' + file + ' row ' + i);
    prev = v[0];
    if (v[0] + sec > now) continue;                      // closed candles only
    if (TF[tf].from && v[0] < TF[tf].from) continue;
    b.t.push(v[0]); b.h.push(v[2]); b.l.push(v[3]); b.c.push(v[4]);
  }
  if (TF[tf].keep && b.t.length > TF[tf].keep) for (const k of ['t', 'h', 'l', 'c']) b[k] = b[k].slice(-TF[tf].keep);
  if (b.t.length < 300) throw Error(sym + ' ' + tf + ': only ' + b.t.length + ' closed candles');
  let gaps = 0; for (let i = 1; i < b.t.length; i++) if (b.t[i] - b.t[i - 1] !== sec) gaps++;   // the original page took the bars as they came; only report
  if (gaps) console.log('::warning::signal-desk ' + sym + ' ' + tf + ': ' + gaps + ' gap(s) in the candles (exchange downtime); used as is, like the original page');
  return b;
}

function main() {
  global.window = undefined;
  require(path.join(ROOT, 'public/signal-desk-engine.js'));     // defines globalThis.SIG (unchanged original engine)
  const SIG = globalThis.SIG;
  const out = { source: 'Market-Data binance/<COIN>USDT 4H and 1D (Binance spot, closed candles)', assets: {}, summary: {} };
  let last = 0;
  for (const a of ASSETS) {
    out.assets[a] = { sym: 'BINANCE:' + a + 'USDT' };
    out.summary[a] = {};
    for (const tf of ['4H', '1D']) {
      const b = load(a, tf);
      out.assets[a][tf] = b;
      last = Math.max(last, b.t[b.t.length - 1] + TF[tf].sec);
      const R = SIG.run(b, tf, now), s = R.state;
      out.summary[a][tf] = { last_closed: s.lastClosedT, close: s.lastClose, rsi: +s.rsi.toFixed(2), signal: s.signalNow, why: s.signalWhy,
        open: s.open ? { since: s.open.et, entry: s.open.e, pnl_pct: +(s.open.pnl * 100).toFixed(2), target: s.open.target, stop: s.open.stop } : null,
        trades: R.trades.length };
    }
  }
  out.generated = new Date(last * 1000).toISOString().replace('.000Z', 'Z');   // = the newest candle close, so an unchanged input writes an unchanged file
  const txt = JSON.stringify(out);
  if (fs.existsSync(OUT) && fs.readFileSync(OUT, 'utf8') === txt) { console.log('signal-desk: no new candles'); return; }
  const tmp = OUT + '.tmp'; fs.writeFileSync(tmp, txt); fs.renameSync(tmp, OUT);
  console.log('signal-desk: wrote ' + (txt.length / 1024).toFixed(0) + ' KB, candles up to ' + out.generated);
  for (const a of ASSETS) console.log('  ' + a + ' ' + ['4H', '1D'].map((tf) => { const s = out.summary[a][tf]; return tf + ' RSI ' + s.rsi + (s.signal ? ' ' + s.signal : '') + (s.open ? ' open @' + s.open.entry : ''); }).join(' | '));
}
try { main(); } catch (e) { console.error('signal-desk: ' + (e.message || e) + ' (nothing written; the last good file stays)'); process.exit(1); }
