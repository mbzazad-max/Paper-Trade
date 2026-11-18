/* Shared one-click refresh helpers (Breakout Radar pattern): sequential TradingView OHLCV pulls with a gap, retry, quota pause. */
(function(root){
'use strict';
const SERVERS=['Trading View','Trading_View'];let SERVER=null,MCP=null;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const GAP_MS=(typeof root.RF_GAP_MS==="number")?root.RF_GAP_MS:1500;
const MSG={needs_reauth:'Reconnect TradingView in claude.ai Settings, Connectors.',server_not_connected:'Add the TradingView connector in claude.ai Settings, Connectors.',approval_required:'Approval is needed. Press the button again and allow it.',not_in_manifest:'Access to TradingView was not allowed for this page.',selection_required:'Choose which TradingView connector to use, then try again.'};
async function init(){try{if(!root.claude||!root.claude.use)return null;MCP=await root.claude.use('mcp')}catch(e){MCP=null}return MCP}
async function fetchBars(sym,interval,count){let last=null;
 for(let i=0;i<SERVERS.length;i++){const name=SERVER||SERVERS[i];
  try{const res=await MCP.callTool(name,'mcp-tv-get-ohlcv',{symbol:sym,interval,count,format:'columns'},{cache:false});SERVER=name;
   let p=res.payload;if(typeof p==='string'){try{p=JSON.parse(p)}catch(e){}}
   if(!p||p.success===false||!p.bars||!Array.isArray(p.bars.t)||p.bars.t.length<30)throw {code:'tool_error',message:(p&&(p.error||p.message))||'TradingView returned no bars'};
   const b=p.bars;return {t:b.t,o:b.o,h:b.h,l:b.l,c:b.c,v:b.v}}
  catch(e){last=e;if(!SERVER&&(e.code==='server_not_connected'||e.code==='not_in_manifest'||e.code==='server_not_found')&&i<SERVERS.length-1)continue;break}}
 throw last}
const isQuota=e=>/quota|suspend|suspicion|too many|rate/i.test(String(e&&e.message))||(e&&e.code==='rate_limited');
/* jobs: [{id,sym,interval,count}] -> {ok:{id:bars}, failed:{id:err}, stopped:string|null} */
async function runJobs(jobs,onProg,shouldStop){const ok={},failed={};let stopped=null;
 for(let i=0;i<jobs.length;i++){const j=jobs[i];if(shouldStop&&shouldStop()){stopped='Stopped.';break}
  onProg&&onProg(i,jobs.length,j);
  try{ok[j.id]=await fetchBars(j.sym,j.interval,j.count)}
  catch(e){
   if(e&&e.code==='server_unavailable'&&e.retryable){await sleep(2500+Math.random()*1500);try{ok[j.id]=await fetchBars(j.sym,j.interval,j.count);e=null}catch(e2){e=e2}}
   if(e){failed[j.id]=e;
    if(MSG[e.code]){stopped=MSG[e.code];break}
    if(isQuota(e)){stopped='TradingView paused the requests (quota). Wait a few minutes and press "Fetch missing" to continue.';break}}}
  if(i<jobs.length-1)await sleep(GAP_MS)}
 onProg&&onProg(jobs.length,jobs.length,null);return {ok,failed,stopped}}
const safeId=s=>String(s).replace(/[^A-Za-z0-9]+/g,'_');
const api={init,fetchBars,runJobs,safeId,sleep,MSG,get MCP(){return MCP}};
root.RF=api;
})(typeof window!=='undefined'?window:globalThis);
