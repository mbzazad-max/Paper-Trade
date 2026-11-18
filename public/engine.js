/* Zone engine - faithful JS port of zone_engine.py + zone_analyze.py (browser + node) */
(function(root){
'use strict';
const SPAN=(a,b)=>Math.min(a,b);
function ema(c,n){if(c.length<n)return null;const k=2/(n+1);let e=0;for(let i=0;i<n;i++)e+=c[i];e/=n;for(let i=n;i<c.length;i++)e=c[i]*k+e*(1-k);return e}
function rsi(c,n=14){if(c.length<n+2)return null;let g=0,l=0;for(let i=1;i<=n;i++){const d=c[i]-c[i-1];g+=Math.max(d,0);l+=Math.max(-d,0)}g/=n;l/=n;
 for(let i=n+1;i<c.length;i++){const d=c[i]-c[i-1];g=(g*(n-1)+Math.max(d,0))/n;l=(l*(n-1)+Math.max(-d,0))/n}return l===0?100:100-100/(1+g/l)}
function atr(B,n=14){const h=B.h,l=B.l,c=B.c;if(c.length<n+2)return null;const tr=[h[0]-l[0]];
 for(let i=1;i<c.length;i++)tr.push(Math.max(h[i]-l[i],Math.abs(h[i]-c[i-1]),Math.abs(l[i]-c[i-1])));
 let a=0;for(let i=1;i<=n;i++)a+=tr[i];a/=n;for(let i=n+1;i<tr.length;i++)a=(a*(n-1)+tr[i])/n;return a}
function macd(c){if(c.length<40)return null;const ser=n=>{const k=2/(n+1);let e=c[0];const o=[e];for(let i=1;i<c.length;i++){e=c[i]*k+e*(1-k);o.push(e)}return o};
 const a=ser(12),b=ser(26),m=a.map((x,i)=>x-b[i]);const k=2/10;let s=m[0];const S=[s];for(let i=1;i<m.length;i++){s=m[i]*k+s*(1-k);S.push(s)}
 const n=m.length;return [m[n-1],S[n-1],m[n-2],S[n-2]]}
function resample(B,keyf){const out={t:[],o:[],h:[],l:[],c:[],v:[]};let cur=null;
 for(let i=0;i<B.t.length;i++){const k=keyf(B.t[i]);if(cur!==k){cur=k;for(const kk of 'tohlcv')out[kk].push(B[kk][i])}
  else{const j=out.h.length-1;out.h[j]=Math.max(out.h[j],B.h[i]);out.l[j]=Math.min(out.l[j],B.l[i]);out.c[j]=B.c[i];out.v[j]+=B.v[i]}}return out}
const day=t=>Math.floor(t/86400), week=t=>Math.floor((t-345600)/604800);
function maxOf(a,s,e){let m=-Infinity;for(let i=s;i<e;i++)if(a[i]>m)m=a[i];return m}
function minOf(a,s,e){let m=Infinity;for(let i=s;i<e;i++)if(a[i]<m)m=a[i];return m}
function fmt(x){if(x===null||x===undefined)return '-';const ax=Math.abs(x);
 const fx=(d)=>x.toFixed(d);
 if(ax>=1000)return Math.round(x).toLocaleString('en-US');
 if(ax>=100)return fx(1);if(ax>=10)return fx(2);if(ax>=1)return fx(3);if(ax>=0.1)return fx(4);if(ax>=0.01)return fx(5);
 if(ax>=1e-4){return String(parseFloat(x.toPrecision(3)))}
 const s=x.toExponential(2).replace(/\.?0+e/,'e');return s.replace(/e([+-])(\d)$/,'e$10$2')}
function pivots(B,k){const h=B.h,l=B.l,n=h.length,ph=[],pl=[];
 for(let i=k;i<n-k;i++){if(h[i]===maxOf(h,i-k,i+k+1))ph.push([i,h[i]]);if(l[i]===minOf(l,i-k,i+k+1))pl.push([i,l[i]])}return [ph,pl]}
function cluster(vals,tol,span){span=span||3*tol;vals=vals.slice().sort((a,b)=>a-b);const cl=[];let cur=vals.length?[vals[0]]:[];
 for(let i=1;i<vals.length;i++){const v=vals[i];if(v-cur[cur.length-1]<=tol&&v-cur[0]<=span)cur.push(v);else{cl.push(cur);cur=[v]}}
 if(cur.length)cl.push(cur);return cl}
function fvg(lo,hi,a,tf,kind){if(hi-lo>0.8*a){const mid=(lo+hi)/2;return {lo:mid-0.3*a,hi:mid+0.3*a,m:'FVG',tf,lab:`${kind} FVG ${fmt(lo)}-${fmt(hi)} (50% level ${fmt(mid)})`}}
 return {lo,hi,m:'FVG',tf,lab:`${kind} FVG (${fmt(lo)}-${fmt(hi)})`}}
function events_tf(B,tf,a,cfg){const E=[],n=B.c.length,h=B.h,l=B.l,o=B.o,c=B.c,v=B.v;if(a===null||n<30)return E;
 const L=cfg.L,s0=Math.max(0,n-L);
 let [ph,pl]=pivots(B,cfg.k);ph=ph.filter(p=>p[0]>=s0);pl=pl.filter(p=>p[0]>=s0);
 for(const [kind,P] of [['high',ph],['low',pl]]){
  for(const cl of cluster(P.map(p=>p[1]),0.4*a,1.0*a)){
   if(cl.length>=2){const mn=Math.min(...cl),mx=Math.max(...cl);E.push({lo:mn,hi:mx,m:'SWING',tf,lab:`Equal ${kind}s x${cl.length} (${fmt(mn)}-${fmt(mx)})`})}
   else if(tf!=='4H')E.push({lo:cl[0]-0.12*a,hi:cl[0]+0.12*a,m:'SWING',tf,lab:`Swing ${kind} ${fmt(cl[0])}`})}}
 const allp=ph.map(p=>[p[1],'H']).concat(pl.map(p=>[p[1],'L']));allp.sort((x,y)=>x[0]-y[0]||(x[1]<y[1]?-1:x[1]>y[1]?1:0));
 let cur=[];
 const flush=cur=>{if(cur.length>=3&&cur.some(x=>x[1]==='H')&&cur.some(x=>x[1]==='L')){const mn=Math.min(...cur.map(x=>x[0])),mx=Math.max(...cur.map(x=>x[0]));
   E.push({lo:mn,hi:mx,m:'SHELF',tf,lab:`Breakout-retest shelf (${fmt(mn)}-${fmt(mx)}, highs+lows)`})}};
 for(const p of allp){if(cur.length&&p[0]-cur[cur.length-1][0]>0.5*a){flush(cur);cur=[]}cur.push(p)}flush(cur);
 // suffix min/max for OB/FVG tails
 const sufMinC=new Array(n+3).fill(1e99),sufMaxC=new Array(n+3).fill(-1e99),sufMinL=new Array(n+3).fill(1e99),sufMaxH=new Array(n+3).fill(-1e99);
 for(let i=n-1;i>=0;i--){sufMinC[i]=Math.min(sufMinC[i+1],c[i]);sufMaxC[i]=Math.max(sufMaxC[i+1],c[i]);sufMinL[i]=Math.min(sufMinL[i+1],l[i]);sufMaxH[i]=Math.max(sufMaxH[i+1],h[i])}
 for(let i=Math.max(s0+Math.floor(L/2),2);i<n-2;i++){
  if(c[i]<o[i]&&c[i+1]>h[i]&&(c[i+1]-o[i+1])>=1.5*a){
   if(sufMinC[i+2]>=l[i]){let lo=l[i],hi=h[i];if(hi-lo>1.5*a){lo=c[i];hi=o[i]}
    E.push({lo,hi,m:'OB',tf,lab:`Bullish order block (${fmt(lo)}-${fmt(hi)})`,side:'S'})}}
  if(c[i]>o[i]&&c[i+1]<l[i]&&(o[i+1]-c[i+1])>=1.5*a){
   if(sufMaxC[i+2]<=h[i]){let lo=l[i],hi=h[i];if(hi-lo>1.5*a){lo=o[i];hi=c[i]}
    E.push({lo,hi,m:'OB',tf,lab:`Bearish order block (${fmt(lo)}-${fmt(hi)})`,side:'R'})}}
  if(i>=1){
   if(l[i+1]>h[i-1]&&(l[i+1]-h[i-1])>=0.4*a){const glo=h[i-1],ghi=l[i+1],later=sufMinL[i+2];if(later>glo)E.push(fvg(glo,Math.min(ghi,later),a,tf,'Bullish'))}
   if(h[i+1]<l[i-1]&&(l[i-1]-h[i+1])>=0.4*a){const glo=h[i+1],ghi=l[i-1],later=sufMaxH[i+2];if(later<ghi)E.push(fvg(Math.max(glo,later),ghi,a,tf,'Bearish'))}}}
 for(const p of (tf==='4H'?[50,200]:[20,50,100,200])){const e=ema(c,p);if(e!==null)E.push({lo:e-0.1*a,hi:e+0.1*a,m:'EMA',tf,lab:`EMA${p} ${tf} ${fmt(e)}`})}
 const LF=cfg.LF;let s=Math.max(0,n-LF);const hh=maxOf(h,s,n),ll=minOf(l,s,n);const ih=h.indexOf(hh,s)-s,il=l.indexOf(ll,s)-s;
 if(tf!=='4H'&&hh-ll>3*a){for(const r of [0.382,0.5,0.618,0.786]){const px=il<ih?hh-r*(hh-ll):ll+r*(hh-ll);
   E.push({lo:px-0.12*a,hi:px+0.12*a,m:'FIB',tf,lab:`Fib ${r} of ${fmt(ll)}-${fmt(hh)} swing = ${fmt(px)}`})}}
 const LV=cfg.LV;s=Math.max(0,n-LV);const lo_=minOf(l,s,n),hi_=maxOf(h,s,n),nb=100;
 if(hi_>lo_){const bw=(hi_-lo_)/nb,vol=new Array(nb).fill(0);
  for(let i=s;i<n;i++){const b0=Math.max(0,Math.trunc((l[i]-lo_)/bw)),b1=Math.min(nb-1,Math.trunc((h[i]-lo_)/bw)),cnt=b1-b0+1;for(let b=b0;b<=b1;b++)vol[b]+=v[i]/cnt}
  const sm=[];for(let b=0;b<nb;b++)sm.push((vol[Math.max(0,b-1)]+vol[b]+vol[Math.min(nb-1,b+1)])/3);
  const mu=sm.reduce((x,y)=>x+y,0)/nb,sd=Math.sqrt(sm.reduce((x,y)=>x+(y-mu)*(y-mu),0)/nb);const pk=[];
  for(let b=1;b<nb-1;b++){let mx=-Infinity;for(let j=Math.max(0,b-3);j<Math.min(nb,b+4);j++)mx=Math.max(mx,sm[j]);
   if(sm[b]>=mu+0.9*sd&&sm[b]>=sm[b-1]&&sm[b]>=sm[b+1]&&sm[b]>=mx-1e-12)pk.push([sm[b],lo_+(b+0.5)*bw])}
  pk.sort((x,y)=>y[0]-x[0]||y[1]-x[1]);for(const [,px] of pk.slice(0,3))E.push({lo:px-0.3*a,hi:px+0.3*a,m:'HVN',tf,lab:`High-volume node ${fmt(px)}`})}
 return E}
function zones(E,aref,spot,rng=8,minc=3){const tol=0.35*aref;const ptsS=new Set();for(const e of E){ptsS.add((e.lo+e.hi)/2);ptsS.add(e.lo);ptsS.add(e.hi)}
 const pts=[...ptsS].sort((a,b)=>a-b);const limLo=spot-rng*aref,limHi=spot+rng*aref;let cand=[];
 for(const c0 of pts){if(c0<limLo||c0>limHi)continue;const wlo=c0-tol,whi=c0+tol;
  const mem=E.filter(e=>{const mid=(e.lo+e.hi)/2;return (wlo<=mid&&mid<=whi)||(Math.min(e.hi,whi)-Math.max(e.lo,wlo)>=0.5*Math.max(e.hi-e.lo,1e-12))});
  const ms=new Set(mem.map(e=>e.m));if(ms.size<minc)continue;
  const lo=Math.max(wlo,Math.min(...mem.map(e=>e.lo))),hi=Math.min(whi,Math.max(...mem.map(e=>e.hi)));if(hi<=lo)continue;
  cand.push({lo,hi,mem,ms,tfs:new Set(mem.map(e=>e.tf))})}
 cand.sort((x,y)=>(y.ms.size-x.ms.size)||(y.tfs.size-x.tfs.size)||((x.hi-x.lo)-(y.hi-y.lo)));
 const acc=[];for(const z of cand){let ok=true;for(const a of acc){const ov=Math.min(z.hi,a.hi)-Math.max(z.lo,a.lo);if(ov>0.1*Math.min(z.hi-z.lo,a.hi-a.lo)){ok=false;break}}if(ok)acc.push(z)}
 return acc}
function rank_sides(Z,spot,maxn=3){const mid=z=>(z.lo+z.hi)/2;let S=Z.filter(z=>mid(z)<spot),R=Z.filter(z=>mid(z)>=spot);
 const key=(a,b)=>(b.ms.size-a.ms.size)||(Math.abs(mid(a)-spot)-Math.abs(mid(b)-spot));
 S=S.slice().sort(key).slice(0,maxn);R=R.slice().sort(key).slice(0,maxn);S.sort((a,b)=>b.hi-a.hi);R.sort((a,b)=>a.lo-b.lo);return [S,R]}
const TFORD=['4H','1D','1W'];
function zout(z,spot,role){const pct=x=>(x/spot-1)*100;const meths=[],seen=new Set();
 const mem=z.mem.slice().sort((a,b)=>(a.m<b.m?-1:a.m>b.m?1:0)||(a.tf<b.tf?-1:a.tf>b.tf?1:0));
 for(const e of mem){const key=e.m+'|'+e.tf+'|'+e.lab;if(seen.has(key))continue;seen.add(key);meths.push({m:e.m,tf:e.tf,lab:e.lab})}
 const cnt={},keep=[];for(const x of meths){cnt[x.m]=(cnt[x.m]||0)+1;if(cnt[x.m]<=3)keep.push(x)}
 return {role,lo:z.lo,hi:z.hi,d_lo:pct(z.lo),d_hi:pct(z.hi),count:z.ms.size,methods:[...z.ms].sort(),tfs:[...z.tfs].sort((a,b)=>TFORD.indexOf(a)-TFORD.indexOf(b)),detail:keep,inside:z.lo<=spot&&spot<=z.hi}}
const CFG={'4H':{L:420,k:6,LF:540,LV:540},'1D':{L:365,k:7,LF:365,LV:365},'1W':{L:156,k:3,LF:156,LV:156}};
// ---------- plans ----------
function nearest(zs,role,spot){if(role==='S'){const c=zs.filter(z=>z.role==='S'&&z.lo<=spot);return c.length?c.reduce((a,b)=>b.hi>a.hi?b:a):null}
 const c=zs.filter(z=>z.role==='R'&&z.hi>=spot);return c.length?c.reduce((a,b)=>b.lo<a.lo?b:a):null}
function reasons(z,ind,macd1,side){const g={};for(const d of z.detail){(g[d.m]=g[d.m]||[]).push(`${d.lab} [${d.tf}]`)}
 const names={SWING:'S&R swing / equal highs-lows',SHELF:'S&R breakout-retest shelf',EMA:'EMA confluence',FIB:'Fib retracement',FVG:'FVG',OB:'Order block',HVN:'Volume node (HVN)'};
 const out=Object.keys(g).map(m=>({k:names[m],t:g[m].slice(0,3).join('; ')}));
 const r1=ind['1D'].rsi,r4=ind['4H'].rsi;let rs=`RSI(14) 1D ${r1.toFixed(0)}, 4H ${r4.toFixed(0)}`;
 if(side==='LONG')rs+=r1<35?' - oversold zone, bounce setup':r1<55?' - room to move':' - not oversold, needs a clean reaction';
 else rs+=r1>65?' - overbought, fade setup':r1>45?' - mid range':' - already weak, short has less room';
 out.push({k:'RSI',t:rs});
 if(macd1){let st=macd1.above?'MACD 1D line above signal':'MACD 1D line below signal';if(macd1.cross_up)st='MACD 1D just crossed up';if(macd1.cross_dn)st='MACD 1D just crossed down';out.push({k:'MACD',t:st})}
 return out}
function mk(side,z,e1,e2,sl,tg,ind,macd1,fut){const avg=0.4*e1+0.6*e2,risk=Math.abs(avg-sl),sg=side==='LONG'?1:-1;
 const t1=tg.length?tg[0]:null,t2=tg.length>1?tg[1]:null;
 const d={side,e1,e2,avg,sl,t1,t2,zone_lo:z.lo,zone_hi:z.hi,zone_count:z.count,zone_tfs:z.tfs,sl_pct:risk/avg*100,loss_at_sl_5x:risk/avg*500,ticker:fut,reasons:reasons(z,ind,macd1,side)};
 d.rr1=(t1===null||risk===0)?null:sg*(t1-avg)/risk;d.rr2=(t2===null||risk===0)?null:sg*(t2-avg)/risk;
 d.g1=t1===null?null:sg*(t1-avg)/avg*100;d.g2=t2===null?null:sg*(t2-avg)/avg*100;
 let tm=null;if(t1!==null&&t2!==null)tm=(t1+t2)/2;else if(t1!==null)tm=t1;
 d.blend=tm===null?null:sg*(tm-avg)/risk;d.valid=!!(d.blend!==null&&d.blend>=2);d.cap=tm===null?null:(tm+2*sl)/3;d.lev_ok=d.sl_pct<12;return d}
function fplans(zs,spot,ad,ind,macd1,fut){const out={};let z=nearest(zs,'S',spot);
 if(z){const sl=z.lo-0.75*ad;const tg=zs.filter(r=>r.role==='R'&&r.lo>Math.max(z.hi,spot)).map(r=>r.lo).sort((a,b)=>a-b).slice(0,2);out.long=mk('LONG',z,Math.min(z.hi,spot),z.lo,sl,tg,ind,macd1,fut)}
 z=nearest(zs,'R',spot);
 if(z){const sl=z.hi+0.75*ad;const tg=zs.filter(s=>s.role==='S'&&s.hi<Math.min(z.lo,spot)).map(s=>s.hi).sort((a,b)=>b-a).slice(0,2);out.short=mk('SHORT',z,Math.max(z.lo,spot),z.hi,sl,tg,ind,macd1,fut)}
 return out}
function g6(x){return String(parseFloat(x.toPrecision(6)))}
function spot_setup(watch,zs,tfz,spot,ad){const st={};
 for(const tf of TFORD){const S=tfz[tf].S.filter(z=>z.hi<=spot*1.01),R=tfz[tf].R.filter(z=>z.lo>=spot*0.99);
  let b=S.length?S.reduce((a,c)=>c.hi>a.hi?c:a):null,src='tf';if(!b){b=nearest(zs,'S',spot);src=b?'merged':null}
  let s_=R.length?R.reduce((a,c)=>c.lo<a.lo?c:a):null,ss='tf';if(!s_){s_=nearest(zs,'R',spot);ss=s_?'merged':null}
  const pk=(z,src)=>z?{lo:z.lo,hi:z.hi,count:z.count,methods:z.methods,src,weak:!!(tfz[tf].weak&&src==='tf')}:null;
  st[tf]={buy:pk(b,src),sell:pk(s_,ss)}}
 let mb=nearest(zs,'S',spot),weakb=false;if(!mb){const w=watch.filter(x=>x.role==='S');if(w.length){mb=w[0];weakb=true}}
 let b=null;if(mb)b={lo:mb.lo,hi:mb.hi,count:mb.count,methods:mb.methods,weak:weakb};else if(st['1D'].buy)b=st['1D'].buy;
 const out={zones:st,basis:b};
 if(b){const entry=(b.lo+b.hi)/2,stop=b.lo-1.0*ad;
  let R=zs.filter(r=>r.role==='R'&&r.lo>Math.max(entry,spot)).sort((a,c)=>a.lo-c.lo);
  if(!R.length&&st['1D'].sell)R=[{lo:st['1D'].sell.lo,hi:st['1D'].sell.hi}];
  const t1=R.length?R[0].lo:null,t2=R.length>1?R[1].lo:(R.length?R[0].hi:null),risk=entry-stop;
  Object.assign(out,{entry,stop,atr_mult:risk/ad,stop_pct:risk/entry*100,t1,t2,rr1:t1===null?null:(t1-entry)/risk,rr2:t2===null?null:(t2-entry)/risk,void:b.lo,void_txt:`Daily close below ${g6(b.lo)} (1D buy zone floor)`});
  const dist=(spot-b.hi)/ad;out.state=weakb?'WEAK ZONE (2 methods): ':'';
  out.state+=(b.lo<=spot&&spot<=b.hi)?'IN ZONE':((spot-b.hi)/spot>0&&(spot-b.hi)/spot<=0.01?'AT ZONE (<=1% above)':`${dist.toFixed(1)} ATR above zone`)}
 else out.state='NO BUY ZONE FOUND';return out}
// ---------- per asset ----------
function core(TF,spot,asof,sym,opts){
 const A={};for(const k of TFORD)A[k]=atr(TF[k]);const ad=A['1D'];let E=[];const EV={};
 for(const k of TFORD){const ev=events_tf(TF[k],k,A[k],CFG[k]);EV[k]=ev;E=E.concat(ev)}
 const near=z=>Math.abs((z.lo+z.hi)/2/spot-1)<=0.45;
 const Z=zones(E,ad,spot,9).filter(near);const [S,R]=rank_sides(Z,spot,3);
 const zs=S.map(z=>zout(z,spot,'S')).concat(R.map(z=>zout(z,spot,'R')));
 const watch=[];
 if(!S.length||!R.length){const Z2=zones(E,ad,spot,9,2).filter(near);
  for(const [role,cond] of [['S',!S.length],['R',!R.length]]){if(cond){const c=Z2.filter(z=>(((z.lo+z.hi)/2<spot)===(role==='S')));c.sort((a,b)=>Math.abs((a.lo+a.hi)/2-spot)-Math.abs((b.lo+b.hi)/2-spot));
    if(c.length){const w=zout(c[0],spot,role);w.watch=true;watch.push(w)}}}}
 let best=null;for(const z of zs){const sc=[z.count,z.tfs.length,-Math.min(Math.abs(z.d_lo),Math.abs(z.d_hi))];
  const gt=!best||sc[0]>best[0][0]||(sc[0]===best[0][0]&&(sc[1]>best[0][1]||(sc[1]===best[0][1]&&sc[2]>best[0][2])));if(gt)best=[sc,z]}
 if(best)best[1].strongest=true;
 [...zs].sort((a,b)=>(b.count-a.count)||(b.tfs.length-a.tfs.length)||(Math.min(Math.abs(a.d_lo),Math.abs(a.d_hi))-Math.min(Math.abs(b.d_lo),Math.abs(b.d_hi)))).forEach((z,i)=>z.rank=i+1);
 const ind={};for(const k of TFORD){const c=TF[k].c;ind[k]={rsi:rsi(c),atr:A[k],atr_pct:A[k]?A[k]/spot*100:null,ema:{'20':ema(c,20),'50':ema(c,50),'100':ema(c,100),'200':ema(c,200)},bars:c.length}}
 const mc=macd(TF['1D'].c);const macd1=mc?{macd:mc[0],signal:mc[1],cross_up:mc[2]<=mc[3]&&mc[0]>mc[1],cross_dn:mc[2]>=mc[3]&&mc[0]<mc[1],above:mc[0]>mc[1]}:null;
 const tfz={};for(const k of TFORD){let Zk=zones(EV[k],A[k],spot,8,3),weak=false;if(!Zk.length){Zk=zones(EV[k],A[k],spot,8,2);weak=true}
  const [Sk,Rk]=rank_sides(Zk,spot,2);tfz[k]={weak,S:Sk.map(z=>zout(z,spot,'S')),R:Rk.map(z=>zout(z,spot,'R'))}}
 const de=ind['1D'].ema,we=ind['1W'].ema;let sc=0;for(const p of ['50','200'])if(de[p])sc+=spot>de[p]?1:-1;if(we['20'])sc+=spot>we['20']?1:-1;if(macd1)sc+=macd1.above?1:-1;
 const bias=sc>=3?'Bullish':sc<=-3?'Bearish':'Neutral / range';
 const dc=TF['1D'].c,chg=n=>dc.length>n?(dc[dc.length-1]/dc[dc.length-1-n]-1)*100:null;
 const hi365=maxOf(TF['1D'].h,Math.max(0,dc.length-365),dc.length),lo365=minOf(TF['1D'].l,Math.max(0,dc.length-365),dc.length);
 const nS=nearest(zs,'S',spot),nR=nearest(zs,'R',spot);
 const atS=zs.some(z=>z.role==='S'&&z.inside)||!!(nS&&(spot-nS.hi)/spot<=0.01),atR=zs.some(z=>z.role==='R'&&z.inside)||!!(nR&&(nR.lo-spot)/spot<=0.01);
 const status=atS&&atR?'AT SUPPORT + RESISTANCE':atS?'AT SUPPORT':atR?'AT RESISTANCE':!nS?'NO QUALIFIED SUPPORT':!nR?'NO QUALIFIED RESISTANCE':'BETWEEN ZONES';
 const zt=z=>`${fmt(z.lo)} - ${fmt(z.hi)}`;let bull,bear;
 if(opts.gauge){bull=nR?`Daily close above ${fmt(nR.hi)} (top of resistance ${zt(nR)}, ${nR.count} methods) breaks the level.`:'No qualified resistance above.';
  bear=nS?`Daily close below ${fmt(nS.lo)} (floor of support ${zt(nS)}, ${nS.count} methods) breaks the level.`:'No qualified support below.'}
 else{
  if(nR){const n2=zs.filter(r=>r.role==='R').sort((a,b)=>a.lo-b.lo).filter(r=>r.lo>nR.hi);
   bull=`Daily close above ${fmt(nR.hi)} (top of resistance ${zt(nR)}, ${nR.count} methods) shifts control to buyers`+(n2.length?`; next resistance ${zt(n2[0])}.`:'; no qualified resistance above, so price is in discovery.')}
  else bull='No qualified resistance above: a hold above the current range is the bull case.';
  if(nS){const n2=zs.filter(r=>r.role==='S').sort((a,b)=>b.hi-a.hi).filter(r=>r.hi<nS.lo);
   bear=`Daily close below ${fmt(nS.lo)} (floor of support ${zt(nS)}, ${nS.count} methods) shifts control to sellers`+(n2.length?`; next support ${zt(n2[0])}.`:'; no qualified support below, so risk is open until a new base forms.')}
  else bear='No qualified support below: price is near range lows, so a new base must form first.'}
 const o={sym,price:spot,asof,atr_d:ad,atr_d_pct:ad/spot*100,ind,macd1d:macd1,bias,bias_score:sc,hi365,lo365,d_from_hi:(spot/hi365-1)*100,d_from_lo:(spot/lo365-1)*100,chg1d:chg(1),chg7d:chg(7),chg30d:chg(30),zones:zs,watch,status,bull,bear};
 return {o,zs,watch,tfz,ad,ind,macd1}}
// bars: {t,o,h,l,c,v} arrays. B1d may be null -> resampled from 4H
function buildCoin(sym,B4,Bd,spotSym,futSym){const B1=Bd||resample(B4,day),Bw=resample(B1,week),spot=B4.c[B4.c.length-1];
 const r=core({'4H':B4,'1D':B1,'1W':Bw},spot,B4.t[B4.t.length-1],sym,{});
 const pl=fplans(r.zs,spot,r.ad,r.ind,r.macd1,futSym||null),setup=spot_setup(r.watch,r.zs,r.tfz,spot,r.ad);
 return Object.assign(r.o,{spot_symbol:spotSym,fut_symbol:futSym||null,tf_zones:r.tfz,spot_setup:setup,futures:pl})}
function buildGauge(sym,tv,desc,B4){const Bd=resample(B4,day),Bw=resample(Bd,week),spot=B4.c[B4.c.length-1];
 const r=core({'4H':B4,'1D':Bd,'1W':Bw},spot,B4.t[B4.t.length-1],sym,{gauge:true});const o=r.o;
 const allz=o.zones.concat(o.watch);
 for(const z of allz){const same=allz.filter(y=>y.role===z.role).sort((a,b)=>a.lo-b.lo);
  if(z.role==='S'){const nx=same.filter(y=>y.hi<z.lo);const n=nx.length?nx[nx.length-1]:null;z.inv=z.lo;z.inv_txt=`Daily close below ${fmt(z.lo)}`;z.inv_next=n?`${fmt(n.lo)} - ${fmt(n.hi)}`:null}
  else{const nx=same.filter(y=>y.lo>z.hi);const n=nx.length?nx[0]:null;z.inv=z.hi;z.inv_txt=`Daily close above ${fmt(z.hi)}`;z.inv_next=n?`${fmt(n.lo)} - ${fmt(n.hi)}`:null}}
 return Object.assign(o,{kind:'gauge',desc,spot_symbol:tv,fut_symbol:null,spot_setup:null,futures:null,bars4h:B4.c.length})}
const api={ema,rsi,atr,macd,resample,day,week,fmt,events_tf,zones,rank_sides,zout,buildCoin,buildGauge,CFG};
if(typeof module!=='undefined')module.exports=api;else root.ZE=api;
})(typeof window!=='undefined'?window:globalThis);
