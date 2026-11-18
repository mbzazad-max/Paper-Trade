/* Manual Close all / Book N% overlay for the two Top 20 P&L ledgers (zone only, zone + MSS).
 * Taken from Paper-Test (build/zone-manual.js). The unchanged public/pnl.js still gives the baseline; with no manual
 * actions this overlay must give the same result (parity()). Owner actions apply at a closed 4H candle close, after
 * that candle's own stop / target fills. Long only (spot). Each mode has its own trade IDs and journal entries. */
'use strict';
const PNL=require('../public/pnl.js');
const H4=PNL.H4;
function tradeId(mode,sym,pos){
 return mode+':'+sym+':'+pos.snapT+':'+pos.entryT;
}
function simCoin(sym,snaps,B,R,events,mode){
 if(!['zone','mss'].includes(mode))throw Error('Unknown zone ledger mode');
 const S=(snaps||[]).slice().sort((a,b)=>a.t-b.t),T=[],eq=[];
 const eventFor=new Map();
 for(const e of events){
  if(e.mode!==mode||e.sym!==sym)continue;
  if(!eventFor.has(e.t))eventFor.set(e.t,[]);
  eventFor.get(e.t).push(e);
 }
 let pos=null,lastExit=-Infinity,realized=0;const fee=R.fee/100,applied=[],manual_log=[];
 const cur=t=>{
  let s=null;
  for(const x of S){if(x.t>t)break;if(x.t>lastExit)s=x}
  return s;
 };
 const fin=(t,why)=>{
  let g=0,fe=pos.size*fee;
  for(const L of pos.legs){g+=L.q*(L.px-pos.px);fe+=L.q*L.px*fee}
  pos.pnl=g-fe;pos.ret=pos.pnl/pos.size*100;pos.exitT=t;pos.out=why;
  pos.exitPx=pos.legs.reduce((a,L)=>a+L.q*L.px,0)/pos.qty;
  pos.res=pos.pnl>0?'W':pos.pnl<0?'L':'BE';
  realized+=pos.pnl;T.push(pos);lastExit=t;pos=null;
 };
 const close=(px,t,why)=>{
  pos.legs.push({px,q:pos.qty*pos.left,t,why});pos.left=0;fin(t,why);
 };
 const n=B?.t?.length||0;
 for(let i=0;i<n;i++){
  const t=B.t[i],o=B.o[i],h=B.h[i],l=B.l[i],c=B.c[i],closed=t+H4;
  if(t<R.start||t>=R.end)continue;
  let fresh=false;
  if(!pos){
   const s=cur(t);
   if(PNL.okSnap(s,{})&&l<=s.entry){
    const px=Math.min(s.entry,o);
    pos={sym,snapT:s.t,entryT:t,px,lim:s.entry,stop:s.stop,cs:s.stop,
     t1:s.t1,t2:s.t2,rr2:s.rr2,lo:s.lo,hi:s.hi,size:R.size,
     qty:R.size/px,left:1,half:false,legs:[]};
    pos.id=tradeId(mode,sym,pos);fresh=true;
   }
  }
  if(pos){
   // Preserve source stop-FIRST and automatic T1/T2, including gap price.
   if(l<=pos.cs)close(Math.min(pos.cs,o),t,pos.half?'stop at breakeven after T1':'stop');
   else if(!fresh||o<=pos.px){
    if(!pos.half&&pos.t1!=null&&h>=pos.t1){
     // A previous manual booking may have reduced the remaining position.
     const q=Math.min(pos.qty*0.5,pos.qty*pos.left);
     if(q>0){pos.legs.push({px:pos.t1,q,t,why:'T1'});pos.left=Math.max(0,pos.left-q/pos.qty)}
     pos.half=true;pos.cs=pos.px;
     if(pos.t2!=null&&h>=pos.t2)close(pos.t2,t,'T1 + T2');
     else if(pos.left<=1e-9)fin(t,'T1');
    }else if(pos.half&&pos.t2!=null&&h>=pos.t2)close(pos.t2,t,'T1 + T2');
   }
  }
  // A manual action at the close of this candle cannot overrule a stop or
  // target already hit inside the candle. An event is never backfilled.
  for(const e of eventFor.get(closed)||[]){
   if(!pos||e.trade_id!==pos.id)throw Error('Zone manual action stale or trade closed: '+e.nonce);
   if(!['close','book'].includes(e.kind))throw Error('Unknown zone manual action '+e.kind);
   const p=e.kind==='close'?100:e.percent;
   if(e.kind==='book'&&(!Number.isInteger(p)||p<1||p>99))throw Error('Invalid partial-book percentage');
   const q=pos.qty*pos.left*(p/100);
   if(!(q>0))throw Error('No remaining position for '+e.nonce);
   const net=q*(c-pos.px)-q*c*fee-q*pos.px*fee;
   if(e.kind==='book'&&net<=0)throw Error('Profit booking requires a positive NET gain on remaining shares');
   pos.legs.push({px:c,q,t:closed,why:e.kind==='close'?'manual_close':'profit_booking'});
   pos.left=Math.max(0,pos.left-q/pos.qty);
   manual_log.push({sym,mode,trade_id:pos.id,nonce:e.nonce,action:e.kind==='close'?'manual_close':'profit_booking',
    t:closed,px:c,usd:net,remaining_pct:100*pos.left});
   applied.push(e.nonce);
   if(pos.left<1e-9){pos.left=0;fin(closed,e.kind==='close'?'manual_close':'profit_booking')}
  }
  // Equity point: original source formula (realised + marked remaining shares).
  let open=0;
  if(pos){
   let g=0;
   for(const L of pos.legs)g+=L.q*(L.px-pos.px);
   g+=pos.qty*pos.left*(c-pos.px);
   open=g-pos.size*fee;
  }
  eq.push([t,realized+open]);
 }
 let openPos=null;
 if(pos){
  const px=n?B.c[n-1]:pos.px;
  let g=0;
  for(const L of pos.legs)g+=L.q*(L.px-pos.px);
  g+=pos.qty*pos.left*(px-pos.px);
  const fe=pos.size*fee+pos.qty*pos.left*px*fee;
  pos.mark=px;pos.pnl=g-fe;pos.ret=pos.pnl/pos.size*100;
  openPos=pos;
 }
 const last=n?B.t[n-1]:null,s=cur(last===null?Infinity:last+H4);
 const pending=!openPos&&PNL.okSnap(s,{})?s:null;
 let bh=null;const i0=n?B.t.findIndex(t=>t>=R.start):-1;
 if(i0>=0)bh=(B.c[n-1]/B.o[i0]-1)*100;
 const lastClose=n?B.t[n-1]+H4:null,lastPrice=n?B.c[n-1]:null;
 for(const e of events.filter(e=>e.mode===mode&&e.sym===sym))
  if(!applied.includes(e.nonce))throw Error('Unapplied zone event '+e.nonce);
 return {sym,trades:T,open:openPos,pending,latest:S[S.length-1]||null,
  eq,realized,bh,bars:n,last,last_close:lastClose,last_price:lastPrice,
  applied,manual_log};
}
function run(st,events,mode){
 if(!Array.isArray(events))throw Error('Manual zone events must be array');
 const R=st.cfg,out={coins:[],cfg:R},f={};
 for(const sym of R.cohort)out.coins.push(simCoin(sym,(st.snaps[sym]||{}).snaps,st.bars[sym],R,events,mode));
 const all=[].concat(...out.coins.map(c=>c.trades)),W=all.filter(x=>x.res==='W'),L=all.filter(x=>x.res==='L');
 const gw=W.reduce((a,x)=>a+x.pnl,0),gl=-L.reduce((a,x)=>a+x.pnl,0),
   openP=out.coins.reduce((a,c)=>a+(c.open?c.open.pnl:0),0);
 const ts=[...new Set([].concat(...out.coins.map(c=>c.eq.map(p=>p[0]))))].sort((a,b)=>a-b);
 const curve=ts.map(t=>{
  let v=0;
  for(const c of out.coins){let last=0;for(const p of c.eq){if(p[0]>t)break;last=p[1]}v+=last}
  return [t,v];
 });
 let pk=0,dd=0;for(const [,v] of curve){if(v>pk)pk=v;if(v-pk<dd)dd=v-pk}
 const cap=R.size*R.cohort.length,bhs=out.coins.filter(c=>c.bh!=null);
 out.sum={closed:all.length,wins:W.length,losses:L.length,be:all.length-W.length-L.length,
  winRate:all.length?W.length/all.length*100:null,realized:gw-gl,openPnl:openP,
  net:gw-gl+openP,netPct:(gw-gl+openP)/cap*100,cap,
  avgW:W.length?gw/W.length:null,avgL:L.length?-gl/L.length:null,
  pf:gl>0?gw/gl:(gw>0?Infinity:null),maxDD:dd,ddPct:dd/cap*100,
  open:out.coins.filter(c=>c.open).length,pending:out.coins.filter(c=>c.pending).length,
  bh:bhs.length?bhs.reduce((a,c)=>a+c.bh,0)/bhs.length:null,curve,all};
 return out;
}
function parity(original,overlay,mode){
 const close=(a,b)=>Math.abs(a-b)<0.00001;
 if(!close(original.sum.net,overlay.sum.net)||
    !close(original.sum.realized,overlay.sum.realized)||
    original.sum.open!==overlay.sum.open||original.sum.closed!==overlay.sum.closed||
    original.sum.pending!==overlay.sum.pending)
  throw Error(mode+' source/overlay P&L parity mismatch with zero events');
 original.coins.forEach((c,i)=>{
  const v=overlay.coins[i];
  if(!close(c.realized,v.realized)||
     !!c.open!==!!v.open||
     (!!c.open&&!close(c.open.pnl,v.open.pnl))||
     c.trades.length!==v.trades.length)
   throw Error(mode+' per-coin source/overlay parity mismatch '+c.sym);
 });
}
module.exports={tradeId,simCoin,run,parity};
