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
 assert.strictEqual(v.entry_rvol,2);assert.strictEqual(v.exit_rvol,1.5);
 assert(v.total_equity>=0&&v.initial_total===10000&&v.journal_count>=0);
}
console.log('MSS-RVOL isolated tests pass');
