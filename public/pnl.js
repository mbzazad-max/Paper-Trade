/* Top 20 P&L paper test: replays the board's spot-setup advice (snapshots saved at each refresh) against 4H bars (browser + node). */
(function(root){
'use strict';
const H4=14400;
/* one advice snapshot from a coin's spot_setup at time t (unix s) */
function snap(t,ss){if(!ss||ss.entry==null)return {t,none:true,state:ss?ss.state:'NO DATA'};
 return {t,entry:ss.entry,stop:ss.stop,t1:ss.t1,t2:ss.t2,rr1:ss.rr1,rr2:ss.rr2,lo:ss.basis?ss.basis.lo:null,hi:ss.basis?ss.basis.hi:null,state:ss.state}}
/* merge closed 4H bars (only bars at or after start, and fully closed by nowS) into stored compact bars */
function mergeBars(old,B,start,nowS){const m=new Map();const put=(t,o,h,l,c)=>m.set(t,[o,h,l,c]);
 if(old&&old.t)old.t.forEach((t,i)=>put(t,old.o[i],old.h[i],old.l[i],old.c[i]));
 if(B&&B.t)B.t.forEach((t,i)=>{if(t>=start&&t+H4<=nowS)put(t,B.o[i],B.h[i],B.l[i],B.c[i])});
 const ts=[...m.keys()].sort((a,b)=>a-b),o={t:ts,o:[],h:[],l:[],c:[]};ts.forEach(t=>{const r=m.get(t);o.o.push(r[0]);o.h.push(r[1]);o.l.push(r[2]);o.c.push(r[3])});return o}
const okSnap=(s,f)=>!!(s&&!s.none&&s.entry!=null&&s.stop!=null&&s.stop<s.entry&&(f.minRR1==null||(s.rr1!=null&&s.rr1>=f.minRR1))&&(f.minRR==null||(s.rr2!=null&&s.rr2>=f.minRR)));
/* simulate one coin. R: {start,end,size,fee(% per side)}. f: filter {minRR}. mark: live price for open position (optional) */
function simCoin(sym,snaps,B,R,f,mark){
 const S=(snaps||[]).slice().sort((a,b)=>a.t-b.t),T=[],eq=[];let pos=null,lastExit=-Infinity,realized=0;
 const fee=R.fee/100;
 const cur=t=>{let s=null;for(const x of S){if(x.t>t)break;if(x.t>lastExit)s=x}return s};
 const close=(px,t,why)=>{const q=pos.qty*pos.left;pos.legs.push({px,q,t,why});pos.left=0;fin(t,why)};
 const fin=(t,why)=>{let g=0,fe=pos.size*fee;for(const L of pos.legs){g+=L.q*(L.px-pos.px);fe+=L.q*L.px*fee}
  pos.pnl=g-fe;pos.ret=pos.pnl/pos.size*100;pos.exitT=t;pos.out=why;pos.exitPx=pos.legs.reduce((a,L)=>a+L.q*L.px,0)/pos.qty;
  pos.res=pos.pnl>0?'W':pos.pnl<0?'L':'BE';realized+=pos.pnl;T.push(pos);lastExit=t;pos=null};
 const n=B&&B.t?B.t.length:0;
 for(let i=0;i<n;i++){const t=B.t[i],o=B.o[i],h=B.h[i],l=B.l[i],c=B.c[i];if(t<R.start||t>=R.end)continue;
  let fresh=false;
  if(!pos){const s=cur(t);
   if(okSnap(s,f)&&l<=s.entry){const px=Math.min(s.entry,o);
    pos={sym,snapT:s.t,entryT:t,px,lim:s.entry,stop:s.stop,cs:s.stop,t1:s.t1,t2:s.t2,rr2:s.rr2,lo:s.lo,hi:s.hi,size:R.size,qty:R.size/px,left:1,half:false,legs:[]};fresh=true}}
  if(pos){
   if(l<=pos.cs){close(Math.min(pos.cs,o),t,pos.half?'stop at breakeven after T1':'stop')}
   else if(!fresh||o<=pos.px){
    if(!pos.half&&pos.t1!=null&&h>=pos.t1){const q=pos.qty*0.5;pos.legs.push({px:pos.t1,q,t,why:'T1'});pos.left=0.5;pos.half=true;pos.cs=pos.px;
     if(pos.t2!=null&&h>=pos.t2)close(pos.t2,t,'T1 + T2')}
    else if(pos.half&&pos.t2!=null&&h>=pos.t2)close(pos.t2,t,'T1 + T2')}}
  /* equity point: realized + open mark at this bar's close */
  let open=0;if(pos){let g=0;for(const L of pos.legs)g+=L.q*(L.px-pos.px);g+=pos.qty*pos.left*(c-pos.px);open=g-pos.size*fee}
  eq.push([t,realized+open])}
 let openPos=null;
 if(pos){const px=mark!=null?mark:(n?B.c[n-1]:pos.px);let g=0;for(const L of pos.legs)g+=L.q*(L.px-pos.px);g+=pos.qty*pos.left*(px-pos.px);
  const fe=pos.size*fee+pos.qty*pos.left*px*fee;pos.mark=px;pos.pnl=g-fe;pos.ret=pos.pnl/pos.size*100;openPos=pos}
 const last=n?B.t[n-1]:null,s=cur(last==null?Infinity:last+H4);
 let pending=null;if(!openPos&&okSnap(s,f))pending=s;
 /* buy & hold benchmark from the first bar after start */
 let bh=null;const i0=n?B.t.findIndex(t=>t>=R.start):-1;if(i0>=0){const p0=B.o[i0],p1=mark!=null?mark:B.c[n-1];bh=(p1/p0-1)*100}
 return {sym,trades:T,open:openPos,pending,latest:S.length?S[S.length-1]:null,eq,realized,bh,bars:n,last}}
function run(st,f,marks){const R=st.cfg,out={coins:[],cfg:R};marks=marks||{};
 for(const sym of R.cohort)out.coins.push(simCoin(sym,(st.snaps[sym]||{}).snaps,st.bars[sym],R,f||{},marks[sym]));
 const all=[].concat(...out.coins.map(c=>c.trades)),W=all.filter(x=>x.res==='W'),L=all.filter(x=>x.res==='L');
 const gw=W.reduce((a,x)=>a+x.pnl,0),gl=-L.reduce((a,x)=>a+x.pnl,0),openP=out.coins.reduce((a,c)=>a+(c.open?c.open.pnl:0),0);
 /* portfolio equity: sum of coin curves on a shared time axis (carry last value forward) */
 const ts=[...new Set([].concat(...out.coins.map(c=>c.eq.map(p=>p[0]))))].sort((a,b)=>a-b);
 const curve=ts.map(t=>{let v=0;for(const c of out.coins){let last=0;for(const p of c.eq){if(p[0]>t)break;last=p[1]}v+=last}return [t,v]});
 let pk=0,dd=0;for(const [,v] of curve){if(v>pk)pk=v;if(v-pk<dd)dd=v-pk}
 const cap=R.size*R.cohort.length,bhs=out.coins.filter(c=>c.bh!=null);
 out.sum={closed:all.length,wins:W.length,losses:L.length,be:all.length-W.length-L.length,winRate:all.length?W.length/all.length*100:null,
  realized:gw-gl,openPnl:openP,net:gw-gl+openP,netPct:(gw-gl+openP)/cap*100,cap,avgW:W.length?gw/W.length:null,avgL:L.length?-gl/L.length:null,
  pf:gl>0?gw/gl:(gw>0?Infinity:null),maxDD:dd,ddPct:dd/cap*100,open:out.coins.filter(c=>c.open).length,pending:out.coins.filter(c=>c.pending).length,
  bh:bhs.length?bhs.reduce((a,c)=>a+c.bh,0)/bhs.length:null,curve,all};
 return out}
const api={H4,snap,mergeBars,simCoin,run,okSnap};
if(typeof module!=='undefined')module.exports=api;else root.PNL=api;
})(typeof window!=='undefined'?window:globalThis);
