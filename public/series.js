/* Composite series + gauges + timing (port of idx.py and timing.py) */
(function(root){
'use strict';
const Z=(typeof require!=='undefined'&&typeof module!=='undefined')?require('./engine.js'):root.ZE;
const {rsi,atr,resample,day,week,fmt}=Z;
const SYMS={T2:'CRYPTOCAP:TOTAL2ES',TOT:'CRYPTOCAP:TOTAL',TOTES:'CRYPTOCAP:TOTALES',T3:'CRYPTOCAP:TOTAL3ES',USDT:'CRYPTOCAP:USDT.D',USDC:'CRYPTOCAP:USDC.D',BTCD:'CRYPTOCAP:BTC.D',ETHBTC:'BINANCE:ETHBTC',GOLD:'TVC:GOLD',SILV:'TVC:SILVER',OTH:'CRYPTOCAP:OTHERS',BTC:'CRYPTOCAP:BTC',STB:'CRYPTOCAP:STABLE.C'};
const idxOf=B=>{const m=new Map();B.t.forEach((t,i)=>m.set(t,i));return m};
const scale=(B,f)=>{const o={};for(const k of 'tohlcv')o[k]=('ohlc'.includes(k))?B[k].map(x=>x*f):B[k].slice();return o};
function comb(ts,fn){const o={t:[],o:[],h:[],l:[],c:[],v:[]};for(const t of ts){const r=fn(t);o.t.push(t);o.o.push(r[0]);o.h.push(r[1]);o.l.push(r[2]);o.c.push(r[3]);o.v.push(0)}return o}
function compose(R){
 if(!R.USDT||!R.USDC)return {S_dom:null,S_rat:null};
 const iu=idxOf(R.USDT),ic=idxOf(R.USDC);
 const S_dom=comb(R.USDT.t.filter(t=>ic.has(t)),t=>{const a=iu.get(t),b=ic.get(t);const g=k=>R.USDT[k][a]+R.USDC[k][b];return [g('o'),g('h'),g('l'),g('c')]});
 if(!R.OTH||!R.BTC||!R.T2)return {S_dom,S_rat:null};
 const i1=idxOf(R.T2),i2=idxOf(R.OTH),i3=idxOf(R.BTC);const ts=R.T2.t.filter(t=>i2.has(t)&&i3.has(t));
 const v=ts.map(t=>(R.T2.c[i1.get(t)]-R.OTH.c[i2.get(t)])/R.BTC.c[i3.get(t)]);
 const S_rat={t:[],o:[],h:[],l:[],c:[],v:[]};ts.forEach((t,i)=>{const o=i?v[i-1]:v[i],c=v[i];S_rat.t.push(t);S_rat.o.push(o);S_rat.h.push(Math.max(o,c));S_rat.l.push(Math.min(o,c));S_rat.c.push(c);S_rat.v.push(0)});
 return {S_dom,S_rat}}
const GDEF=(R,S)=>[
 ['TOTAL2ES','CRYPTOCAP:TOTAL2ES','Total market cap excluding BTC and ETH, USD billions',R.T2&&scale(R.T2,1e-9)],
 ['TOTAL3ES','CRYPTOCAP:TOTAL3ES','Total market cap excluding BTC, ETH and stablecoins (altcoins only), USD billions',R.T3&&scale(R.T3,1e-9)],
 ['TOTAL','CRYPTOCAP:TOTAL','Total crypto market cap, USD billions',R.TOT&&scale(R.TOT,1e-9)],
  ['USDT.D+USDC.D','CRYPTOCAP:USDT.D','Stablecoin dominance, USDT.D plus USDC.D, % (chart link opens USDT.D)',S.S_dom],
  ['ETHBTC','BINANCE:ETHBTC','ETH priced in BTC',R.ETHBTC],
  ['GOLD','TVC:GOLD','Gold spot, USD per ounce (TVC:GOLD)',R.GOLD],
  ['SILVER','TVC:SILVER','Silver spot, USD per ounce (TVC:SILVER)',R.SILV]];
  function buildGauges(R){const S=compose(R);const out=[];for(const [sym,tv,desc,B4] of GDEF(R,S)){if(!B4||!B4.c||B4.c.length<60)continue;const g=Z.buildGauge(sym,tv,desc,B4);
  try{if(root.HO){const Bd=resample(B4,day),d={};for(const k of 'tohlcv')d[k]=Bd[k].slice(0,-1);g.hold=root.HO.current(d,root.HOLD_POOL_G||null)}}catch(e){}
  out.push(g)}return out}
// ---------- timing ----------
const sma=(c,n)=>c.length>=n?c.slice(-n).reduce((a,b)=>a+b,0)/n:null;
const dropLast=B=>{const o={};for(const k in B)o[k]=B[k].slice(0,-1);return o};
const tfs=B4=>{const Bd=resample(B4,day);return {'4H':B4,'1D':Bd,'1W':resample(Bd,week)}};
const MON=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const d2=t=>{const d=new Date(t*1000);return String(d.getUTCDate()).padStart(2,'0')+' '+MON[d.getUTCMonth()]+' '+d.getUTCFullYear()};
function stretchPct(c,n=50){const st=[];for(let i=n-1;i<c.length;i++){let s=0;for(let j=i-n+1;j<=i;j++)s+=c[j];st.push((c[i]/(s/n)-1)*100)}const last=st[st.length-1];return [last,100*st.filter(x=>x<=last).length/st.length,st.length]}
function buildTiming(R,T0){
 const S=compose(R);T0=T0||Date.UTC(2026,0,1)/1000;const SER={RATIO:S.S_rat,TOTAL2ES:scale(R.T2,1e-9)};
 const TF={};for(const k in SER)TF[k]=tfs(SER[k]);
 const out={generated:new Date().toISOString().slice(0,16).replace('T',' ')+' UTC',tf:{}};
 for(const tf of ['4H','1D','1W']){const res={};
  for(const name in SER){const B=dropLast(TF[name][tf]),c=B.c,a=atr(B),last=c[c.length-1],m20=sma(c,20),m50=sma(c,50);
   const ev=Z.events_tf(B,tf,a,Z.CFG[tf]);let zz=Z.zones(ev,a,last,8,3),weak=false;if(!zz.length){zz=Z.zones(ev,a,last,8,2);weak=true}
   const [Sx,Rx]=Z.rank_sides(zz,last,1);
   res[name]={last,t:B.t[B.t.length-1],ma20:m20,ma50:m50,atr:a,d20:(last/m20-1)*100,d50:(last/m50-1)*100,a20:(last-m20)/a,a50:(last-m50)/a,S:Sx.length?Z.zout(Sx[0],last,'S'):null,R:Rx.length?Z.zout(Rx[0],last,'R'):null,zweak:weak,bars:c.length}}
  out.tf[tf]=res}
 const Bw=dropLast(TF.RATIO['1W']);const wh=Bw.h.slice(-5),wt=Bw.t.slice(-5);
 out.wk_highs=wh.map((h,i)=>({t:d2(wt[i]),h}));out.wk_up_steps=[1,2,3,4].filter(i=>wh[i]>wh[i-1]).length;
 const Bd=dropLast(TF.RATIO['1D']);let pk=-1;Bd.t.forEach((t,i)=>{if(t>=T0&&(pk<0||Bd.h[i]>Bd.h[pk]))pk=i});
 out.peak={v:Bd.h[pk],t:d2(Bd.t[pk])};out.depth={};for(const tf in out.tf)out.depth[tf]=(out.tf[tf].RATIO.last/out.peak.v-1)*100;
 out.depth_close=(Bw.c[Bw.c.length-1]/out.peak.v-1)*100;
 const dc=dropLast(resample(S.S_dom,day)).c,dlo=Math.min(...dc),dhi=Math.max(...dc);
 out.heat={dom:{last:dc[dc.length-1],lo:dlo,hi:dhi,pos:(dc[dc.length-1]-dlo)/(dhi-dlo)*100}};
 for(const tf of ['4H','1D','1W']){const h={};for(const name in SER){const c=dropLast(TF[name][tf]).c;const [x,p,n]=stretchPct(c);h[name]={rsi:rsi(c),stretch:x,pct:p,n,ma20:sma(c,20),last:c[c.length-1]}}out.heat[tf]=h}
 // extras used by the cheap-entry table
 const T2d=dropLast(TF.TOTAL2ES['1D']);const hi=T2d.h.slice(-365);
 out._x={t2_hi365:Math.max(...hi),ratio_rsi_1d:out.heat['1D'].RATIO.rsi,t2_rsi_1w:out.heat['1W'].TOTAL2ES.rsi,ratio_wclose:Bw.c[Bw.c.length-1],dom:Z.buildGauge('USDT.D+USDC.D','','',S.S_dom)};
 return out}
function buildCheap(T,coins,boardGenerated){
 const x=T._x,ratioNow=x.ratio_wclose,dp=T.depth_close,pk=T.peak.v;const t2=T.tf['1W'].TOTAL2ES,Sz=t2.S;
 const dd=(t2.last/x.t2_hi365-1)*100;const dist=Sz?(t2.last/Sz.hi-1)*100:null;
 const g=x.dom,domAtR=/AT RESISTANCE/.test(g.status);const nR=g.zones.filter(z=>z.role==='R'&&z.hi>=g.price).sort((a,b)=>a.lo-b.lo)[0];
 const f=(v,d)=>v.toFixed(d);
 const B=n=>f(n/1,1);
 const tests=[
  {k:'Ratio depth',rule:'Ratio 25% or more below its 2026 peak',now:`${f(dp,1)}% (peak ${f(pk,4)}, ${T.peak.t})`,ok:dp<=-25},
  {k:'TOTAL2ES drawdown',rule:'35% or more below its 1-year high',now:`${f(dd,1)}% (high ${Math.round(x.t2_hi365).toLocaleString('en-US')}B)`,ok:dd<=-35},
  {k:'TOTAL2ES at weekly support',rule:'Inside or within 1% of a 1W support zone',now:Sz?`Weekly support ${f(Sz.lo,1)}-${f(Sz.hi,1)}B, ${f(Math.abs(dist),1)}% ${dist>=0?'above':'below'} it`:'No weekly support zone',ok:!!(Sz&&dist<=1&&t2.last>=Sz.lo*0.99)},
  {k:'Fear high',rule:'Stablecoin dominance (USDT.D + USDC.D) at resistance',now:`${f(g.price,2)}%, ${domAtR&&nR?`at resistance ${f(nR.lo,2)}-${f(nR.hi,2)}%`:'not at resistance'}`,ok:domAtR},
  {k:'Oversold',rule:'Ratio 1D RSI under 30, or TOTAL2ES 1W RSI under 35',now:`Ratio 1D RSI ${f(x.ratio_rsi_1d,0)}, TOTAL2ES 1W RSI ${f(x.t2_rsi_1w,0)}`,ok:x.ratio_rsi_1d<30||x.t2_rsi_1w<35}];
 const stages=[['Buy 1 (30%)',-25],['Buy 2 (30%)',-33],['Buy 3 (40%)',-41]].map(([k,p])=>{const lv=pk*(1+p/100);return {k,pct:p,lv,from_now:(lv/ratioNow-1)*100,hit:ratioNow<=lv}});
 const cc=[],kn=[];
 for(const c of coins){if(c.kind==='gauge')continue;const rs=c.ind['1D'].rsi,d=c.d_from_hi;if(rs==null||rs>35||d>-40)continue;
  const atS=/AT SUPPORT/.test(c.status);const row={sym:c.sym,rsi:rs,dd:d,status:c.status.toLowerCase(),price:c.price};(atS?cc:kn).push(row)}
 return {tests,score:tests.filter(t=>t.ok).length,stages,coins:cc,knife:kn,ratio_now:ratioNow,board_generated:boardGenerated}}
const api={SYMS,compose,buildGauges,buildTiming,buildCheap};
if(typeof module!=='undefined')module.exports=api;else root.SR=api;
})(typeof window!=='undefined'?window:globalThis);
