/* USDT.D tab (added 21 Nov 2026 at the owner's request): how USDT dominance behaves around its 20/50/100/200 SMAs on the
   daily and weekly charts, in BTC bull and bear markets (2022 bear vs 2023-25 bull vs the bear since Oct 2025).

   Data (closed candles only, from market-data):
     USDT.D daily = tv/CRYPTOCAP_USDT.D/1D (stored history, frozen 13 Nov 2026) then days made from tv/CRYPTOCAP_USDT.D/4H
                    (a UTC day counts once its 20:00 candle has closed, the same rule as build.js)
     USDT.D weekly = Monday weeks of those days; the last week is "forming" until its Sunday has closed
     BTC daily     = tv/COINBASE_BTCUSD/1D then binance/BTCUSDT/1D (same chain as build.js), for context only
   Regimes are fixed BTC cycle dates (closing prices): 2017 bull from 1 Mar 2017, top 16 Dec 2017, 2019 rally to 26 Jun 2019, bottom 15 Dec 2018, top 8 Nov 2021, bottom 21 Nov 2022, top 6 Oct 2025.
   USDT.D history starts 8 Mar 2015; the 100W exists from Feb 2017 and the 200W from Jan 2019, so tests start in Jun 2017.
   The last regime runs to today until a new BTC cycle date is added to REGIMES.

   Measures (per regime, per timeframe, per SMA):
     above       share of closes above the SMA
     support     bars that came from above (previous close above) and reached the SMA (low within 1%): held = closed above
     resistance  bars that came from below and reached it (high within 1%): held = closed below
     crosses     weekly closes through the 50W / 100W / 200W, and the 20W/50W, 50W/100W, 20W/100W and 50D/200D crosses
     turning pts daily swing lows in bears / highs in bulls (10 days each side) and weekly (3 weeks), with the nearest SMA
   usage: node build/usdtd.js <market-data dir>   -> public/usdtd.json
   Any failure keeps the last good public/usdtd.json and exits 0 with a warning, so the dashboard still deploys.
   BTC cycle tab (owner, 21 Nov 2026): the same engine run with --asset=btc on BTC itself (Coinbase BTCUSD daily from Dec 2014,
   then Binance BTCUSDT) -> public/btccycle.json and history/btc_log.json. For BTC the "bear side" of an SMA is BELOW it (for
   USDT.D it is ABOVE), the weekly read has its own rules (below the 100W = Bear), and past bears compare BTC's bottoms.
   usage: node build/usdtd.js <market-data dir> [--asset=btc] */
