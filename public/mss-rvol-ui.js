/* Display-only MSS-RVOL tab. State and actions belong to the GitHub build. */
(function(){
 'use strict';
 var doc=null,owner=false;
 function esc(x){return String(x==null?'—':x).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
 function money(v){return typeof v==='number'?'$'+v.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2}):'—'}
 function pct(v){return typeof v==='number'?(v>=0?'+':'')+v.toFixed(2)+'%':'—'}
 function dt(v){return v?new Date(v*1000).toLocaleString():'—'}
 function render(d,isOwner){
  doc=d;owner=!!isOwner;
  if(!d)return '<div class="card"><h2>MSS-RVOL</h2><p class="note">No build snapshot yet. GitHub must run the new MSS-RVOL builder first.</p></div>';
  var h='<div class="card"><div class="row"><div class="grow"><h2 style="margin:0">MSS-RVOL · 5-asset paper portfolio</h2><p class="note">Spot LONG only · 2H/3H/4H MSS · buy RVOL ≥ '+esc(d.entry_rvol)+' · bearish 4H MSS or ATR stop (unless owner HOLD)</p></div><span class="pill acc">Independent '+money(d.initial_per_coin)+' per coin</span></div>';
  h+='<div class="kv"><div><b>Virtual capital</b><span>'+money(d.initial_total)+'</span></div><div><b>Current value</b><span>'+money(d.total_equity)+'</span></div><div><b>Portfolio P&amp;L</b><span class="'+(d.total_pnl>=0?'up':'down')+'">'+money(d.total_pnl)+'</span></div><div><b>Return</b><span>'+pct(d.total_return_pct)+'</span></div></div>';
  h+='<p class="note" style="margin:10px 0 0">Built '+esc(d.generated)+' UTC · Source: '+esc(d.source)+' · Auto entries only on confirmed signals; no forced buys. 2H/3H reconstructed from rolling saved 1H candles.</p></div>';
  h+='<div class="card"><h2>Which asset is performing best?</h2><div class="scroll"><table><thead><tr><th>Rank</th><th>Coin</th><th>Status</th><th class="r">Return</th><th class="r">Balance</th><th class="r">Net P&amp;L</th><th class="r">Realized</th><th class="r">Open P&amp;L</th><th class="r">Win rate</th><th class="r">Max DD</th><th class="r">RVOL 4H</th></tr></thead><tbody>';
  (d.coins||[]).forEach(function(c,i){
    h+='<tr><td>'+ (i+1)+'</td><td><b>'+esc(c.sym)+'</b></td><td>'+(c.open?(c.open.hold?'LONG · HOLD':'LONG OPEN'):'WAITING')+'</td><td class="r num '+(c.return_pct>=0?'up':'down')+'">'+pct(c.return_pct)+'</td><td class="r num">'+money(c.equity)+'</td><td class="r num">'+money(c.equity-d.initial_per_coin)+'</td><td class="r num">'+money(c.realized)+'</td><td class="r num">'+money(c.unrealized)+'</td><td class="r num">'+(c.win_rate==null?'—':c.win_rate.toFixed(1)+'%')+'</td><td class="r num">'+pct(c.max_dd)+'</td><td class="r num">'+(c.rv_4h||0).toFixed(2)+'×</td></tr>';
  });
  h+='</tbody></table></div></div>';
  h+='<div class="card"><h2>Open positions · manual Close / Book profit / HOLD</h2><p class="note">Owner-only. Book % is allowed only when the position is profitable after fees and slippage. Close and Book fill at the last verified closed 4H price. HOLD disables both automatic exits after the action is confirmed; Release resumes them on subsequent processed candles.</p>';
  var opened=(d.coins||[]).filter(function(c){return !!c.open});
  if(!opened.length)h+='<p class="note">No open positions. Monitoring ETH, SOL, ENA, DOGE and ZEC for the next qualified entry.</p>';
  else{
   h+='<div class="scroll"><table><thead><tr><th>Coin</th><th class="r">Entry</th><th class="r">Last price</th><th class="r">ATR stop</th><th class="r">Unrealized</th><th>Last 4H close</th>'+(owner?'<th>Owner controls</th>':'')+'</tr></thead><tbody>';
   opened.forEach(function(c){
    var eligible=c.open.entry_t<=c.last_close,positive=c.last_4h_price*(1-(doc.fee_pct+doc.slippage_pct)/100)>c.open.entry*(1+doc.fee_pct/100);
    h+='<tr><td><b>'+esc(c.sym)+'</b></td><td class="r num">'+money(c.open.entry)+'</td><td class="r num">'+money(c.price)+'</td><td class="r num">'+money(c.open.stop)+'</td><td class="r num">'+money(c.open.pnl)+'</td><td class="num">'+dt(c.last_close)+'</td>';
    if(owner)h+='<td><button class="chip" data-mrv-action="'+(c.open.hold?'release':'hold')+'" data-mrv-sym="'+c.sym+'">'+(c.open.hold?'Release HOLD':'HOLD')+'</button> <button class="chip sell" data-mrv-action="close" data-mrv-sym="'+c.sym+'" '+(eligible?'':'disabled title="Wait until next closed 4H candle"')+'>Close all</button> <input class="search" style="width:63px" type="number" min="1" max="99" value="50" data-mrv-percent="'+c.sym+'"> <button class="chip book" data-mrv-action="book" data-mrv-sym="'+c.sym+'" '+(positive&&eligible?'':'disabled title="Needs net profit and closed 4H candle"')+'>Book %</button></td>';
    h+='</tr>';
   });h+='</tbody></table></div>';
  }
  h+='</div><div class="card"><h2>Recent closed trades</h2>';
  var trades=[];(d.coins||[]).forEach(function(c){(c.history||[]).forEach(function(t){trades.push(Object.assign({sym:c.sym},t))})});trades.sort(function(a,b){return b.exit_t-a.exit_t});
  if(!trades.length)h+='<p class="note">No closed MSS-RVOL trades yet.</p>';else{
   h+='<div class="scroll"><table><thead><tr><th>Coin</th><th>Opened</th><th>Closed</th><th>Reason</th><th class="r">Realized P&amp;L</th></tr></thead><tbody>';
   trades.slice(0,60).forEach(function(t){h+='<tr><td>'+esc(t.sym)+'</td><td>'+dt(t.entry_t)+'</td><td>'+dt(t.exit_t)+'</td><td>'+esc(t.reason)+'</td><td class="r num">'+money(t.pnl)+'</td></tr>'});h+='</tbody></table></div>';
  }h+='</div>';
  return h;
 }
 function nonce(){var a=new Uint8Array(16);crypto.getRandomValues(a);return Array.from(a,function(x){return ('0'+x.toString(16)).slice(-2)}).join('')}
 document.addEventListener('click',function(e){
  var b=e.target.closest('[data-mrv-action]');if(!b||!owner||!doc)return;
  var sym=b.getAttribute('data-mrv-sym'),kind=b.getAttribute('data-mrv-action'),c=(doc.coins||[]).find(function(z){return z.sym===sym});
  if(!c||!c.open)return;
  var input=document.querySelector('[data-mrv-percent="'+sym+'"]'),n=kind==='book'?Number(input&&input.value):100;
  if(kind==='book'&&(!Number.isInteger(n)||n<1||n>99)){alert('Choose 1–99% of remaining position');return}
  if(!confirm(kind==='hold'?'HOLD '+sym+'? Both automatic exits are disabled until release.':kind==='release'?'Release HOLD for '+sym+'? Automatic exits resume on future processed candles.':(kind==='close'?'Close all of ':'Book '+n+'% of ')+sym+' at the last verified 4H close '+money(c.last_4h_price)+'? Paper only.'))return;
  var slug=location.pathname.split('/')[1]||'',api=slug?'/api/'+slug+'/':'api/';
  var req={tab:'mss-rvol',sym:sym,kind:kind,percent:n,nonce:nonce(),trade_id:c.open.id,journal_count:doc.journal_count,last_close:c.last_close};
  b.disabled=true;
  fetch(api+'action',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify(req)})
   .then(function(r){return r.json().then(function(x){if(!r.ok)throw Error(x.error||'HTTP '+r.status);alert('Request queued for GitHub verification. Reload after build completes; this is not yet a confirmed fill.')})})
   .catch(function(err){b.disabled=false;alert('Not submitted: '+err.message)});
 });
 window.MssRvolView={render:render};
})();
