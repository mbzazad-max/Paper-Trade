'use strict';
const assert=require('assert'),fs=require('fs'),m=require('../build/mss-rvol');
const bars=[0,1,2,3].map(t=>({t:t*3600,o:t+1,h:t+2,l:t,c:t+1.5,v:10}));
assert.deepStrictEqual(m.aggregate(bars,2).map(x=>x.t),[0,7200]);
let s=m.indicators(Array.from({length:22},(_,i)=>({t:i*14400,close_t:(i+1)*14400,o:1,h:2,l:.5,c:1,v:i===21?80:10})),true);
assert(Math.abs(s[21].rv-8)<1e-8,'RVOL excludes signal bar');
const file='public/mss-rvol.json';
if(fs.existsSync(file)){
 let v=JSON.parse(fs.readFileSync(file));
 assert.deepStrictEqual(v.coins.map(x=>x.sym).sort(),['DOGE','ENA','ETH','SOL','ZEC']);
 assert.strictEqual(v.entry_rvol,2);if(v.shared_wallet)assert.strictEqual(v.exit_rvol,null);
 assert(v.total_equity>=0&&v.initial_total===10000&&v.journal_count>=0);
}
const varying=m.indicators(Array.from({length:15},(_,i)=>({t:i*14400,close_t:(i+1)*14400,o:100,h:100+i+1,l:100,c:100,v:10})),true);
assert.strictEqual(varying[12].atr,null);
assert.strictEqual(varying[13].atr,7.5);
assert(Math.abs(varying[14].atr-(7.5*13+15)/14)<1e-10);
const cfg=require('../config/mss-rvol.json');
const loss=(p,sl,q)=>q*(p*1.001-sl*.9995*.999);
let q1=m.positionSize(1600,1440,10000,10000,cfg),q2=m.positionSize(72,64.8,10000,10000,cfg);
assert(q1>0&&q2>0);
assert(Math.abs(loss(1600,1440,q1)-50)<1e-8);
assert(Math.abs(loss(72,64.8,q2)-50)<1e-8);
assert.strictEqual(m.positionSize(1600,1599,10000,10000,cfg),0);
const next=m.cursor([{close_t:100,state:1},{close_t:200,state:-1}]);assert.strictEqual(next(99),null);assert.strictEqual(next(199).state,1);assert.strictEqual(next(200).state,-1);
// Synthetic chronological portfolio: identical risk across concurrent positions.
{
 const t=360000, coins=cfg.coins;
 function data(hours,mode=1,rv=2.5){
  const d={};for(const sym of ['BTC','USDT.D',...coins]){
   const state=sym==='USDT.D'?-1:coins.includes(sym)?mode:1;
   const b={state,atr:4,rv,close_t:t,o:100,c:101};
   d[sym]={hour:hours.map(([time,o,h,l,c])=>({t:time,close_t:time+3600,o,h,l,c})),p2:[b],p3:[b],p4:[b],four:[b]};
  }return d;
 }
 const prior={version:1,journal_count:0,coins:Object.fromEntries(coins.map(k=>[k,{cash:2000,qty:0,position:null,closed:[],realized:0,peak:2000,dd:0,last_hour:t-3600,manualBlock:false,price:100}]))};
 const a=m.simulateData(data([[t,100,105,99,102]]),prior,[],t+3600).state;
 for(const k of coins){const p=a.coins[k].position;assert(p);assert(Math.abs(loss(p.entry,p.initial_stop,p.qty)-50)<1e-8);}
 assert(coins.reduce((s,k)=>s+a.coins[k].cash,0)>0);
 const b=m.simulateData(data([[t+3600,102,103,100,101]],-1,0.2),a,[],t+7200).state;
 for(const k of coins)assert.strictEqual(b.coins[k].closed.at(-1).reason,'Bearish 4H MSS');
 const held=m.simulateData(data([[t,100,105,99,102]]),a,[{sym:'ETH',kind:'hold',trade_id:a.coins.ETH.position.id,t:t+3600}],t+3600).state;
 const c=m.simulateData(data([[t+3600,102,103,50,60]],-1),held,[{sym:'ETH',kind:'hold',trade_id:a.coins.ETH.position.id,t:t+3600}],t+7200).state;
 assert(c.coins.ETH.position&&c.coins.ETH.position.hold);
 assert(coins.slice(1).every(k=>!c.coins[k].position));
 const j=[{sym:'ETH',kind:'hold',trade_id:a.coins.ETH.position.id,t:t+3600},{sym:'ETH',kind:'release',trade_id:a.coins.ETH.position.id,t:t+7200}];
 const released=m.simulateData(data([[t+3600,102,103,50,60]],-1),c,j,t+7200).state;
 assert.strictEqual(released.coins.ETH.position.hold,false);
 const closed=m.simulateData(data([[t+7200,60,61,59,60]],-1),released,j,t+10800).state;
 assert.strictEqual(closed.coins.ETH.position,null);
}
console.log('MSS-RVOL isolated tests pass');