'use strict';
const fs = require('fs'), path = require('path');
// Alts page (owner, 27 Nov 2026): XRP, DOGE, LINK, UNI, ARB, XLM, TRX, each with its own cycle dates in config/alts.json
const ALTS = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'config', 'alts.json'), 'utf8'));
const ASSET = (() => { const a = (process.argv.find((x) => x.startsWith('--asset=')) || '--asset=usdtd').slice(8); return ['btc', 'total2es', 'eth', 'sol', 'bnb', 'spx'].includes(a) || ALTS.coins[a.toUpperCase()] ? a : 'usdtd'; })();
const ALT = ALTS.coins[ASSET.toUpperCase()] || null, IS_ALT = !!ALT;
const IS_BTC = ASSET === 'btc', IS_T2 = ASSET === 'total2es', IS_ETH = ASSET === 'eth';
// a coin with its own cycle dates (ETH, and SOL / BNB from 22 Nov 2026): BTC kept as the context column
const IS_COIN = ['eth', 'sol', 'bnb'].includes(ASSET) || IS_ALT;
// S&P 500 tab (owner, 26 Nov 2026): the BTC-cycle engine on TradingView SP:SPX daily (market-data tv/SP_SPX/1D, from Dec 2010) with
// the S&P's own cycle dates; BTC stays the context column, and a BTC-outlook block (build/spxlink.js) says what BTC did next
// in each S&P state. The S&P trades Mon-Fri only: a week closes on its last trading day and 'days' are trading days.
const IS_SPX = ASSET === 'spx', SESS = IS_SPX;
const UP = IS_BTC || IS_T2 || IS_COIN || IS_SPX;     // price-like: up = bullish (BTC, TOTAL2ES); USDT.D is the mirror
// TOTAL2ES tab (owner, 22 Nov 2026): the BTC-cycle engine on TradingView CRYPTOCAP:TOTAL2ES (altcoin market cap excluding
// BTC and stablecoins). Daily history from Apr 2014 stored once in history/total2es_1d.csv (fetched 22 Nov 2026), then days
// made from the closed 4H candles that the PC uploads to market-data (tv/CRYPTOCAP_TOTAL2ES/4H). BTC stays the context column.
// ETH cycle tab (owner, 22 Nov 2026): the BTC-cycle engine on ETH itself, with ETH's own cycle dates (closes). Daily history:
// Kraken ETHUSD from 7 Aug 2015 to 16 Aug 2017 (TradingView, stored once in history/eth_1d.csv on 22 Nov 2026), then Binance
// ETHUSDT from 17 Aug 2017 (the dashboard's own ETH candles in market-data). BTC stays the context column.
const ROOT = path.resolve(__dirname, '..'), OUT = process.env.USDTD_OUT || path.join(ROOT, 'public', IS_BTC ? 'btccycle.json' : IS_T2 ? 'total2es.json' : IS_COIN ? ASSET + 'cycle.json' : IS_SPX ? 'spxcycle.json' : 'usdtd.json');
const MD = path.resolve(process.argv.slice(2).find((a) => !a.startsWith('--')) || '../market-data');
const DAY = 86400, NS = [20, 50, 100, 200], TOL = 0.01;
const NAME = IS_BTC ? 'BTC' : IS_T2 ? 'TOTAL2ES' : IS_COIN ? ASSET.toUpperCase() : IS_SPX ? 'S&P 500' : 'USDT.D';
const START = UP ? '2015-09-01' : '2017-06-01';            // tests and records start here (USDT.D: first year with a 100W)
const LAUNCH = 'USDT launch years: USDT supply grew many times over, which pushed USDT.D up whatever crypto prices did (USDT.D never closed a week below its 100W from 2017 to Dec 2020).';
const REGIMES_USDTD = [
  { id: 'bull17', name: 'Bull 2017', kind: 'bull', from: '2017-03-01', to: '2017-12-16', caveat: LAUNCH },
  { id: 'bear18', name: 'Bear 2018', kind: 'bear', from: '2017-12-16', to: '2018-12-15', caveat: LAUNCH + ' The bear pattern still showed (above the 100W every week, peak on the day BTC bottomed), but 2018 stretch figures run high.' },
  { id: 'rally19', name: 'Rally 2019', kind: 'bull', from: '2018-12-15', to: '2019-06-26', caveat: LAUNCH },
  { id: 'bull21', name: 'Bull 2020–21', kind: 'bull', from: '2020-03-12', to: '2021-11-08' },
  { id: 'bear22', name: 'Bear 2022', kind: 'bear', from: '2021-11-08', to: '2022-11-21' },
  { id: 'bull23', name: 'Bull 2023–25', kind: 'bull', from: '2022-11-21', to: '2025-10-06' },
  { id: 'bear26', name: 'Bear 2025–26 (so far)', kind: 'bear', from: '2025-10-06', to: null }
];
const REGIMES_BTC = [
  { id: 'bull17', name: 'Bull 2015–17', kind: 'bull', from: '2015-01-14', to: '2017-12-16' },
  { id: 'bear18', name: 'Bear 2018', kind: 'bear', from: '2017-12-16', to: '2018-12-15' },
  { id: 'rally19', name: 'Rally 2019', kind: 'bull', from: '2018-12-15', to: '2019-06-26' },
  { id: 'drop20', name: 'Drop 2019–20', kind: 'bear', from: '2019-06-26', to: '2020-03-12' },
  { id: 'bull21', name: 'Bull 2020–21', kind: 'bull', from: '2020-03-12', to: '2021-11-08' },
  { id: 'bear22', name: 'Bear 2022', kind: 'bear', from: '2021-11-08', to: '2022-11-21' },
  { id: 'bull23', name: 'Bull 2023–25', kind: 'bull', from: '2022-11-21', to: '2025-10-06' },
  { id: 'bear26', name: 'Bear 2025–26 (so far)', kind: 'bear', from: '2025-10-06', to: null }
];
// ETH's own cycle (closing prices): low 21 Oct 2015, top 13 Jan 2018, bottom 15 Dec 2018, 2019 rally high 26 Jun 2019,
// low 12 Mar 2020, top 8 Nov 2021, bottom 18 Jun 2022, top 22 Aug 2025
const REGIMES_ETH = [
  { id: 'bull17', name: 'Bull 2015–18', kind: 'bull', from: '2015-10-21', to: '2018-01-13' },
  { id: 'bear18', name: 'Bear 2018', kind: 'bear', from: '2018-01-13', to: '2018-12-15' },
  { id: 'rally19', name: 'Rally 2019', kind: 'bull', from: '2018-12-15', to: '2019-06-26' },
  { id: 'drop20', name: 'Drop 2019–20', kind: 'bear', from: '2019-06-26', to: '2020-03-12' },
  { id: 'bull21', name: 'Bull 2020–21', kind: 'bull', from: '2020-03-12', to: '2021-11-08' },
  { id: 'bear22', name: 'Bear 2022', kind: 'bear', from: '2021-11-08', to: '2022-06-18' },
  { id: 'bull23', name: 'Bull 2022–25', kind: 'bull', from: '2022-06-18', to: '2025-08-22' },
  { id: 'bear26', name: 'Bear 2025–26 (so far)', kind: 'bear', from: '2025-08-22', to: null }
];
// SOL's own cycle (Binance SOLUSDT closes, from 11 Aug 2020): low 23 Dec 2020, top 6 Nov 2021, bottom 29 Dec 2022, top 18 Jan 2025
const REGIMES_SOL = [
  { id: 'bull21', name: 'Bull 2020–21', kind: 'bull', from: '2020-12-23', to: '2021-11-06' },
  { id: 'bear22', name: 'Bear 2021–22', kind: 'bear', from: '2021-11-06', to: '2022-12-29' },
  { id: 'bull23', name: 'Bull 2023–25', kind: 'bull', from: '2022-12-29', to: '2025-01-18' },
  { id: 'bear26', name: 'Bear 2025–26 (so far)', kind: 'bear', from: '2025-01-18', to: null }
];
// BNB's own cycle (Binance BNBUSDT closes, from 6 Nov 2017): top 6 Jan 2018, bottom 7 Dec 2018, 2019 rally high 21 Jun 2019
// (above the 2018 top), low 12 Mar 2020, top 3 May 2021, bottom 18 Jun 2022, top 8 Oct 2025
const REGIMES_BNB = [
  { id: 'bull17', name: 'Bull 2017–18', kind: 'bull', from: '2017-11-06', to: '2018-01-06' },
  { id: 'bear18', name: 'Bear 2018', kind: 'bear', from: '2018-01-06', to: '2018-12-07' },
  { id: 'rally19', name: 'Rally 2019', kind: 'bull', from: '2018-12-07', to: '2019-06-21' },
  { id: 'drop20', name: 'Drop 2019–20', kind: 'bear', from: '2019-06-21', to: '2020-03-12' },
  { id: 'bull21', name: 'Bull 2020–21', kind: 'bull', from: '2020-03-12', to: '2021-05-03' },
  { id: 'bear22', name: 'Bear 2021–22', kind: 'bear', from: '2021-05-03', to: '2022-06-18' },
  { id: 'bull23', name: 'Bull 2022–25', kind: 'bull', from: '2022-06-18', to: '2025-10-08' },
  { id: 'bear26', name: 'Bear 2025–26 (so far)', kind: 'bear', from: '2025-10-08', to: null }
];
// S&P 500 cycle (SP:SPX closes): top 21 May 2015, low 11 Feb 2016, top 20 Sep 2018, bottom 24 Dec 2018, top 19 Feb 2020,
// bottom 23 Mar 2020, top 3 Jan 2022, bottom 12 Oct 2022, top 19 Feb 2025, low 8 Apr 2025, top 6 Oct 2026 (drop of 10%+ so far)
const REGIMES_SPX = [
  { id: 'drop16', name: 'Drop 2015–16', kind: 'bear', from: '2015-05-21', to: '2016-02-11' },
  { id: 'bull17', name: 'Bull 2016–18', kind: 'bull', from: '2016-02-11', to: '2018-09-20' },
  { id: 'bear18', name: 'Bear 2018', kind: 'bear', from: '2018-09-20', to: '2018-12-24' },
  { id: 'rally19', name: 'Bull 2019–20', kind: 'bull', from: '2018-12-24', to: '2020-02-19' },
  { id: 'drop20', name: 'Crash 2020', kind: 'bear', from: '2020-02-19', to: '2020-03-23' },
  { id: 'bull21', name: 'Bull 2020–21', kind: 'bull', from: '2020-03-23', to: '2022-01-03' },
  { id: 'bear22', name: 'Bear 2022', kind: 'bear', from: '2022-01-03', to: '2022-10-12' },
  { id: 'bull23', name: 'Bull 2022–25', kind: 'bull', from: '2022-10-12', to: '2025-02-19' },
  { id: 'drop25', name: 'Drop 2025', kind: 'bear', from: '2025-02-19', to: '2025-04-08' },
  { id: 'bull25', name: 'Bull 2025–26', kind: 'bull', from: '2025-04-08', to: '2026-10-06' },
  { id: 'bear26', name: 'Drop 2026 (so far)', kind: 'bear', from: '2026-10-06', to: null }
];
const REGIMES = IS_ALT ? ALT.regimes : IS_SPX ? REGIMES_SPX : IS_ETH ? REGIMES_ETH : ASSET === 'sol' ? REGIMES_SOL : ASSET === 'bnb' ? REGIMES_BNB : UP ? REGIMES_BTC : REGIMES_USDTD;
// the cycle dates used for marks and "past bears vs now": BTC's (BTC, TOTAL2ES, USDT.D) or ETH's own
const CY = IS_ALT ? { who: ALT.name, ...ALT.cy } : IS_SPX ? { who: 'S&P 500', t1: '2018-09-20', t1l: 'Sep 2018', b1: '2018-12-24', t2: '2022-01-03', t2l: 'Jan 2022', b2: '2022-10-12', b2l: 'Oct 2022', t3: '2026-10-06', t3l: 'Oct 2026' }
  : ASSET === 'sol' ? { who: 'SOL', t1: null, t1l: '', b1: null, t2: '2021-11-06', t2l: 'Nov 2021', b2: '2022-12-29', b2l: 'Dec 2022', t3: '2025-01-18', t3l: 'Jan 2025' }
  : ASSET === 'bnb' ? { who: 'BNB', t1: '2018-01-06', t1l: 'Jan 2018', b1: '2018-12-07', t2: '2021-05-03', t2l: 'May 2021', b2: '2022-06-18', b2l: 'Jun 2022', t3: '2025-10-08', t3l: 'Oct 2025' }
  : IS_ETH ? { who: 'ETH', t1: '2018-01-13', t1l: 'Jan 2018', b1: '2018-12-15', t2: '2021-11-08', t2l: 'Nov 2021', b2: '2022-06-18', b2l: 'Jun 2022', t3: '2025-08-22', t3l: 'Aug 2025' }
  : { who: 'BTC', t1: '2017-12-16', t1l: 'Dec 2017', b1: '2018-12-15', t2: '2021-11-08', t2l: 'Nov 2021', b2: '2022-11-21', b2l: 'Nov 2022', t3: '2025-10-06', t3l: 'Oct 2025' };
// past bears for the "past bears vs now" comparison (BTC closes): 2018 (USDT launch years, see the caveat) and 2022
const PL = IS_ALT ? ALT.pasts_labels : ['2018', '2022'];
const PASTS = [{ top: CY.t1, bottom: CY.b1, label: PL[0] }, { top: CY.t2, bottom: CY.b2, label: PL[1] }].filter((P) => P.top);   // SOL: no 2018 bear; ARB: none
const ANALOG = { past: PASTS[PASTS.length - 1] || null, now: { top: CY.t3, label: 'now' } };

const day = (t) => new Date(t * 1000).toISOString().slice(0, 10);
const T = (d) => Date.parse(d + 'T00:00:00Z') / 1000;
const fv = (v) => (v == null ? '—' : IS_ALT ? '$' + (v < 1 ? v.toFixed(4) : v < 100 ? v.toFixed(2) : Math.round(v).toLocaleString('en-US')) : IS_SPX ? Math.round(v).toLocaleString('en-US') : IS_COIN ? '$' + (v < 100 ? v.toFixed(2) : Math.round(v).toLocaleString('en-US')) : IS_T2 ? '$' + (v >= 1e12 ? (v / 1e12).toFixed(2) + 'T' : Math.round(v / 1e9) + 'B') : IS_BTC ? '$' + Math.round(v).toLocaleString('en-US') : v.toFixed(2));
// alts trade far under $1 (DOGE $0.0016 in 2020): keep 6 significant digits there instead of 4 decimals
const r2 = (v) => (v == null || !isFinite(v) ? null : IS_ALT ? +v.toPrecision(6) : Math.round(v * 1e4) / 1e4);
const pc = (a, b) => (a == null || b == null ? null : Math.round((a / b - 1) * 1000) / 10);

function load(id) {
  const [src, sym, tf] = id.split('/'), f = path.join(MD, 'data', src, `${sym}_${tf}.csv`);
  if (!fs.existsSync(f)) throw new Error('missing ' + id);
  const L = fs.readFileSync(f, 'utf8').trim().split('\n'); L.shift();
  return L.map((ln) => { const p = ln.split(','); return { t: +p[0], o: +p[1], h: +p[2], l: +p[3], c: +p[4] }; });
}
function groupBy(rows, keyOf) { const out = []; let cur = null; for (const r of rows) { const k = keyOf(r.t); if (!cur || cur.k !== k) { cur = { k, rs: [] }; out.push(cur); } cur.rs.push(r); } return out; }
const agg = (t, rs) => ({ t, o: rs[0].o, h: Math.max(...rs.map((r) => r.h)), l: Math.min(...rs.map((r) => r.l)), c: rs[rs.length - 1].c });
const weekStart = (t) => { const d = Math.floor(t / DAY) * DAY; return d - ((new Date(d * 1000).getUTCDay() + 6) % 7) * DAY; };
function sma(rows, n) { let s = 0; return rows.map((r, i) => { s += r.c; if (i >= n) s -= rows[i - n].c; return i >= n - 1 ? s / n : null; }); }

