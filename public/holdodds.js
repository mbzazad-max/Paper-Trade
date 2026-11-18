/* Hold odds: tap history and hold/fail outcomes for 1D and 1W zones (browser + node). Uses the zone engine (engine.js). */
(function(root){
'use strict';
const Z=(typeof require!=='undefined'&&typeof module!=='undefined')?require('./engine.js'):root.ZE;
const {atr,resample,day,week,events_tf,zones,rank_sides,CFG}=Z;
const P={'1D':{W:20,LB:365,keep:600},'1W':{W:12,LB:156,keep:300}};
const slice=(B,s,e)=>{const o={};for(const k of 'tohlcv')o[k]=B[k].slice(s,e);return o};
/* zones of one timeframe from bars B[0..i] (inclusive) */
function zonesAt(B,i,tf,maxn){const s=Math.max(0,i+1-P[tf].keep),S=slice(B,s,i+1);if(S.c.length<60)return null;
 const a=atr(S);if(!a)return null;const spot=S.c[S.c.length-1];
 const ev=events_tf(S,tf,a,CFG[tf]);let zz=zones(ev,a,spot,8,3);if(!zz.length)return {a,spot,S:[],R:[]};
 const [Sx,Rx]=rank_sides(zz,spot,maxn||9);
 const pk=(z,role)=>({role,lo:z.lo,hi:z.hi,count:z.ms.size,methods:[...z.ms].sort()});
 return {a,spot,S:Sx.filter(z=>z.hi<spot).map(z=>pk(z,'S')),R:Rx.filter(z=>z.lo>spot).map(z=>pk(z,'R'))}}
/* outcome of a tap at bar i: H held, F failed, N no result inside the window */
function outcome(B,i,z,a,W){const n=B.c.length,S=z.role==='S';let best=0;
 for(let j=i;j<n&&j<=i+W;j++){
  const fail=S?B.c[j]<=z.lo-a:B.c[j]>=z.hi+a;if(fail)return {r:'F',k:j-i,mx:best};
  const mv=S?(B.h[j]/z.hi-1)*100:(1-B.l[j]/z.lo)*100;if(j>i&&mv>best)best=mv;
  const held=j>i&&(S?B.h[j]>=z.hi+a:B.l[j]<=z.lo-a);if(held){for(let q=j+1;q<n&&q<=i+W;q++){const m=S?(B.h[q]/z.hi-1)*100:(1-B.l[q]/z.lo)*100;if(m>best)best=m}return {r:'H',k:j-i,mx:best}}}
 return {r:(i+W<n?'N':'O'),k:null,mx:best}}  /* O = still open (window not finished) */
/* tap episodes: price must first be 1 ATR away from the zone, then trade into it */
function episodes(B,z,a,s,e){const out=[],S=z.role==='S';let armed=false;
 for(let j=Math.max(0,s);j<=e&&j<B.c.length;j++){
  if(armed&&(S?B.l[j]<=z.hi:B.h[j]>=z.lo)){out.push(j);armed=false;continue}
  if(S?B.c[j]>=z.hi+a:B.c[j]<=z.lo-a)armed=true}
 return out}
const grpS=c=>c>=6?'6+':c>=4?'4-5':'3';
const grpT=n=>n>=3?'3+':String(n);
function key(tf,role,tap,cnt){return tf+'|'+role+'|'+grpT(tap)+'|'+grpS(cnt)}
/* pooled lookup with fallbacks when a cell is thin */
function lookup(pool,tf,role,tap,cnt){if(!pool)return null;const t=grpT(tap),s=grpS(cnt);
 const tries=[[tf,role,t,s],[tf,role,t,'all'],[tf,role,'all',s],[tf,role,'all','all']];
 for(const [a,b,c,d] of tries){const g=pool[a+'|'+b+'|'+c+'|'+d];if(g&&g.n>=20)return Object.assign({k:a+'|'+b+'|'+c+'|'+d},g)}return null}
/* current zones of a coin with their tap history, from daily bars (completed bars only) */
function current(Bd,pool){const out={asof:Bd.t[Bd.t.length-1],tf:{}};
 const Bw=resample(Bd,week);const T={'1D':Bd,'1W':Bw};
 for(const tf of ['1D','1W']){const B=T[tf],i=B.c.length-1;const r=zonesAt(B,i,tf,3);if(!r){out.tf[tf]=null;continue}
  const zs=r.S.concat(r.R).map(z=>{const ep=episodes(B,z,r.a,i-P[tf].LB,i);
   const taps=ep.map((j,n)=>{const o=outcome(B,j,z,r.a,P[tf].W);return {t:B.t[j],n:n+1,r:o.r,k:o.k,mx:Math.round(o.mx*10)/10}});
   const next=taps.length+1,g=lookup(pool,tf,z.role,next,z.count);
   const res=taps.filter(x=>x.r==='H'||x.r==='F'),own=res.length?res.filter(x=>x.r==='H').length/res.length*100:null;
   return Object.assign(z,{d:(z.role==='S'?z.hi:z.lo)/r.spot*100-100,taps,next,own,ownN:res.length,odds:g})});
  out.tf[tf]={a:r.a,spot:r.spot,zones:zs}}
 return out}
const api={P,zonesAt,outcome,episodes,key,grpS,grpT,lookup,current};
if(typeof module!=='undefined')module.exports=api;else root.HO=api;
})(typeof window!=='undefined'?window:globalThis);
