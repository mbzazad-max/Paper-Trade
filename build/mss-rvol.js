/* MSS-RVOL paper-only, isolated from the two existing engines.
   Market-Data is read-only. Native 4H + complete 1H aggregation for 2H/3H.
   State is incremental to survive Market-Data's rolling hourly lookback. */
'use strict';
const fs=require('fs'),path=require('path');
const ROOT=path.resolve(__dirname,'..'), H=3600, H4=14400;
const cfg=require('../config/mss-rvol.json');
const stateFile=path.join(ROOT,'state/mss-rvol.json');
const journalFile=path.join(ROOT,'state/manual/mss-rvol.json');
const outputFile=path.join(ROOT,'public/mss-rvol.json');
const clock=()=>process.env.BUILD_NOW?+process.env.BUILD_NOW:Math.floor(Date.now()/1000);
const load=(f,backup)=>fs.existsSync(f)?JSON.parse(fs.readFileSync(f,'utf8')):backup;
function save(f,v){fs.mkdirSync(path.dirname(f),{recursive:true});let p=f+'.tmp';fs.writeFileSync(p,JSON.stringify(v,null,2)+'\n');fs.renameSync(p,f);}
function input(md,symbol,tf,now){
 const file=path.join(md,'data',symbol==='USDT.D'?'tv':'binance',(symbol==='USDT.D'?'CRYPTOCAP_USDT.D':symbol+'USDT')+'_'+tf+'.csv');
 const lines=fs.readFileSync(file,'utf8').trim().split(/\r?\n/);
 if(lines[0].trim()!=='time,open,high,low,close,volume')throw Error('Bad CSV columns: '+file);
 let a=[],prev=-1,seconds=tf==='4H'?H4:H;
 for(let i=1;i<lines.length;i++){let v=lines[i].split(',').map(Number);if(v.length<6||v.slice(0,6).some(x=>!Number.isFinite(x)))throw Error('Bad candle: '+file+' row '+i);
 let [t,o,h,l,c,vol]=v;if(t<=prev)throw Error('Nonascending candle time: '+file);prev=t;
 if(t+seconds<=now)a.push({t,o,h,l,c,v:vol,close_t:t+seconds});}
 if(a.length<80)throw Error('Insufficient '+tf+' candles for '+symbol);
 return a;
}
function aggregate(hourly,step){
 let groups=new Map(),result=[];
 for(let x of hourly){let t=Math.floor(x.t/(step*H))*step*H;
 if(!groups.has(t))groups.set(t,[]);groups.get(t).push(x);}
 for(let [t,g] of groups){if(g.length!==step||g[0].t!==t||g[step-1].t!==t+(step-1)*H)continue;
 result.push({t,close_t:t+step*H,o:g[0].o,h:Math.max(...g.map(x=>x.h)),l:Math.min(...g.map(x=>x.l)),c:g[step-1].c,v:g.reduce((a,x)=>a+x.v,0)});}
 return result.sort((a,b)=>a.t-b.t);
}
function indicators(bars,isFour){
 let sh=NaN,sl=NaN,trend=0,atr=NaN,old=NaN;
 for(let i=0;i<bars.length;i++){
  let x=bars[i];
  if(i>=14){let j=i-7,y=bars[j];if(bars.slice(j-7,j).every(z=>y.h>z.h)&&bars.slice(j+1,j+8).every(z=>y.h>z.h))sh=y.h;
   if(bars.slice(j-7,j).every(z=>y.l<z.l)&&bars.slice(j+1,j+8).every(z=>y.l<z.l))sl=y.l;}
  if(Number.isFinite(sh)&&x.c>sh)trend=1;else if(Number.isFinite(sl)&&x.c<sl)trend=-1;
  x.state=trend;
  if(isFour){x.rv=i>=20?x.v/(bars.slice(i-20,i).reduce((sum,z)=>sum+z.v,0)/20):null;
   let tr=Number.isFinite(old)?Math.max(x.h-x.l,Math.abs(x.h-old),Math.abs(x.l-old)):x.h-x.l;
   atr=i===0?tr:(atr*13+tr)/14;x.atr=i>=13?atr:null;old=x.c;
  }
 }return bars;
}
function cursor(bars){let i=-1;return function(t){while(i+1<bars.length&&bars[i+1].close_t<=t)i++;return i>=0?bars[i]:null;};}
function market(md,now){
 let out={};
 for(let sym of ['BTC','USDT.D',...cfg.coins]){
  let h=input(md,sym,'1H',now),four=input(md,sym,'4H',now);
  out[sym]={hour:h,p2:indicators(aggregate(h,2),false),p3:indicators(aggregate(h,3),false),p4:indicators(four,true),four};
 }return out;
}
function fresh(now,data){
 let coins={};for(let sym of cfg.coins){let a=data[sym].hour;coins[sym]={
  cash:cfg.initial_per_coin,qty:0,position:null,closed:[],realized:0,peak:cfg.initial_per_coin,dd:0,
  last_hour:a[a.length-1].t, manualBlock:false, last_close:null,price:a[a.length-1].c, updated:null
 };}
 return {version:1,created:new Date(now*1000).toISOString(),journal_count:0,coins};
}
const fix=x=>Math.round(x*1e8)/1e8;
function calc(p,price){
 let gross=p.qty*price*(1-cfg.fee_pct/100-cfg.slippage_pct/100);
 return gross-p.qty*p.entry*(1+cfg.fee_pct/100);
}
function sell(c,sym,fraction,rawPrice,reason,t,at){
 let p=c.position;if(!p||!(fraction>0&&fraction<=1))throw Error('No position');
 let amount=fix(c.qty*fraction);if(fraction===1)amount=c.qty;
 let fill=rawPrice*(1-cfg.slippage_pct/100), proceeds=amount*fill*(1-cfg.fee_pct/100);
 let cost=amount*p.entry*(1+cfg.fee_pct/100),pnl=proceeds-cost;
 c.cash+=proceeds;c.qty=fix(c.qty-amount);c.realized+=pnl;
 p.realized+=pnl;p.parts.push({t,price:fix(fill),qty:fix(amount),pnl:fix(pnl),reason,at:at||null});
 if(c.qty<1e-10){c.qty=0;p.exit_t=t;p.exit_price=fill;p.outcome=p.realized>=0?'WIN':'LOSS';p.reason=reason;
  c.closed.push(p);if(c.closed.length>250)c.closed.shift();c.position=null;
 }
 return pnl;
}
function simulate(md,prior,journal,now){
 let data=market(md,now),st=prior?JSON.parse(JSON.stringify(prior)):fresh(now,data);
 if(!prior)return {state:st,market:data,fresh:true};
 if(!Array.isArray(journal)||journal.length<st.journal_count)throw Error('Manual journal shrank');
 for(let sym of cfg.coins){
  let c=st.coins[sym],row=data[sym],hrs=row.hour.filter(x=>x.t>c.last_hour),p2=cursor(row.p2),p3=cursor(row.p3),p4=cursor(row.p4);
  let btc2=cursor(data.BTC.p2),btc3=cursor(data.BTC.p3),btc4=cursor(data.BTC.p4);
  let us2=cursor(data['USDT.D'].p2),us3=cursor(data['USDT.D'].p3),us4=cursor(data['USDT.D'].p4);
  // NB cursors must be consumed in time order for each coin.
  for(let x of hrs){
   if(c.last_hour!=null && x.t-c.last_hour>H)throw Error('1H gap for '+sym+' at '+x.t+'; refusing backfill');
   let s2=p2(x.t),s3=p3(x.t),s4=p4(x.t),b2=btc2(x.t),b3=btc3(x.t),b4=btc4(x.t),u2=us2(x.t),u3=us3(x.t),u4=us4(x.t);
   let aligned=!!(s2&&s3&&s4&&b2&&b3&&b4&&u2&&u3&&u4&&
    [s2,s3,s4,b2,b3,b4].every(z=>z.state===1)&&[u2,u3,u4].every(z=>z.state===-1));
   let qualified=aligned&&Number.isFinite(s4.atr)&&s4.atr>0&&Number.isFinite(s4.rv)&&s4.rv>=cfg.entry_rvol;
   if(!qualified)c.manualBlock=false;
   let active=c.position;
   if(active){
    let exited=false;
    if(s4&&s4.state===-1&&s4.c<s4.o&&s4.rv>=cfg.exit_rvol){
     sell(c,sym,1,x.o,'Bearish 4H MSS + RVOL',x.t);exited=true;
    }else if(x.l<=active.stop){
     sell(c,sym,1,Math.min(x.o,active.stop),'ATR stop',x.t);exited=true;
    }
    if(!exited&&c.position){
     active.highest=Math.max(active.highest,x.h);
     if(s4&&Number.isFinite(s4.atr))active.stop=Math.max(active.stop,active.highest-4*s4.atr);
    }
   }else if(qualified&&!c.manualBlock){
    let buy=x.o*(1+cfg.slippage_pct/100),stop=buy-3*s4.atr;
    if(stop>0&&c.cash>0){
     let investment=c.cash,qty=investment/(buy*(1+cfg.fee_pct/100));
     c.cash=0;c.qty=qty;c.position={id:sym+'-'+x.t,entry_t:x.t,entry:buy,initial_atr:s4.atr,
      initial_stop:stop,stop,highest:x.o,entry_rvol:s4.rv,entry_cash:investment,qty,
      parts:[],realized:0};
     if(x.l<=stop)sell(c,sym,1,Math.min(x.o,stop),'ATR stop on entry hour',x.t);
     else{c.position.highest=Math.max(c.position.highest,x.h);c.position.stop=Math.max(stop,c.position.highest-4*s4.atr);}
    }
   }
   c.last_hour=x.t;c.price=x.c;c.updated=x.close_t;
   let equity=c.cash+c.qty*x.c*(1-cfg.fee_pct/100-cfg.slippage_pct/100);
   c.peak=Math.max(c.peak,equity);c.dd=Math.min(c.dd,100*(equity/c.peak-1));
  }
  let lastFour=row.four[row.four.length-1];c.last_close=lastFour.close_t;
  c.price=row.hour[row.hour.length-1].c;
 }
 // Apply owner events after all newly available hourly bars have been processed.
 for(let i=st.journal_count;i<journal.length;i++){
  let a=journal[i],c=st.coins[a.sym];
  if(!c||!c.position||c.position.id!==a.trade_id)throw Error('Journal action no longer matches open trade: '+a.nonce);
  if(a.t<c.position.entry_t)throw Error('Manual fill precedes entry: '+a.nonce);
  sell(c,a.sym,a.kind==='close'?1:a.percent/100,a.px,a.kind==='close'?'Manual close':'Manual profit booking',a.t,a.at);
  if(a.kind==='close')c.manualBlock=true;
  st.journal_count=i+1;
 }
 return {state:st,market:data,fresh:false};
}
function summary(st,data,now){
 let lines=[],total=0;
 for(let sym of cfg.coins){
  let c=st.coins[sym],p=c.position;
  let unreal=p?calc({qty:c.qty,entry:p.entry},c.price):0;
  let equity=c.cash+c.qty*c.price*(1-cfg.fee_pct/100-cfg.slippage_pct/100);
  let wins=c.closed.filter(t=>t.realized>0),losses=c.closed.filter(t=>t.realized<0);
  let pf=losses.length?fix(wins.reduce((s,t)=>s+t.realized,0)/-losses.reduce((s,t)=>s+t.realized,0)):null;
  total+=equity;
  let f4=data[sym].four.at(-1);
  lines.push({sym,equity:fix(equity),return_pct:fix((equity/cfg.initial_per_coin-1)*100),
   realized:fix(c.realized),unrealized:fix(unreal),price:c.price,last_close:c.last_close,
   last_hour:c.last_hour,refresh_at:c.updated,rv_4h:fix(f4.rv||0),state_4h:f4.state,manual_block:c.manualBlock,
   open:p?{id:p.id,entry:p.entry,entry_t:p.entry_t,stop:fix(p.stop),qty:fix(c.qty),entry_rvol:fix(p.entry_rvol),
       left_pct:fix(100*c.qty/p.qty),pnl:fix(unreal),parts:p.parts}:null,
   closed:c.closed.length,wins:wins.length,win_rate:c.closed.length?fix(100*wins.length/c.closed.length):null,
   profit_factor:pf,max_dd:fix(c.dd),history:c.closed.slice(-25).map(t=>({
     id:t.id,entry:t.entry,entry_t:t.entry_t,exit_t:t.exit_t,exit_price:t.exit_price,pnl:fix(t.realized),
     reason:t.reason,parts:t.parts}))});
 }
 lines.sort((a,b)=>b.return_pct-a.return_pct);
 return {version:1,started:true,generated:new Date(now*1000).toISOString(),source:'mbzazad-max/market-data',
  method:'9-way confirmed Swing-7; native 4H + 2H/3H aggregated from 1H',entry_rvol:cfg.entry_rvol,
  exit_rvol:cfg.exit_rvol,fee_pct:cfg.fee_pct,slippage_pct:cfg.slippage_pct,
  initial_per_coin:cfg.initial_per_coin,initial_total:cfg.initial_per_coin*cfg.coins.length,
  journal_count:st.journal_count,coins:lines,total_equity:fix(total),
  total_return_pct:fix(100*(total/(cfg.initial_per_coin*cfg.coins.length)-1)),
  total_pnl:fix(total-cfg.initial_per_coin*cfg.coins.length),
  note:'Paper only; decisions use Market-Data saved candles. 2H/3H coverage is limited by rolling 1H history. A new sleeve waits for future confirmed signals.'};
}
function recordManualAction(md,p){
 if(!['close','book'].includes(p.kind)||!cfg.coins.includes(p.sym)||!Number.isInteger(p.journal_count)||
 !Number.isInteger(p.last_close)||typeof p.trade_id!=='string'||!(/^[A-Za-z0-9]{16,64}$/.test(p.nonce||'')))throw Error('Invalid MSS-RVOL action');
 if(p.kind==='book'&&!(Number.isInteger(p.percent)&&p.percent>=1&&p.percent<=99))throw Error('Invalid booking percent');
 let prior=load(stateFile,null),journal=load(journalFile,[]);if(!prior)throw Error('MSS-RVOL not started yet');
 if(journal.some(a=>a.nonce===p.nonce))return;
 if(journal.length!==p.journal_count)throw Error('Journal changed, refresh the tab');
 const now=clock(),test=simulate(md,prior,journal,now),c=test.state.coins[p.sym],last=test.market[p.sym].four.at(-1);
 if(!c.position||c.position.id!==p.trade_id)throw Error('Position no longer open; refresh');
 if(last.close_t!==p.last_close)throw Error('A 4H candle changed; refresh');
 if(c.position.entry_t>last.close_t)throw Error('Wait for next closed 4H candle before manually closing this new trade');
 const px=last.c;
 if(p.kind==='book'){
  let buy=c.position.entry*(1+cfg.fee_pct/100),exit=px*(1-(cfg.slippage_pct+cfg.fee_pct)/100);
  if(!(exit>buy))throw Error('Profit booking only allowed above fees and slippage');
 }
 let a={nonce:p.nonce,kind:p.kind,percent:p.kind==='close'?100:p.percent,sym:p.sym,
  trade_id:p.trade_id,t:last.close_t,px,at:now};
 // Validate journal application with a fresh calculation before persisting.
 simulate(md,prior,journal.concat(a),now);
 save(journalFile,journal.concat(a));
 console.log('MSS-RVOL owner action accepted, pending journal replay: '+p.sym+' '+p.kind);
}
function main(){
 let md=path.resolve(process.argv[2]||'../market-data'),now=clock(),prior=load(stateFile,null),journal=load(journalFile,[]);
 let result=simulate(md,prior,journal,now);
 let report=summary(result.state,result.market,now);
 if(result.fresh)report.note+=' Fresh start; no historical trades imported.';
 save(stateFile,result.state);save(outputFile,report);
 console.log('MSS-RVOL: '+report.coins.length+' sleeves, '+report.coins.filter(x=>x.open).length+' open, $'+report.total_pnl+' P&L');
}
if(require.main===module){try{main()}catch(e){console.error('::error::MSS-RVOL: '+(e.message||e));process.exit(1)}}
module.exports={aggregate,indicators,simulate,summary,recordManualAction};