function build() {
  let D, last1;
  const btcA = load('tv/COINBASE_BTCUSD/1D'), btcB = load('binance/BTCUSDT/1D');
  const btcAll = btcA.concat(btcB.filter((r) => r.t > btcA[btcA.length - 1].t));
  if (IS_BTC) { D = btcAll.map((r) => ({ ...r })); last1 = btcA[btcA.length - 1].t; }
  else {
    const csv = (f) => { const L = fs.readFileSync(f, 'utf8').trim().split('\n'); L.shift(); return L.map((ln) => { const p = ln.split(','); return { t: +p[0], o: +p[1], h: +p[2], l: +p[3], c: +p[4] }; }); };
    if (IS_SPX) { D = load('tv/SP_SPX/1D'); last1 = D[0].t; }
    else if (IS_ETH) { const k = csv(path.join(ROOT, 'history', 'eth_1d.csv')), bn = load('binance/ETHUSDT/1D'); last1 = k[k.length - 1].t; D = k.concat(bn.filter((r) => r.t > last1)); }
    else if (IS_ALT) {   // the coin's Binance daily, after its stored older history when there is one (XRP: Bitstamp XRPUSD to 3 May 2018)
      const bn = load(ALT.series);
      if (ALT.before) { const k = load(ALT.before).filter((r) => r.t < bn[0].t); last1 = k.length ? k[k.length - 1].t : bn[0].t; D = k.concat(bn); } else { D = bn; last1 = D[0].t; }
    }
    else if (IS_COIN) { D = load('binance/' + NAME + 'USDT/1D'); last1 = D[0].t; }
    else {
    const d1 = IS_T2 ? csv(path.join(ROOT, 'history', 'total2es_1d.csv')) : load('tv/CRYPTOCAP_USDT.D/1D'), h4 = load(IS_T2 ? 'tv/CRYPTOCAP_TOTAL2ES/4H' : 'tv/CRYPTOCAP_USDT.D/4H');
    last1 = d1[d1.length - 1].t;
    const fromH4 = groupBy(h4, (t) => Math.floor(t / DAY) * DAY).filter((g) => g.rs[g.rs.length - 1].t === g.k + 72000 && g.k > last1).map((g) => agg(g.k, g.rs));
    D = d1.concat(fromH4);
    }
  }
  if (process.env.USDTD_ASOF) D = D.filter((r) => r.t <= T(process.env.USDTD_ASOF));   // replay: build as it would have looked on that day
  const btc = new Map(btcAll.map((r) => [r.t, r.c]));
  const lastDay = D[D.length - 1].t;
  const Wall = groupBy(D, weekStart).map((g) => agg(g.k, g.rs));
  const formingWeek = Wall[Wall.length - 1].t + (SESS ? 4 : 6) * DAY > lastDay;     // its Sunday (S&P: Friday) has not closed yet
  // the day a week closes: Sunday for crypto; for the S&P the week's last trading day (holidays, e.g. Good Friday)
  const lastIn = new Map(); D.forEach((r) => lastIn.set(weekStart(r.t), r.t));
  const wEnd = (w) => (SESS ? lastIn.get(w.t) : w.t + 6 * DAY);
  const W = formingWeek ? Wall.slice(0, -1) : Wall;
  for (const [X, all] of [[D, D], [Wall, Wall]]) for (const n of NS) { const s = sma(all, n); X.forEach((r, i) => { r['s' + n] = s[i]; }); }
  D.forEach((r) => { r.btc = btc.get(r.t) ?? null; });
  W.forEach((r) => { const e = wEnd(r); r.btc = btc.get(e <= lastDay ? e : lastDay) ?? null; });

  const inR = (X, R) => X.filter((r) => r.t >= T(R.from) && (R.to == null || r.t < T(R.to)));
  // one regime x one timeframe: how the bars treated each SMA
  function behave(X) {
    const out = {};
    for (const n of NS) {
      const k = 's' + n; let above = 0, cnt = 0, cross = 0, sh = 0, sb = 0, rh = 0, rb = 0, prevSide = null;
      for (const r of X) {
        if (r[k] == null) continue;
        const side = Math.sign(r.c - r[k]); cnt++; if (side > 0) above++;
        if (prevSide != null) {
          if (side !== prevSide && side !== 0) cross++;
          if (prevSide > 0 && r.l <= r[k] * (1 + TOL)) { if (r.c >= r[k]) sh++; else sb++; }
          if (prevSide < 0 && r.h >= r[k] * (1 - TOL)) { if (r.c <= r[k]) rh++; else rb++; }
        }
        prevSide = side;
      }
      out[n] = { bars: cnt, above: cnt ? Math.round(above / cnt * 100) : null, crosses: cross, support: [sh, sh + sb], resistance: [rh, rh + rb] };
    }
    const full = X.filter((r) => r.s200 != null);
    const up = full.filter((r) => r.s20 > r.s50 && r.s50 > r.s100 && r.s100 > r.s200).length, dn = full.filter((r) => r.s20 < r.s50 && r.s50 < r.s100 && r.s100 < r.s200).length;
    out.stack = { up: full.length ? Math.round(up / full.length * 100) : null, down: full.length ? Math.round(dn / full.length * 100) : null };
    return out;
  }
  const regimes = REGIMES.filter((R) => inR(D, R).length).map((R) => {
    const dX = inR(D, R), wX = inR(W, R), hi = dX.reduce((a, r) => (r.h > a.h ? r : a), dX[0]), lo = dX.reduce((a, r) => (r.l < a.l ? r : a), dX[0]);
    return { ...R, days: dX.length, weeks: wX.length, high: { day: day(hi.t), v: r2(hi.h) }, low: { day: day(lo.t), v: r2(lo.l) }, daily: behave(dX), weekly: behave(wX) };
  });

  // crosses since 2020: price through 50W/100W/200W, SMA vs SMA (weekly), 50D vs 200D
  const since = T(UP ? '2015-01-01' : '2017-01-01');
  function crossList(X, a, b) {
    const out = []; let prev = null;
    for (const r of X) {
      const A = typeof a === 'number' ? r['s' + a] : r.c, B = r['s' + b];
      if (A == null || B == null) continue;
      const s = Math.sign(A - B);
      if (prev != null && s !== 0 && s !== prev && r.t >= since) out.push({ day: day(r.t), dir: s > 0 ? 'up' : 'down', usdtd: r2(r.c), level: r2(B), btc: r.btc != null ? Math.round(r.btc) : null });
      if (s !== 0) prev = s;
    }
    return out;
  }
  const crosses = {
    price_50w: crossList(W, null, 50), price_100w: crossList(W, null, 100), price_200w: crossList(W, null, 200),
    w20_w50: crossList(W, 20, 50), w50_w100: crossList(W, 50, 100), w20_w100: crossList(W, 20, 100), d50_d200: crossList(D, 50, 200)
  };

  // turning points: swing lows in bears (USDT.D dips = BTC relief tops), swing highs in bulls (USDT.D spikes = BTC dips)
  function pivots(X, R, k) {
    const s = inR(X, R), lowK = UP ? R.kind === 'bull' : R.kind === 'bear', col = lowK ? 'l' : 'h', out = [];
    for (let i = k; i < s.length - k; i++) {
      const w = s.slice(i - k, i + k + 1).map((r) => r[col]), v = s[i][col];
      if (v !== (lowK ? Math.min(...w) : Math.max(...w))) continue;
      const dist = {}; NS.forEach((n) => { if (s[i]['s' + n] != null) dist[n] = pc(v, s[i]['s' + n]); });
      const ks = Object.keys(dist); if (!ks.length) continue;
      const near = ks.reduce((a, b) => (Math.abs(dist[b]) < Math.abs(dist[a]) ? b : a));
      out.push({ day: day(s[i].t), v: r2(v), near: +near, near_pct: dist[near], dist, btc: s[i].btc != null ? Math.round(s[i].btc) : null });
    }
    return out;
  }
  const turning = REGIMES.filter((R) => (UP ? ['bear18', 'bull21', 'bear22', 'bull23', 'bear26'] : ['bear18', 'bear22', 'bull23', 'bear26']).includes(R.id) && inR(D, R).length).map((R) => ({ id: R.id, name: R.name, kind: R.kind, daily: pivots(D, R, 10), weekly: pivots(W, R, 3) }));

  // stretch at the big turns: % above/below each SMA on the day (daily) and vs the last closed week's SMAs (weekly)
  const stretchAt = (d) => {
    const r = D.find((x) => x.t === T(d)); if (!r) return null;
    const wk = W.filter((x) => x.t <= r.t).pop() || {};
    const o = { day: d, usdtd: r2(r.c), btc: r.btc != null ? Math.round(r.btc) : null, d: {}, w: {} };
    NS.forEach((n) => { o.d[n] = pc(r.c, r['s' + n]); o.w[n] = pc(r.c, wk['s' + n]); });
    return o;
  };
  // the bear-market extreme: USDT.D peaks (highest close), BTC bottoms (lowest close)
  const BX = UP ? -1 : 1;
  const maxIn = (a, b) => { const s = D.filter((r) => r.t >= T(a) && (!b || r.t < T(b))); if (!s.length) return null; return day(s.reduce((x, r) => (BX * r.c > BX * x.c ? r : x), s[0]).t); };
  const peak22 = maxIn('2022-01-01', '2023-01-01'), peak26 = maxIn(CY.t3), peak18 = CY.t1 ? maxIn(CY.t1, '2019-01-15') : null;
  const XW = UP ? NAME + ' low' : 'USDT.D peak';
  const marks = [
    ...(CY.t1 ? [[CY.who + ' top ' + CY.t1l, CY.t1], [XW + ' 2018' + (UP ? '' : ' (BTC bottom)'), peak18]] : []),
    [CY.who + ' top ' + CY.t2l, CY.t2], [XW + ' 2022', peak22], [CY.who + ' bottom ' + CY.b2l, CY.b2],
    [CY.who + ' top ' + CY.t3l, CY.t3], [XW + ' since ' + CY.t3l, peak26]
  ].map(([label, d]) => ({ label, ...stretchAt(d) })).filter((x) => x.day);

  // how the bear extreme unwound: first daily close back through each SMA after it (USDT.D: below; BTC: above), then weekly
  const after = (pk) => {
    if (!pk) return {};
    const o = {}, s = D.filter((r) => r.t > T(pk)), w = W.filter((r) => r.t > weekStart(T(pk)));
    NS.forEach((n) => { const x = s.find((r) => r['s' + n] != null && BX * (r.c - r['s' + n]) < 0); o['d' + n] = x ? day(x.t) : null; });
    NS.forEach((n) => { const x = w.find((r) => r['s' + n] != null && BX * (r.c - r['s' + n]) < 0); o['w' + n] = x ? day(x.t) : null; });
    return o;
  };

  // now
  const L = D[D.length - 1], LW = W[W.length - 1], FW = formingWeek ? Wall[Wall.length - 1] : null;
  const state = (X) => { const r = X[X.length - 1], o = {}; NS.forEach((n) => { o[n] = { sma: r2(r['s' + n]), pct: pc(r.c, r['s' + n]) }; }); return o; };
  const sinceOf = (list) => (list.length ? list[list.length - 1] : null);
  const weeksSince = (d) => Math.floor((lastDay - T(d)) / (7 * DAY));
  const now = {
    day: day(L.t), usdtd: r2(L.c), btc: L.btc != null ? Math.round(L.btc) : null,
    daily: state(D), weekly: { week: day(LW.t), close: r2(LW.c), ...state(W) },
    forming_week: FW ? { week: day(FW.t), close: r2(FW.c), sma: Object.fromEntries(NS.map((n) => [n, r2(FW['s' + n])])), pct: Object.fromEntries(NS.map((n) => [n, pc(FW.c, FW['s' + n])])) } : null,
    last: { price_50w: sinceOf(crosses.price_50w), price_100w: sinceOf(crosses.price_100w), price_200w: sinceOf(crosses.price_200w), w50_w100: sinceOf(crosses.w50_w100), d50_d200: sinceOf(crosses.d50_d200) }
  };
  const pastOf = (P) => { const pk = maxIn(P.top, day(T(P.bottom) + 30 * DAY)); const top0 = D.find((r) => r.t === T(P.top)); return { ...P, drawdown: top0 ? pc(D.find((r) => r.t === T(pk)).c, top0.c) : null, peak: stretchAt(pk), weeks_top_to_peak: Math.round((T(pk) - T(P.top)) / (7 * DAY)), weeks_top_to_bottom: Math.round((T(P.bottom) - T(P.top)) / (7 * DAY)), days_peak_to_bottom: Math.round((T(P.bottom) - T(pk)) / DAY), unwind: after(pk) }; };
  const analog = {
    pasts: PASTS.filter((P) => T(P.bottom) + 30 * DAY <= lastDay).map(pastOf),
    past: ANALOG.past ? { ...ANALOG.past, peak: stretchAt(peak22), weeks_top_to_peak: Math.round((T(peak22) - T(ANALOG.past.top)) / (7 * DAY)), weeks_top_to_bottom: Math.round((T(ANALOG.past.bottom) - T(ANALOG.past.top)) / (7 * DAY)), unwind: after(peak22) } : null,
    now: { ...ANALOG.now, weeks_since_top: weeksSince(ANALOG.now.top), peak: stretchAt(peak26), unwind: after(peak26),
      drawdown: (() => { const t0 = D.find((r) => r.t === T(ANALOG.now.top)), p = peak26 && D.find((r) => r.t === T(peak26)); return t0 && p ? pc(p.c, t0.c) : null; })(),
      now_vs_top: (() => { const t0 = D.find((r) => r.t === T(ANALOG.now.top)); return t0 ? pc(D[D.length - 1].c, t0.c) : null; })() }
  };

  // ---------- this week's read: fixed rules from the 2022 bear and the 2023-25 bull ----------
  //   Bull                 weekly close below the 100W (2023-25: under it the whole bull)
  //   Turning bull         weekly close below the 50W, still above the 100W (2022 bear: never closed a week below the 50W)
  //   Bear, possibly ending  above the 50W, but turned back near the prior peaks (20-day high within 2% of the lower peak,
  //                        last close 5%+ under that high) AND a daily close below the 20D or 50D (how the 2022 peak unwound)
  //   Bear                 above the 50W and 100W with the 50W above the 100W
  //   Turning bear         above the 100W but the 50W still under the 100W (the bear setup not confirmed yet)
  // the prior bear extreme as known on day di (no look-ahead): USDT.D = the highest close, BTC = the lowest close, in the
  // year before the last 20 days
  const priorExt = (di) => { const w = D.slice(Math.max(0, di - 365), Math.max(0, di - 19)).map((r) => r.c); return w.length ? (BX > 0 ? Math.max(...w) : Math.min(...w)) : null; };
  function readAt(di, wi) {
    const d = D[di], w = W[wi], last20 = D.slice(Math.max(0, di - 19), di + 1).map((r) => r.c);
    const zone = priorExt(di);
    if (!UP) {
      const hi20 = Math.max(...last20);
      const ck = {
        w100: { ok: w.c > w.s100, label: 'Weekly close above the 100W', v: r2(w.s100) },
        w50_100: { ok: w.s50 > w.s100, label: '50W above the 100W', v: r2(w.s50) },
        w50: { ok: w.c > w.s50, label: 'Weekly close above the 50W', v: r2(w.s50) },
        w20: { ok: w.c > w.s20, label: 'Weekly close above the 20W', v: r2(w.s20) },
        d20: { ok: d.c > d.s20, label: 'Daily close above the 20D', v: r2(d.s20) },
        d50: { ok: d.c > d.s50, label: 'Daily close above the 50D', v: r2(d.s50) },
        reject: { ok: zone != null && hi20 >= zone * 0.98 && d.c <= hi20 * 0.95, label: `Turned back near the prior peak (20-day high ${hi20.toFixed(2)} vs the prior year's peak ${zone != null ? zone.toFixed(2) : '—'}, now 5%+ below it)`, v: r2(hi20) }
      };
      let verdict, why;
      if (!ck.w100.ok) { verdict = 'Bull'; why = 'USDT.D closed the week below its 100W: the 2023–25 bull pattern.'; }
      else if (!ck.w50.ok) { verdict = 'Turning bull'; why = 'Weekly close below the 50W while still above the 100W. In the 2022 bear USDT.D never closed a week below the 50W; it did in Jan 2023, two months after BTC bottomed. (Aug–Oct 2026 also did this during a relief rally, then went back above.)'; }
      else if (ck.reject.ok && (!ck.d20.ok || !ck.d50.ok)) { verdict = 'Bear, possibly ending'; why = 'Turned back near the prior peak and lost the ' + (!ck.d50.ok ? '50D' : '20D') + ': how the 2022 peak started to unwind (BTC bottomed within days). Needs weekly closes below the 20W/50W to confirm.'; }
      else if (ck.w50_100.ok) { verdict = 'Bear'; why = 'Above the 50W and 100W with the 50W over the 100W: the 2022 bear pattern. Money is still moving into USDT.'; }
      else { verdict = 'Turning bear'; why = 'Above the 100W but the 50W is still under the 100W: the bear setup is not confirmed yet.'; }
      return { day: day(d.t), week: day(w.t), usdtd: r2(d.c), week_close: r2(w.c), verdict, why, checks: ck };
    }
    // BTC: below the 100W = Bear; below the 50W but above the 100W = Turning bear; above the 50W with the 50W under the
    // 100W = Turning bull; above both with the 50W over the 100W = Bull; in a Bear, holding near the prior year's low and a
    // daily close back above the 20D or 50D = Bear, possibly ending
    const lo20 = Math.min(...last20);
    const ck = {
      w100: { ok: w.c < w.s100, label: 'Weekly close below the 100W', v: r2(w.s100) },
      w50_100: { ok: w.s50 < w.s100, label: '50W below the 100W', v: r2(w.s50) },
      w50: { ok: w.c < w.s50, label: 'Weekly close below the 50W', v: r2(w.s50) },
      w20: { ok: w.c < w.s20, label: 'Weekly close below the 20W', v: r2(w.s20) },
      w200: { ok: w.s200 != null && w.c < w.s200, label: 'Weekly close below the 200W', v: r2(w.s200) },
      d20: { ok: d.c < d.s20, label: 'Daily close below the 20D', v: r2(d.s20) },
      d50: { ok: d.c < d.s50, label: 'Daily close below the 50D', v: r2(d.s50) },
      reject: { ok: zone != null && lo20 <= zone * 1.02 && d.c >= lo20 * 1.05, label: `Held near the prior low (20-day low ${fv(lo20)} vs the prior year's low ${zone != null ? fv(zone) : '—'}, now 5%+ above it)`, v: r2(lo20) }
    };
    let verdict, why;
    if (ck.w100.ok) {
      if (ck.reject.ok && (!ck.d20.ok || !ck.d50.ok)) { verdict = 'Bear, possibly ending'; why = 'Still under the 100W, but ' + NAME + ' held near the prior low and closed back above the ' + (!ck.d50.ok ? '50D' : '20D') + ': how bear bottoms started (needs weekly closes above the 20W/50W to confirm).'; }
      else { verdict = 'Bear'; why = NAME + ' closed the week below its 100W: the 2022 bear pattern' + (IS_BTC ? ' (BTC lost the 100W in May 2022 and got it back in Oct 2023).' : '.') + (ck.w200.ok ? (IS_COIN || IS_SPX ? ' It is also below the 200W.' : ' It is also below the 200W, which in 2018, 2020 and 2022 came near the bottom.') : ''); }
    } else if (ck.w50.ok) { verdict = 'Turning bear'; why = IS_SPX ? 'Weekly close below the 50W while still above the 100W: a correction that has not (yet) become a bear (in 2022 the S&P lost its 100W in May, four months after the top).' : 'Weekly close below the 50W while still above the 100W: how the 2018, 2021–22 and 2025 tops turned into bears.'; }
    else if (ck.w50_100.ok) { verdict = 'Turning bull'; why = 'Back above the 50W and 100W but the 50W is still under the 100W: the bull setup is not confirmed yet.'; }
    else { verdict = 'Bull'; why = 'Above the 50W and 100W with the 50W over the 100W: the bull pattern' + (IS_BTC ? ' (2020–21, 2023–25).' : '.'); }
    return { day: day(d.t), week: day(w.t), usdtd: r2(d.c), week_close: r2(w.c), verdict, why, checks: ck };
  }
  const weekRead = readAt(D.length - 1, W.length - 1);
  // previous weeks: the read at each of the last 8 closed weeks (daily state = that week's Sunday)
  // every closed week since Jun 2017: the last 8 for the strip, and each change of verdict for the "past record" list
  const all = [];
  for (let k = 0; k < W.length; k++) {
    if (W[k].t < T(UP ? '2015-06-01' : START) || W[k].s100 == null) continue;
    const sun = wEnd(W[k]), di = D.findIndex((r) => r.t === sun);
    if (di >= 0) { const r = readAt(di, k); all.push({ week: r.week, close: r.week_close, verdict: r.verdict, btc: D[di].btc != null ? Math.round(D[di].btc) : null }); }
  }
  const history = all.slice(-8), record = all.filter((x, i) => i === 0 || x.verdict !== all[i - 1].verdict);
  const prevR = W.length > 1 ? (() => { const sun = wEnd(W[W.length - 2]), di = D.findIndex((r) => r.t === sun); return di >= 0 ? readAt(di, W.length - 2) : null; })() : null;
  weekRead.changed = prevR ? Object.keys(weekRead.checks).filter((k) => weekRead.checks[k].ok !== prevR.checks[k].ok).map((k) => (weekRead.checks[k].ok ? 'now: ' : 'no longer: ') + weekRead.checks[k].label) : [];
  weekRead.prev_verdict = prevR ? prevR.verdict : null;
  weekRead.history = history;
  weekRead.record = record;

  // ---------- top watch / bottom watch (owner, 21 Nov 2026) ----------
  // An "extreme" = a daily close at a 90-day high (top watch) or low (bottom watch). After each one, six signs are tracked in
  // the order they usually fire. Past record (since Jun 2017, each sign counted once per extreme, within 120 days of it):
  //   moved  = USDT.D moved 20%+ the other way from the extreme within 180 days (top: fell = crypto relief rally)
  //   stayed = no close beyond the extreme in the 120 days after the sign (the extreme really was THE top / bottom)
  // (Since Jun 2017, the first full year with a 100W.) Weekly RSI(14) divergence: the extreme's week vs the strongest week 8-52 weeks earlier (the clue that marked Nov 2022).
  const rsiOf = (rows) => { let up = 0, dn = 0; return rows.map((r, i) => { if (i === 0) return null; const ch = r.c - rows[i - 1].c, a = 1 / 14; up = up * (1 - a) + Math.max(ch, 0) * a; dn = dn * (1 - a) + Math.max(-ch, 0) * a; return i < 14 ? null : (dn === 0 ? 100 : 100 - 100 / (1 + up / dn)); }); };
  const wr = rsiOf(Wall); Wall.forEach((r, i) => { r.rsi = wr[i]; });
  const wkBySun = new Map(W.map((w) => [wEnd(w), w]));
  const isSun = D.map((r) => wkBySun.has(r.t));
  const wkAt = []; { let cur = null; D.forEach((r, i) => { if (wkBySun.has(r.t)) cur = wkBySun.get(r.t); wkAt[i] = cur; }); }
  const hi90 = D.map((r, i) => (i >= 89 ? Math.max(...D.slice(i - 89, i + 1).map((x) => x.c)) : null));
  const lo90 = D.map((r, i) => (i >= 89 ? Math.min(...D.slice(i - 89, i + 1).map((x) => x.c)) : null));
  const SLOW_FROM = {}, FAST_FROM = {};
  function watch(top) {
    const s = top ? -1 : 1;                                   // top watch: signs are closes BELOW; bottom watch: ABOVE
    const beyond = (a, b) => (top ? a > b : a < b);
    // weekly signs use the last CLOSED week as of day i, and can only fire on the day a week closes (Sunday)
    const wk = (i, n) => { const w = wkAt[i]; return !!w && w['s' + n] != null && s * (w.c - w['s' + n]) > 0; };
    const STEPS = [
      { id: 'd20', label: `Daily close ${top ? 'below' : 'above'} the 20D`, f: (i) => s * (D[i].c - D[i].s20) > 0, lvl: () => L.s20 },
      { id: 'd50', label: `Daily close ${top ? 'below' : 'above'} the 50D`, f: (i) => s * (D[i].c - D[i].s50) > 0, lvl: () => L.s50 },
      { id: 'x2050', label: `20D crosses ${top ? 'under' : 'over'} the 50D`, f: (i) => s * (D[i].s20 - D[i].s50) > 0, lvl: () => null },
      { id: 'w20', label: `Weekly close ${top ? 'below' : 'above'} the 20W`, f: (i) => wk(i, 20), lvl: () => LW.s20 },
      { id: 'd200', label: `Daily close ${top ? 'below' : 'above'} the 200D`, f: (i) => s * (D[i].c - D[i].s200) > 0, lvl: () => L.s200 },
      { id: 'w50', label: `Weekly close ${top ? 'below' : 'above'} the 50W`, f: (i) => wk(i, 50), lvl: () => LW.s50 }
    ];
    const isExt = (i) => (top ? hi90[i] != null && D[i].c >= hi90[i] : lo90[i] != null && D[i].c <= lo90[i]);
    const i0 = D.findIndex((r) => r.t >= T(START));
    const record = STEPS.map((st) => {
      let h = null, armed = false, saw = false; const out = [];
      const wkly = st.id[0] === 'w';
      for (let i = i0; i < D.length - 121; i++) {
        if (isExt(i)) { h = i; armed = true; saw = !st.f(i); continue; }
        if (!armed || i - h > 120 || D[i].s200 == null) continue;
        // a sign counts only as a CROSS: USDT.D was on the other side of the level at some point since the extreme
        if (!st.f(i) || !saw || (wkly && !isSun[i])) { if (!st.f(i)) saw = true; continue; }
        armed = false;
        const stayed = !D.slice(i + 1, i + 121).some((r) => beyond(r.c, D[h].c));
        const after = D.slice(h, h + 181).map((r) => r.c), moved = top ? Math.min(...after) <= D[h].c * 0.8 : Math.max(...after) >= D[h].c * 1.2;
        out.push({ stayed, moved, days: i - h, btc: D[i].btc && D[h].btc ? (D[i].btc / D[h].btc - 1) * 100 : null });
      }
      const n = out.length, days = out.map((x) => x.days).sort((a, b) => a - b), bm = out.map((x) => x.btc).filter((v) => v != null).sort((a, b) => a - b);
      return { id: st.id, n, btc_typ: bm.length ? Math.round(bm[Math.floor(bm.length / 2)] * 10) / 10 : null, moved: n ? Math.round(out.filter((x) => x.moved).length / n * 100) : null, stayed: n ? Math.round(out.filter((x) => x.stayed).length / n * 100) : null, days: n ? days[Math.floor(n / 2)] : null };
    });
    // which extreme the current episode tracks (owner, 21 Nov 2026): the latest own 90-day extreme, unless the OPPOSITE watch
    // has turned more recently (e.g. USDT.D made a new 90-day high after the last 90-day low). Then this watch restarts from
    // that turn and follows the running extreme since it (bottom watch: the lowest close since the latest 90-day high), so it
    // is empty while USDT.D is still moving away and starts firing as soon as the move ends. The old episode is kept as "previous".
    const isOpp = (i) => (top ? lo90[i] != null && D[i].c <= lo90[i] : hi90[i] != null && D[i].c >= hi90[i]);
    let hOwn = -1; for (let i = D.length - 1; i >= 0; i--) if (isExt(i)) { hOwn = i; break; }
    let hOpp = -1; for (let i = D.length - 1; i >= 0; i--) if (isOpp(i)) { hOpp = i; break; }
    function episode(h) {
      const steps = STEPS.map((st, k) => {
        let fired = null, btcAt = null, saw = !st.f(h); const wkly = st.id[0] === 'w';
        for (let i = h + 1; i < D.length; i++) { if (st.f(i) && saw && (!wkly || isSun[i])) { fired = day(D[i].t); btcAt = D[i].btc != null ? Math.round(D[i].btc) : null; break; } if (!st.f(i)) saw = true; }
        const btcChg = btcAt != null && D[h].btc ? pc(btcAt, D[h].btc) : null;
        const weekly = st.id[0] === 'w', n = +st.id.slice(1);
        const onNow = weekly ? s * (LW.c - LW['s' + n]) > 0 : st.f(D.length - 1);   // weekly signs: the last closed week
        return { id: st.id, label: st.label, level: r2(st.lvl()), on_now: !!onNow, fired, btc: btcAt, btc_chg: btcChg, ...record[k] };
      });
      // weekly RSI divergence: the week of the extreme (or the forming week when the extreme is in it) vs the strongest prior week
      const wIdx = Wall.findIndex((w) => w.t === weekStart(D[h].t)), cur = Wall[wIdx];
      const win = Wall.slice(Math.max(0, wIdx - 52), Math.max(0, wIdx - 8)).filter((w) => w.rsi != null);
      const prev = win.length ? win.reduce((a, w) => (top ? (w.c > a.c ? w : a) : (w.c < a.c ? w : a))) : null;
      let div = null;
      if (prev && cur && cur.rsi != null) {
        const near = top ? cur.c >= prev.c * 0.97 : cur.c <= prev.c * 1.03;
        const weaker = top ? cur.rsi < prev.rsi - 2 : cur.rsi > prev.rsi + 2;
        div = { prev_week: day(prev.t), prev_close: r2(prev.c), prev_rsi: Math.round(prev.rsi * 10) / 10, week: day(cur.t), close: r2(cur.c), rsi: Math.round(cur.rsi * 10) / 10,
          forming: formingWeek && cur === Wall[Wall.length - 1], near, divergence: near && weaker };
      }
      const fired = steps.filter((x) => x.fired).length, S = (id) => steps.find((x) => x.id === id);
      const w50 = S('w50').fired && S('w50').on_now, w20 = S('w20').fired && S('w20').on_now, w20was = S('w20').fired && !S('w20').on_now;
      const dOn = steps.filter((x) => x.fired && x.id[0] === 'd' && x.on_now).length, dWas = steps.filter((x) => x.fired && x.id[0] === 'd').length;
      const M = UP ? { tw: '', tc: ': not yet proof the bull is over', te: '', bw: ` (${NAME} bottom confirmed on the weekly)`, bc: `: ${NAME} bounce, not yet proof the bear is over`, be: '' }
        : { tw: '', tc: ': relief rally for crypto; not yet proof the bear is over', te: ' (crypto relief likely)', bw: ' (crypto top warning)', bc: ': crypto pullback', be: ' (crypto dip likely)' };
      const status = top
        ? (w50 ? 'Swing top likely in: weekly close below the 50W and still under it' : w20 ? `Pullback confirmed on the weekly (below the 20W)${M.tc}` : dOn ? `Early warning: ${NAME} has started to turn down${M.te}; many of these fail` : (w20was || dWas) ? `Signs fired but ${NAME} is back above those levels: the turn has not held` : div && div.divergence ? `Top setup: near the prior peak on weaker weekly momentum${UP ? '' : ' (like Nov 2022)'}; no break yet` : `No top signs yet: ${NAME} still rising`)
        : (w50 ? `Swing bottom likely in: weekly close above the 50W and still over it${M.bw}` : w20 ? `${NAME} bounce confirmed on the weekly (above the 20W)${M.bc}` : dOn ? `Early warning: ${NAME} has started to turn up${M.be}; many of these fail` : (w20was || dWas) ? `Signs fired but ${NAME} is back below those levels: the turn has not held` : div && div.divergence ? 'Bottom setup: near the prior low on stronger weekly momentum; no break yet' : `No bottom signs yet: ${NAME} still falling`);
      const btcNow = L.btc != null ? Math.round(L.btc) : null;
      return { btc_now: btcNow, btc_now_chg: btcNow != null && D[h].btc ? pc(btcNow, D[h].btc) : null, extreme: { day: day(D[h].t), v: r2(D[h].c), btc: D[h].btc != null ? Math.round(D[h].btc) : null, days_ago: D.length - 1 - h }, steps, fired, divergence: div, status };
    }
    const turnWord = top ? 'low' : 'high', ownWord = top ? 'high' : 'low';
    // for the history: the first CROSS of each sign after h and before `until` (index), with BTC then
    const stepsFrom = (h, until) => STEPS.map((st) => {
      let saw = !st.f(h); const wkly = st.id[0] === 'w';
      for (let i = h + 1; i < until; i++) { if (st.f(i) && saw && (!wkly || isSun[i])) return { id: st.id, day: day(D[i].t), usdtd: r2(D[i].c), btc: D[i].btc != null ? Math.round(D[i].btc) : null, btc_chg: D[i].btc && D[h].btc ? pc(D[i].btc, D[h].btc) : null }; if (!st.f(i)) saw = true; }
      return { id: st.id, day: null };
    });
    SLOW_FROM[top ? 'top' : 'bottom'] = stepsFrom;
    if (hOwn >= hOpp) return { kind: top ? 'top' : 'bottom', mode: 'own', ...episode(hOwn) };
    // the opposite watch turned more recently: restart from that turn
    const opp = { day: day(D[hOpp].t), v: r2(D[hOpp].c), btc: D[hOpp].btc != null ? Math.round(D[hOpp].btc) : null };
    const pe = hOwn >= 0 ? episode(hOwn) : null;
    const previous = pe ? { extreme: pe.extreme, fired: pe.fired, status: pe.status } : null;
    if (hOpp === D.length - 1) {
      return { kind: top ? 'top' : 'bottom', mode: 'waiting', since_turn: opp, previous, steps: STEPS.map((st, k) => ({ id: st.id, label: st.label, level: r2(st.lvl()), on_now: false, fired: null, ...record[k] })), fired: 0,
        status: `Waiting: ${NAME} made a new 90-day ${turnWord} today (${fv(opp.v)}); this watch restarts from the next ${NAME} ${ownWord}` };
    }
    let h = hOpp + 1; for (let i = hOpp + 1; i < D.length; i++) if (top ? D[i].c > D[h].c : D[i].c < D[h].c) h = i;
    const e = episode(h);
    if (h === D.length - 1 && !e.fired) e.status = `Restarted after the ${opp.day} ${NAME} ${turnWord}: still ${top ? 'rising' : 'falling'}, new ${ownWord} today; signs start counting once it ${top ? 'stops rising' : 'stops falling'}`;
    return { kind: top ? 'top' : 'bottom', mode: 'since_turn', since_turn: opp, previous, ...e };
  }
  const topWatch = watch(true), bottomWatch = watch(false);

  // ---------- early warning (fast daily layer, owner 21 Nov 2026) ----------
  // Extreme = a daily close at a 30-day high (top) or low (bottom). Signs, each counted once per extreme within 30 days:
  //   div    RSI(14) divergence AT the extreme: the strongest (top) / weakest (bottom) 30-day extreme 5-40 days earlier had an
  //          RSI at least 3 points stronger (top) / weaker (bottom); fires on the extreme's own day (a setup, not a trigger)
  //   div10  divergence, then a daily close beyond the 10D (below for top, above for bottom)
  //   rev    key reversal: a close beyond the extreme day's low (top) / high (bottom)
  //   d10    a daily close beyond the 10D
  //   swing  a close beyond the lowest (top) / highest (bottom) close of the 7 days before the extreme
  //   d20    a daily close beyond the 20D
  // Past record since Jun 2017: moved = USDT.D moved 10%+ the other way within 60 days; held = no close beyond the extreme in
  // the 60 days after the sign; lag = days after the extreme; btc_by = BTC's move from the extreme to the sign; btc30 = BTC's
  // move in the 30 days after the sign (median) and how often it was up. Base = every 30-day extreme, for comparison.
  const dr = rsiOf(D); D.forEach((r, i) => { r.rsi = dr[i]; });
  const s10 = sma(D, 10); D.forEach((r, i) => { r.s10 = s10[i]; });
  const med = (a) => { const s = a.filter((v) => v != null && isFinite(v)).sort((x, y) => x - y); return s.length ? Math.round(s[Math.floor(s.length / 2)] * 10) / 10 : null; };
  function fast(top) {
    const sg = top ? 1 : -1, N = 30;
    const isExt = D.map((r, i) => i >= N - 1 && (top ? r.c >= Math.max(...D.slice(i - N + 1, i + 1).map((x) => x.c)) : r.c <= Math.min(...D.slice(i - N + 1, i + 1).map((x) => x.c))));
    const EXT = []; isExt.forEach((v, i) => { if (v) EXT.push(i); });
    const divAt = (h) => {
      const prev = EXT.filter((j) => j >= h - 40 && j <= h - 5 && D[j].rsi != null);
      if (!prev.length || D[h].rsi == null) return null;
      const j = prev.reduce((a, x) => (sg * D[x].rsi > sg * D[a].rsi ? x : a));
      return { prev_day: day(D[j].t), prev_rsi: Math.round(D[j].rsi * 10) / 10, rsi: Math.round(D[h].rsi * 10) / 10, divergence: sg * (D[j].rsi - D[h].rsi) >= 3 };
    };
    const beyond10 = (i) => D[i].s10 != null && sg * (D[i].s10 - D[i].c) > 0;
    const SIGNS = [
      { id: 'div', label: `RSI divergence at the ${top ? 'high' : 'low'} (setup)`, at: true },
      { id: 'div10', label: `Divergence, then a close ${top ? 'below' : 'above'} the 10D`, f: (i, h, dv) => dv && beyond10(i), lvl: () => L.s10 },
      { id: 'rev', label: `Key reversal: close ${top ? "below the high day's low" : "above the low day's high"}`, f: (i, h) => (top ? D[i].c < D[h].l : D[i].c > D[h].h), lvl: (h) => (top ? D[h].l : D[h].h) },
      { id: 'd10', label: `Daily close ${top ? 'below' : 'above'} the 10D`, f: (i) => beyond10(i), lvl: () => L.s10 },
      { id: 'swing', label: `Swing break: close ${top ? 'below' : 'above'} the 7-day ${top ? 'low' : 'high'} before it`, f: (i, h) => { const w = D.slice(Math.max(0, h - 7), h).map((r) => r.c); return top ? D[i].c < Math.min(...w) : D[i].c > Math.max(...w); }, lvl: (h) => { const w = D.slice(Math.max(0, h - 7), h).map((r) => r.c); return top ? Math.min(...w) : Math.max(...w); } },
      { id: 'd20', label: `Daily close ${top ? 'below' : 'above'} the 20D`, f: (i) => D[i].s20 != null && sg * (D[i].s20 - D[i].c) > 0, lvl: () => L.s20 }
    ];
    const i0 = D.findIndex((r) => r.t >= T(START));
    const outcome = (i, h) => {
      const fut = D.slice(i + 1, i + 61).map((r) => r.c);
      const b0 = D[h].btc, bi = D[i].btc, b30 = D[i + 30] && D[i + 30].btc;
      return { moved: top ? Math.min(...fut) <= D[h].c * 0.9 : Math.max(...fut) >= D[h].c * 1.1, held: !fut.some((v) => (top ? v > D[h].c : v < D[h].c)), lag: i - h,
        by: b0 && bi ? (bi / b0 - 1) * 100 : null, f30: bi && b30 ? (b30 / bi - 1) * 100 : null };
    };
    const summ = (out) => { const n = out.length; return n ? { n, moved: Math.round(out.filter((x) => x.moved).length / n * 100), held: Math.round(out.filter((x) => x.held).length / n * 100), lag: med(out.map((x) => x.lag)), btc_by: med(out.map((x) => x.by)), btc30: med(out.map((x) => x.f30)), btc30_up: Math.round(out.filter((x) => x.f30 != null && x.f30 > 0).length / Math.max(1, out.filter((x) => x.f30 != null).length) * 100) } : { n: 0 }; };
    const record = {}, base = [];
    for (const S of SIGNS) {
      const out = []; let h = null, armed = false, dv = false;
      for (let i = i0; i < D.length - 61; i++) {
        let fire = false;
        if (isExt[i]) { h = i; armed = true; const d = divAt(i); dv = !!(d && d.divergence); if (S.id === 'div' && dv) fire = true; else if (S.id === 'base') fire = true; else continue; }
        else { if (!armed || i - h > 30 || S.at) continue; fire = S.f(i, h, dv); }
        if (!fire) continue;
        armed = false; out.push(outcome(i, h));
      }
      record[S.id] = summ(out);
    }
    for (let i = i0; i < D.length - 61; i++) if (isExt[i]) base.push(outcome(i, i));
    FAST_FROM[top ? 'top' : 'bottom'] = (h0, until) => {
      const dv = divAt(h0), on = !!(dv && dv.divergence);
      return SIGNS.map((S) => {
        let i = null;
        if (S.at) { if (on) i = h0; }
        else for (let k = h0 + 1; k < Math.min(until, D.length) && k - h0 <= 30; k++) if (S.f(k, h0, on)) { i = k; break; }
        return i == null ? { id: S.id, day: null } : { id: S.id, day: day(D[i].t), usdtd: r2(D[i].c), btc: D[i].btc != null ? Math.round(D[i].btc) : null, btc_chg: D[i].btc && D[h0].btc ? pc(D[i].btc, D[h0].btc) : null };
      });
    };
    // current episode
    let h = -1; for (let i = D.length - 1; i >= 0; i--) if (isExt[i]) { h = i; break; }
    const dvNow = divAt(h), dvOn = !!(dvNow && dvNow.divergence);
    const signs = SIGNS.map((S) => {
      let fired = null, bt = null;
      if (S.at) { if (dvOn) { fired = day(D[h].t); bt = D[h].btc; } }
      else for (let i = h + 1; i < D.length && i - h <= 30; i++) if (S.f(i, h, dvOn)) { fired = day(D[i].t); bt = D[i].btc; break; }
      return { id: S.id, label: S.label, level: S.lvl ? r2(S.lvl(h)) : null, fired, btc: bt != null ? Math.round(bt) : null, btc_chg: bt != null && D[h].btc ? pc(bt, D[h].btc) : null, ...record[S.id] };
    });
    const F = (id) => signs.find((x) => x.id === id).fired, expired = D.length - 1 - h > 30;
    const status = expired ? `No new 30-day ${top ? 'high' : 'low'} for ${D.length - 1 - h} days: the signs below are from the ${day(D[h].t)} ${top ? 'high' : 'low'} and are no longer live`
      : UP ? (top ? (F('swing') ? `Swing break: short-term ${NAME} top confirmed (pullback under way)` : F('div10') ? `Best early sign for ${NAME} tops: divergence + close below the 10D (pullback likely)` : (F('rev') || F('d10') || F('d20')) ? `Early warning: ${NAME} turning down (pullback possible; many of these fail)` : dvOn ? `Setup: new high on weaker RSI; a close below the 10D (${fv(L.s10)}) would trigger` : `No early signs: ${NAME} momentum still rising`)
        : (F('swing') ? `Swing break: short-term ${NAME} bottom confirmed (bounce under way)` : F('div10') ? `Divergence + close above the 10D (${NAME} bounce likely)` : (F('rev') || F('d10') || F('d20')) ? `Early warning: ${NAME} turning up (bounce possible; many of these fail)` : dvOn ? `Setup: new low on stronger RSI; a close above the 10D (${fv(L.s10)}) would trigger` : `No early signs: ${NAME} still falling`))
      : top ? (F('swing') ? 'Swing break: short-term USDT.D top confirmed (crypto bounce under way)' : F('div10') ? 'Best early sign: divergence + close below the 10D (crypto bounce likely)' : (F('rev') || F('d10') || F('d20')) ? 'Early warning: USDT.D turning down (crypto bounce possible; many of these fail)' : dvOn ? `Setup: new high on weaker RSI; a close below the 10D (${f2s(L.s10)}) would trigger the best early sign` : 'No early signs: USDT.D momentum still rising')
        : (F('swing') ? 'Swing break: short-term USDT.D bottom confirmed (crypto pullback under way)' : F('div10') ? 'Divergence + close above the 10D (crypto pullback possible)' : (F('rev') || F('d10') || F('d20')) ? 'Early warning: USDT.D turning up (crypto pullback possible; many of these fail)' : dvOn ? `Setup: new low on stronger RSI; a close above the 10D (${f2s(L.s10)}) would trigger` : 'No early signs: USDT.D still falling');
    return { kind: top ? 'top' : 'bottom', extreme: { day: day(D[h].t), v: r2(D[h].c), btc: D[h].btc != null ? Math.round(D[h].btc) : null, days_ago: D.length - 1 - h }, expired,
      rsi_now: D[D.length - 1].rsi != null ? Math.round(D[D.length - 1].rsi * 10) / 10 : null, divergence: dvNow, signs, base: summ(base), status };
  }
  const f2s = (v) => (v == null ? '—' : v.toFixed(2));
  const topFast = fast(true), bottomFast = fast(false);
  topWatch.fast = topFast; bottomWatch.fast = bottomFast;

  // ---------- every USDT.D top and bottom (owner, 21 Nov 2026) ----------
  // Swings alternate: a top run starts at the first USDT.D 90-day closing high after a 90-day low (and the reverse); the swing's
  // top (bottom) is the highest (lowest) close before the next opposite run starts. For each swing: the fast and the slow signs
  // (first cross after the extreme, up to the next swing's extreme), BTC at each, and the move to the next swing. The last swing
  // is open (still running). Since Jun 2017 (the first year with a 100W).
  const swings = [];
  {
    let state = null, start = null; const runs = [];
    for (let i = D.findIndex((r) => r.t >= T(START)); i < D.length; i++) {
      const hiE = hi90[i] != null && D[i].c >= hi90[i], loE = lo90[i] != null && D[i].c <= lo90[i];
      if (hiE && state !== 'top') { if (state) runs.push({ kind: state, start, end: i }); state = 'top'; start = i; }
      else if (loE && state !== 'bottom') { if (state) runs.push({ kind: state, start, end: i }); state = 'bottom'; start = i; }
    }
    if (state) runs.push({ kind: state, start, end: D.length, open: true });
    const ext = runs.map((r) => { let h = r.start; for (let i = r.start; i < r.end; i++) if (r.kind === 'top' ? D[i].c > D[h].c : D[i].c < D[h].c) h = i; return h; });
    runs.forEach((r, k) => {
      const h = ext[k], nh = k + 1 < runs.length ? ext[k + 1] : null, until = nh != null ? nh : D.length, top = r.kind === 'top';
      const pt = (i) => ({ day: day(D[i].t), usdtd: r2(D[i].c), btc: D[i].btc != null ? Math.round(D[i].btc) : null });
      swings.push({ kind: r.kind, open: !!r.open, run_start: day(D[r.start].t), extreme: pt(h),
        fast: FAST_FROM[r.kind](h, until), slow: SLOW_FROM[r.kind](h, until),
        next: nh != null ? { ...pt(nh), days: nh - h, usdtd_chg: pc(D[nh].c, D[h].c), btc_chg: D[nh].btc && D[h].btc ? pc(D[nh].btc, D[h].btc) : null } : null,
        so_far: nh == null ? { days: D.length - 1 - h, usdtd_chg: pc(L.c, D[h].c), btc_chg: L.btc && D[h].btc ? pc(L.btc, D[h].btc) : null } : null });
    });
  }

  // permanent log (history/usdtd_log.json, committed by the workflow): every sign that fired for a swing and every swing once
  // it closed, with the day it was first written. The first run fills it from history ("reconstructed"); later entries are live.
  const LOGF = process.env.USDTD_LOG || path.join(ROOT, 'history', IS_BTC ? 'btc_log.json' : IS_T2 ? 'total2es_log.json' : IS_COIN || IS_SPX ? ASSET + '_log.json' : 'usdtd_log.json');
  let log = null;
  if (!process.env.USDTD_ASOF) {
    const first = !fs.existsSync(LOGF);
    log = first ? { _about: NAME + ' tops and bottoms as the dashboard saw them (build/usdtd.js). live=false: filled from history on the first run (21 Nov 2026); live=true: written by the build when it happened.', entries: [] } : JSON.parse(fs.readFileSync(LOGF, 'utf8'));
    const have = new Set(log.entries.map((e) => e.key)), stamp = new Date().toISOString().slice(0, 16).replace('T', ' ') + ' UTC';
    const add = (e) => { if (!have.has(e.key)) { have.add(e.key); log.entries.push({ ...e, logged_at: stamp, live: !first }); } };
    swings.forEach((w) => {
      const id = w.kind + '|' + w.run_start;
      [['fast', w.fast], ['slow', w.slow]].forEach(([layer, list]) => list.forEach((x) => { if (x.day) add({ key: id + '|' + layer + '|' + x.id, swing: id, kind: w.kind, layer, sign: x.id, day: x.day, usdtd: x.usdtd, btc: x.btc, btc_chg: x.btc_chg }); }));
      if (!w.open) add({ key: id + '|closed', swing: id, kind: w.kind, event: 'closed', extreme: w.extreme, next: w.next });
    });
    fs.mkdirSync(path.dirname(LOGF), { recursive: true });
    fs.writeFileSync(LOGF, JSON.stringify(log, null, 1));
  }
  const liveKeys = log ? Object.fromEntries(log.entries.filter((e) => e.live).map((e) => [e.key, e.logged_at])) : {};
  swings.forEach((w) => { const id = w.kind + '|' + w.run_start; w.live = {}; Object.entries(liveKeys).forEach(([k, at]) => { if (k.startsWith(id + '|')) w.live[k.slice(id.length + 1)] = at; }); });

  // chart series: daily from 2020, weekly from 2019 (SMAs included); compact arrays
  const ser = (X, from) => X.filter((r) => r.t >= T(from)).map((r) => [day(r.t), r2(r.c), r2(r.s20), r2(r.s50), r2(r.s100), r2(r.s200), r.btc != null ? Math.round(r.btc) : null]);
  return {
    generated: new Date().toISOString().slice(0, 16).replace('T', ' ') + ' UTC',
    source: IS_ALT ? NAME + ': ' + (ALT.before ? 'Bitstamp XRPUSD daily to ' + day(last1) + ' (TradingView, stored once in Market-Data), then ' : '') + 'Binance ' + NAME + 'USDT daily from ' + (ALT.before ? day(last1 + DAY) : day(D[0].t)) + ' (closing prices, UTC days); BTC: Coinbase BTCUSD then Binance BTCUSDT.' : IS_SPX ? 'S&P 500: TradingView SP:SPX daily from ' + day(D[0].t) + ' (market-data tv/SP_SPX/1D; closing prices, New York trading days; weeks close on their last trading day). BTC: Coinbase BTCUSD then Binance BTCUSDT, the UTC day of each S&P session.' : IS_COIN && !IS_ETH ? NAME + ': Binance ' + NAME + 'USDT daily from ' + day(D[0].t) + ' (closing prices, UTC days); BTC: Coinbase BTCUSD then Binance BTCUSDT.' : IS_ETH ? 'ETH: Kraken ETHUSD daily to ' + day(last1) + ' (TradingView, stored once, history/eth_1d.csv), then Binance ETHUSDT (closing prices, UTC days); BTC: Coinbase BTCUSD then Binance BTCUSDT.' : IS_T2 ? 'TOTAL2ES: TradingView CRYPTOCAP:TOTAL2ES daily to ' + day(last1) + ' (stored once, history/total2es_1d.csv), then days from closed 4H candles; BTC: Coinbase BTCUSD then Binance BTCUSDT (closing prices).' : IS_BTC ? 'BTC: Coinbase BTCUSD daily to ' + day(last1) + ', then Binance BTCUSDT (closing prices, UTC days).' : 'USDT.D: TradingView CRYPTOCAP:USDT.D daily to ' + day(last1) + ', then days from closed 4H candles; BTC: Coinbase BTCUSD then Binance BTCUSDT (closing prices).',
    ...(IS_SPX ? { btc_link: require('./spxlink.js')(D, btcAll, { day, T, DAY }) } : {}),
    ...(IS_ALT ? { coin: (({ regimes, series, before, ...w }) => w)(ALT) } : {}),
    asset: ASSET, name: NAME, tolerance_pct: TOL * 100, read: weekRead, top_watch: topWatch, bottom_watch: bottomWatch, swings, regimes, crosses, turning, marks, analog, now,
    series: { cols: ['day', 'close', 's20', 's50', 's100', 's200', 'btc'], daily: ser(D, UP ? '2015-01-01' : '2017-01-01'), weekly: ser(Wall, UP ? '2015-01-01' : '2016-01-01'), forming_week: !!FW }
  };
}

try {
  const o = build();
  const prev = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : null;
  const same = prev && JSON.stringify({ ...prev, generated: 0 }) === JSON.stringify({ ...o, generated: 0 });
  if (same) console.log(path.basename(OUT) + ' unchanged (' + o.now.day + ')');
  else { fs.writeFileSync(OUT, JSON.stringify(o)); console.log(path.basename(OUT) + ' written: ' + o.now.day + ' ' + NAME + ' ' + o.now.usdtd + ' (' + o.series.daily.length + ' days)'); }
} catch (e) {
  console.log('::warning::' + NAME + ' tab not rebuilt, last good kept: ' + (e.stack || e));
}
