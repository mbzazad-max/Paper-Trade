/* 04 · RSI Signal Desk tab. Display only: the signal logic is the original claude.ai Signal Desk engine
   (signal-desk-engine.js, byte-identical, checked on every build) and the page code below is the original page's
   own code, moved into a tab. Changes from the original page, all on purpose:
   - candles come from signal-desk.json (Market-Data, Binance spot, closed candles, built on GitHub) instead of the
     viewer's TradingView connector, so the TradingView Refresh button and its auto-refresh are gone (Paper-Trade's
     own Refresh rebuilds it);
   - BTC only (owner, 25 Nov 2026): no asset switch; ETH is loaded only for BTC's ETH <-> BTC link and ETH check line,
     now Binance ETHUSDT instead of Coinbase ETHUSD (the code can still show ETH, SOL or BNB if they are added to ASSETS);
   - four class names are prefixed sd- so the board's stylesheet does not restyle them. */
(function(){
'use strict';
var DATA=null, ALL={}, ASSET='BTC', ALT='ETH', RES={}, TAB='4H', SYM={}, ASSETS=['BTC'], PEERS=['ETH'], SRC=null, loading=null;
var KEY='paper-trade.sd.';
try{var asv=localStorage.getItem(KEY+'asset');if(ASSETS.indexOf(asv)>=0)ASSET=asv;}catch(e){}
try{var tsv=localStorage.getItem(KEY+'tab');if(tsv==='1D'||tsv==='4H')TAB=tsv;}catch(e){}
var $=function(id){return document.getElementById(id)};
var fmtP=function(x){return x==null?'–':x.toLocaleString(undefined,{maximumFractionDigits:0})};
var pct=function(x,d){return (x>=0?'+':'')+(x*100).toFixed(d==null?1:d)+'%'};
var cls=function(x){return x>0?'pos':x<0?'neg':''};
function dstr(t,tf){var d=new Date(t*1000);var o={day:'2-digit',month:'short',year:'2-digit'};if(tf==='4H'){o.hour='2-digit';o.minute='2-digit';o.hour12=false}return d.toLocaleString(undefined,o)}
function esc(s){return String(s).replace(/[&<>"]/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]})}

function compute(){
  var now=Date.now()/1000;
  ['4H','1D'].forEach(function(tf){
    var R=SIG.run(DATA[tf],tf,now);
    if(tf==='1D'){var cut=Date.UTC(2021,0,1)/1000;R.trades=R.trades.filter(function(t){return t.et>=cut});}
    RES[tf]=R;
  });
}

function panel(tf){
  var R=RES[tf],s=R.state,b=DATA[tf],el=$('p'+tf);
  var pill,cl,head;
  if(s.signalNow==='BUY'){pill='Buy signal';cl='p-buy';head='Buy on this close at <b class="num">'+fmtP(s.lastClose)+'</b>.'}
  else if(s.signalNow==='SELL'){var lt=R.trades[R.trades.length-1];pill=lt.why==='Stop'?'Stop hit':lt.why==='Target'?'Target hit':'Sell signal';cl='p-sell';
    head=(lt.why==='Target'?'Target reached at ':lt.why==='Stop'?'Stop: sell on this close at ':'Sell on this close at ')+'<b class="num">'+fmtP(lt.x)+'</b> ('+pct(lt.pnl)+' on the trade).'}
  else if(s.open){pill='Holding';cl='p-hold';head='In a trade since '+dstr(s.open.et,tf)+' at <b class="num">'+fmtP(s.open.e)+'</b>. Now <b class="num '+cls(s.open.pnl)+'">'+pct(s.open.pnl)+'</b>. '+
    (s.open.target?'Sell at <b class="num">'+fmtP(s.open.target)+'</b> (0.236 fib), or on a daily close below <b class="num">'+fmtP(s.open.stop)+'</b>.':'Wait for RSI to close above 70.')}
  else {pill='No trade';cl='p-wait';head='Flat. Waiting for a buy setup.'}
  var need='';
  if(!s.open&&s.signalNow!=='BUY'){
    if(tf==='4H'){
      need=s.swing.valid?'Next buy needs a 4H close with RSI below 30 while price sits between <b class="num">'+fmtP(s.fibBand[0])+'</b> and <b class="num">'+fmtP(s.fibBand[1])+'</b> (0.786–0.5 of the swing '+fmtP(s.swing.low)+' → '+fmtP(s.swing.high)+').'
        :'No valid 30-day swing right now (the move is under 8% or price is below the swing low), so the 4H plan stays out even if RSI drops below 30.';
    } else {
      need='Next buy needs a daily close with RSI below 30 while price is above the EMA 200 at <b class="num">'+fmtP(s.ema)+'</b>'+(s.lastClose>s.ema?' (it is above now).':' (it is below now, so no buy).')+
        (s.swing.valid?' If it buys now, the target would be about <b class="num">'+fmtP(s.nextTarget)+'</b> and the stop a close below <b class="num">'+fmtP(s.nextStop)+'</b>.':'');
    }
  } else if(s.open||s.signalNow==='BUY'){
    if(tf==='4H') need='Sell when a 4H candle closes with RSI above 70. No stop-loss on 4H; the worst dip inside a past trade is in the history below.';
    else { var o=s.open; var tg=o?o.target:s.nextTarget, sp=o?o.stop:s.nextStop;
      need='Place a limit sell at <b class="num">'+fmtP(tg)+'</b> ('+(o?pct(tg/o.e-1):'')+' from entry). Exit if a daily candle closes below <b class="num">'+fmtP(sp)+'</b>'+(o?' ('+pct(sp/o.e-1)+'). That stop is wide, so size the trade for it.':'.'); } }
  var r=s.rsi, rl=s.rsiLive;
  el.innerHTML=
    '<div class="ph"><div class="tf">'+(tf==='4H'?'4 hour':'Daily')+'<small>last close '+dstr(s.lastClosedT,tf)+'</small></div><span class="sd-pill '+cl+'">'+pill+'</span></div>'+
    '<div class="headline">'+head+'</div>'+
    '<div><div class="gauge" aria-label="RSI '+r.toFixed(1)+'"><div class="g-track"></div>'+
      '<div class="g-lab" style="left:30%">30</div><div class="g-lab" style="left:70%">70</div>'+
      '<div class="g-mark" style="left:'+Math.min(99,Math.max(1,r))+'%"></div></div></div>'+
    '<dl class="sd-kv">'+
      '<div><dt>RSI(7) closed</dt><dd>'+r.toFixed(1)+'</dd></div>'+
      '<div><dt>RSI(7) forming</dt><dd>'+(rl==null?'–':rl.toFixed(1))+'</dd></div>'+
      '<div><dt>'+ASSET+' now</dt><dd>'+fmtP(s.livePrice)+'</dd></div>'+
      (tf==='4H'?'<div><dt>Fib buy zone</dt><dd>'+(s.swing.valid?fmtP(s.fibBand[0])+'–'+fmtP(s.fibBand[1]):'no swing')+'</dd></div>'
               :'<div><dt>EMA 200</dt><dd>'+fmtP(s.ema)+'</dd></div>')+
    '</dl>'+
    '<canvas id="c'+tf+'" role="img" aria-label="Recent '+tf+' closes with buy and sell markers"></canvas>'+
    '<div class="need">'+need+btcCheck(tf)+'</div>';
  draw(tf);
}

function css(v){return getComputedStyle(document.documentElement).getPropertyValue(v).trim()}
function draw(tf){
  var cv=$('c'+tf);if(!cv)return;var R=RES[tf],b=DATA[tf];
  var W=cv.clientWidth,H=150,dpr=window.devicePixelRatio||1;cv.width=W*dpr;cv.height=H*dpr;
  var x=cv.getContext('2d');x.scale(dpr,dpr);
  var n=b.c.length,from=Math.max(0,n-(tf==='4H'?180:240));
  var lo=Infinity,hi=-Infinity;for(var i=from;i<n;i++){lo=Math.min(lo,b.l[i]);hi=Math.max(hi,b.h[i]);}
  var s=R.state;if(tf==='1D'){for(i=from;i<n;i++){lo=Math.min(lo,R.ema[i]);hi=Math.max(hi,R.ema[i]);}if(s.open&&s.open.target){hi=Math.max(hi,s.open.target);}}
  var pad=(hi-lo)*0.06;lo-=pad;hi+=pad;
  var L=4,Rr=W-46,T=6,B=H-16;
  var X=function(i){return L+(i-from)/(n-1-from)*(Rr-L)},Y=function(v){return B-(v-lo)/(hi-lo)*(B-T)};
  x.font='10px '+css('--f-num');x.fillStyle=css('--muted');x.strokeStyle=css('--line');x.lineWidth=1;
  for(var k=0;k<=3;k++){var v=lo+(hi-lo)*k/3,yy=Y(v);x.beginPath();x.moveTo(L,yy);x.lineTo(Rr,yy);x.stroke();x.fillText(hi<20000?Math.round(v).toLocaleString():Math.round(v/100)/10+'k',Rr+4,yy+3);}
  if(tf==='4H'&&s.swing.valid){x.fillStyle=css('--band');var y1=Y(s.fibBand[1]),y0=Y(s.fibBand[0]);x.fillRect(L,y1,Rr-L,y0-y1);}
  if(tf==='1D'&&s.open&&s.open.target){[[s.open.target,'--buy','target'],[s.open.stop,'--sell','stop']].forEach(function(a){if(a[0]<lo||a[0]>hi)return;var yy=Y(a[0]);x.strokeStyle=css(a[1]);x.setLineDash([2,3]);x.beginPath();x.moveTo(L,yy);x.lineTo(Rr,yy);x.stroke();x.setLineDash([]);x.fillStyle=css(a[1]);x.fillText(a[2],L+2,yy-3);});}
  if(tf==='1D'){x.strokeStyle=css('--emaLine');x.setLineDash([4,3]);x.beginPath();for(i=from;i<n;i++){i===from?x.moveTo(X(i),Y(R.ema[i])):x.lineTo(X(i),Y(R.ema[i]))}x.stroke();x.setLineDash([]);}
  x.strokeStyle=css('--ink');x.lineWidth=1.4;x.beginPath();for(i=from;i<n;i++){i===from?x.moveTo(X(i),Y(b.c[i])):x.lineTo(X(i),Y(b.c[i]))}x.stroke();
  R.events.forEach(function(e){if(e.i<from)return;var px=X(e.i),py=Y(b.c[e.i]),buy=e.type==='BUY';
    x.fillStyle=css(buy?'--buy':'--sell');x.beginPath();
    if(buy){x.moveTo(px,py+4);x.lineTo(px-5,py+12);x.lineTo(px+5,py+12);}else{x.moveTo(px,py-4);x.lineTo(px-5,py-12);x.lineTo(px+5,py-12);}
    x.closePath();x.fill();});
  x.fillStyle=css('--accent');x.beginPath();x.arc(X(n-1),Y(b.c[n-1]),3,0,7);x.fill();
  x.fillStyle=css('--muted');x.fillText(dstr(b.t[from],tf),L,H-3);
}

function ledger(){
  var R=RES[TAB],st=SIG.stats(R.trades);
  $('t4H').setAttribute('aria-selected',TAB==='4H');$('t1D').setAttribute('aria-selected',TAB==='1D');
  var first=R.trades.length?dstr(R.trades[0].et,'1D'):'–';
  $('stats').innerHTML=[
    [st.n,'Trades since '+first],[st.n?Math.round(st.wins/st.n*100)+'%':'–','Win rate ('+st.wins+'W / '+st.losses+'L)'],
    ['<span class="'+cls(st.total)+'">'+pct(st.total)+'</span>','Total, compounded'],
    ['<span class="pos">'+pct(st.avgW)+'</span> / <span class="neg">'+pct(st.avgL)+'</span>','Avg win / loss'],
    ['<span class="neg">'+pct(st.maxDD)+'</span>','Max drawdown'],
    [(st.n/Math.max(1,monthsSpan(R))).toFixed(1),'Trades per month']
  ].map(function(a){return '<div class="stat"><b>'+a[0]+'</b><span>'+a[1]+'</span></div>'}).join('');
  $('months').innerHTML=SIG.monthly(R.trades).map(function(m){var p=m.eq-1;return '<tr><td>'+m.k+'</td><td>'+m.n+'</td><td>'+m.w+' / '+m.l+'</td><td class="'+cls(p)+'">'+pct(p)+'</td></tr>'}).join('')||'<tr><td colspan="4">No closed trades yet.</td></tr>';
  var rows='';var o=R.state.open;
  if(o) rows+='<tr class="openrow"><td>'+dstr(o.et,TAB)+'</td><td>'+fmtP(o.e)+'</td><td>open</td><td>'+fmtP(R.state.livePrice)+'</td><td>'+(o.target?'tgt '+fmtP(o.target):'RSI > 70')+'</td><td class="'+cls(o.pnl)+'">'+pct(o.pnl)+'</td><td>'+o.bars+'</td><td>–</td></tr>';
  rows+=R.trades.slice().reverse().map(function(t){return '<tr><td>'+dstr(t.et,TAB)+'</td><td>'+fmtP(t.e)+'</td><td>'+dstr(t.xt,TAB)+'</td><td>'+fmtP(t.x)+'</td><td>'+t.why+'</td><td class="'+cls(t.pnl)+'">'+pct(t.pnl)+'</td><td>'+t.bars+'</td><td class="neg">'+pct(t.mae)+'</td></tr>'}).join('');
  $('trades').innerHTML=rows||'<tr><td colspan="8">No trades in the loaded history.</td></tr>';
}
function monthsSpan(R){var b=DATA[TAB];var s=R.trades.length?R.trades[0].et:b.t[0];return (b.t[b.t.length-1]-s)/(86400*30.44)}

/* Tentative cycle: plain RSI(7) close below 30, then the first close above 70, then back below 30 (no filters).
   Windows come from past legs that had already lasted as long as the current one. */
var CYC_TF={
  '4H':{sec:14400,name:'4 hour',hz:[[86400,'1 day'],[259200,'3 days'],[604800,'7 days']]},
  '1D':{sec:86400,name:'Daily',hz:[[604800,'1 week'],[1209600,'2 weeks'],[2592000,'30 days']]},
  '1W':{sec:604800,name:'Weekly',hz:[[2592000,'30 days'],[7862400,'3 months'],[15724800,'6 months']]}
};
var CYC={},WK0=345600;
function weeklyBars(b){var W=604800,o={t:[],h:[],l:[],c:[]},lw=null;
  for(var i=0;i<b.t.length;i++){var w=Math.floor((b.t[i]-WK0)/W);
    if(w!==lw){lw=w;o.t.push(WK0+w*W);o.h.push(b.h[i]);o.l.push(b.l[i]);o.c.push(b.c[i]);}
    else{var k=o.c.length-1;o.c[k]=b.c[i];if(b.h[i]>o.h[k])o.h[k]=b.h[i];if(b.l[i]<o.l[k])o.l[k]=b.l[i];}}
  return o;}
function wilder(c,n){var g=0,l=0,G=new Array(c.length).fill(null),L=G.slice(),R=G.slice();
  for(var i=1;i<c.length;i++){var ch=c[i]-c[i-1],up=Math.max(ch,0),dn=Math.max(-ch,0);
    if(i<=n){g+=up/n;l+=dn/n}else{g=(g*(n-1)+up)/n;l=(l*(n-1)+dn)/n}
    if(i>=n){G[i]=g;L[i]=l;R[i]=l===0?100:100-100/(1+g/l)}}
  return {g:G,l:L,r:R};}
function cycModel(b,sec,now){
  var n=b.c.length,N=(b.t[n-1]+sec>now)?n-1:n,W=wilder(b.c,7),r=W.r,A=[],B=[],phase='wait30',ps=null;
  for(var i=20;i<N;i++){if(r[i]==null)continue;
    if(phase==='wait30'&&r[i]<30){if(ps!==null)A.push({bars:i-ps,chg:b.c[i]/b.c[ps]-1});phase='wait70';ps=i;}
    else if(phase==='wait70'&&r[i]>70){var lo=Infinity;for(var k=ps;k<=i;k++)lo=Math.min(lo,b.l[k]);
      B.push({bars:i-ps,chg:b.c[i]/b.c[ps]-1,dip:lo/b.c[ps]-1});phase='wait30';ps=i;}}
  var li=N-1;
  return {b:b,sec:sec,r:r,g:W.g[li],l:W.l[li],li:li,n:n,N:N,phase:phase,ps:ps,A:A,B:B,rLive:N<n?r[n-1]:null};}
function srt(a){return a.slice().sort(function(x,y){return x-y})}
function qtl(a,p){return a[Math.floor(p*(a.length-1))]}
function med(a){return a.length?qtl(srt(a),0.5):null}
function fmtDur(s){s=Math.max(0,s);var d=s/86400;if(d>=21)return Math.round(d/7)+'w';if(d>=2)return Math.round(d)+'d';
  var h=Math.floor(s/3600),m=Math.floor(s%3600/60);return h>=24?Math.floor(h/24)+'d '+(h%24)+'h':h>0?h+'h '+m+'m':m+'m'}
function fmtWhen(t,tf){var o={weekday:'short',day:'numeric',month:'short'};if(tf==='4H'){o.hour='2-digit';o.minute='2-digit';o.hour12=false}
  return new Date(t*1000).toLocaleString(undefined,o)}
function cycCard(tf,now){
  var M=CYC[tf],C=CYC_TF[tf],b=M.b,sec=M.sec,li=M.li,w70=M.phase==='wait70';
  var hist=w70?M.B:M.A,other=w70?M.A:M.B,live=b.c[M.n-1],rc=M.r[li],rl=M.rLive;
  var e=M.ps==null?null:li-M.ps,just=M.ps===li;
  var closeAt=function(k){return b.t[li]+sec*(k+1)};
  var nc=M.N<M.n?b.t[M.n-1]+sec:(function(){var o=tf==='1W'?WK0:0;return Math.ceil((now-o)/sec)*sec+o})();
  var pill=w70?(just?'Hit 30 this close':'Waiting for 70'):(just?'Hit 70 this close':'Waiting for 30');
  var lead=M.ps==null?'No close below 30 in the loaded history yet.':
    'RSI closed '+(w70?'below 30':'above 70')+' on <b>'+fmtWhen(b.t[M.ps]+sec,tf)+'</b> at <b class="num">'+fmtP(b.c[M.ps])+'</b>'+
    (just?' (this close).':', '+e+' candle'+(e===1?'':'s')+' ago.')+' Now <b class="num">'+rc.toFixed(1)+'</b>'+
    (rl!=null?' (forming <span class="num">'+rl.toFixed(1)+'</span>)':'')+'.';
  var win='';
  if(e!=null){
    var rem=srt(hist.filter(function(h){return h.bars>e}).map(function(h){return h.bars-e}));
    if(!rem.length) win='<div class="meta">'+(hist.length?'This leg has run '+e+' candles, longer than all '+hist.length+' past legs, so history gives no window.':'No completed legs yet, so no window.')+'</div>';
    else{
      win='<div class="wl">First close '+(w70?'above 70':'below 30')+'</div><div class="win">'+
        [['Early',0.25],['Likely',0.5],['Late',0.75]].map(function(a){var t=closeAt(qtl(rem,a[1]));
          return '<div'+(a[1]===0.5?' class="mid"':'')+'><span>'+a[0]+'</span><b>'+fmtWhen(t,tf)+'</b><i>in '+fmtDur(t-now)+'</i></div>'}).join('')+'</div>'+
        '<div class="odds">'+C.hz.map(function(h){var c=rem.filter(function(k){return closeAt(k)<=now+h[0]}).length;
          return '<span>within '+h[1]+' <b>'+Math.round(c/rem.length*100)+'%</b></span>'}).join('')+'</div>';}
  }
  var trig='';
  if(M.g!=null&&e!=null){var px=b.c[li],p=w70?px+(14*M.l-6*M.g):px-(14*M.g-6*M.l);
    trig=p>0?'This '+C.name.toLowerCase()+' candle needs to close '+(w70?'above':'below')+' <b class="num">'+fmtP(p)+'</b> ('+pct(p/live-1)+' from now) to put RSI '+(w70?'over 70':'under 30')+' right away.'
      :'RSI can\'t reach '+(w70?'70':'30')+' on this candle.';}
  var hstat;
  if(!hist.length) hstat='No completed legs in the loaded history.';
  else if(w70){var up=hist.filter(function(h){return h.chg>0}).length;
    hstat='Past '+hist.length+' legs (30 → 70): '+Math.round(up/hist.length*100)+'% hit 70 above the 30-close price; median '+pct(med(hist.map(function(h){return h.chg})))+', median dip on the way '+pct(med(hist.map(function(h){return h.dip})))+'.';}
  else{var dn=hist.filter(function(h){return h.chg<0}).length;
    hstat='Past '+hist.length+' legs (70 → 30): price at the 30 close was a median '+pct(med(hist.map(function(h){return h.chg})))+' from the 70 close; '+Math.round(dn/hist.length*100)+'% were lower.';}
  if(hist.length&&hist.length<6) hstat+=' Only '+hist.length+' past legs, so treat this as rough.';
  var ob=srt(other.map(function(h){return h.bars}));
  var nxt=ob.length?' After that, '+(w70?'70 → 30':'30 → 70')+' usually takes '+fmtDur(qtl(ob,0.5)*sec)+' (middle half '+fmtDur(qtl(ob,0.25)*sec)+' to '+fmtDur(qtl(ob,0.75)*sec)+').':'';
  return '<article class="cyc"><div class="ph"><div class="tf">'+C.name+'<small>next close in '+fmtDur(nc-now)+'</small></div><span class="sd-pill '+(w70?'p-hold':'p-wait')+'">'+pill+'</span></div>'+
    '<div class="lead">'+lead+'</div>'+win+(trig?'<div class="trig">'+trig+'</div>':'')+
    '<canvas id="r'+tf+'" role="img" aria-label="'+C.name+' RSI(7) with the 30 and 70 lines"></canvas>'+
    '<div class="meta">'+hstat+nxt+'</div>'+cycPeer(tf)+'</article>';
}
function drawCyc(tf){var cv=$('r'+tf);if(!cv)return;var M=CYC[tf],r=M.r,n=M.n;
  var W=cv.clientWidth,H=90,dpr=window.devicePixelRatio||1;cv.width=W*dpr;cv.height=H*dpr;var x=cv.getContext('2d');x.scale(dpr,dpr);
  var from=Math.max(20,n-120),L=4,Rr=W-22,T=4,B=H-4;
  var X=function(i){return L+(i-from)/Math.max(1,n-1-from)*(Rr-L)},Y=function(v){return B-v/100*(B-T)};
  x.fillStyle=css('--buy-bg');x.fillRect(L,Y(30),Rr-L,Y(0)-Y(30));x.fillStyle=css('--sell-bg');x.fillRect(L,Y(100),Rr-L,Y(70)-Y(100));
  x.font='10px '+css('--f-num');x.fillStyle=css('--muted');x.fillText('70',Rr+4,Y(70)+3);x.fillText('30',Rr+4,Y(30)+3);
  if(M.ps!=null&&M.ps>=from){x.strokeStyle=css('--accent');x.setLineDash([2,3]);x.beginPath();x.moveTo(X(M.ps),T);x.lineTo(X(M.ps),B);x.stroke();x.setLineDash([]);}
  x.strokeStyle=css('--ink');x.lineWidth=1.3;x.beginPath();for(var i=from;i<n;i++){i===from?x.moveTo(X(i),Y(r[i])):x.lineTo(X(i),Y(r[i]))}x.stroke();
  x.fillStyle=css('--accent');x.beginPath();x.arc(X(n-1),Y(r[n-1]),3,0,7);x.fill();}
function renderCycles(){if(!DATA||!$('cycles'))return;var now=Date.now()/1000;
  CYC['4H']=cycModel(DATA['4H'],14400,now);CYC['1D']=cycModel(DATA['1D'],86400,now);CYC['1W']=cycModel(weeklyBars(DATA['1D']),604800,now);
  $('cycles').innerHTML=['4H','1D','1W'].map(function(tf){return cycCard(tf,now)}).join('');
  ['4H','1D','1W'].forEach(drawCyc);}
/* ALT <-> BTC link (ETH when BTC is shown, as on the original page): correlation, beta, RSI sync and BTC-implied levels on 4H, 1D and 1W closed candles. */
var LK_TF={
  '4H':{sec:14400,name:'4 hour',w:[42,180],wl:['7 days','30 days'],sync:6,unit:'candles'},
  '1D':{sec:86400,name:'Daily',w:[30,90],wl:['30 days','90 days'],sync:3,unit:'days'},
  '1W':{sec:604800,name:'Weekly',w:[12,52],wl:['12 weeks','52 weeks'],sync:2,unit:'weeks'}
};
var LINK={};
function lkBars(asset,tf){var A=ALL[asset];if(!A)return null;return tf==='1W'?weeklyBars(A['1D']):A[tf];}
function lkClosed(b,sec,now){var n=b.t.length;return (b.t[n-1]+sec>now)?n-1:n;}
function corrBeta(x,y){var n=x.length;if(n<5)return null;var mx=0,my=0,i;for(i=0;i<n;i++){mx+=x[i];my+=y[i]}mx/=n;my/=n;
  var cv=0,vx=0,vy=0;for(i=0;i<n;i++){var a=x[i]-mx,c=y[i]-my;cv+=a*c;vx+=a*a;vy+=c*c}
  return {n:n,corr:cv/Math.sqrt(vx*vy),beta:cv/vx};}
function crossEv(r,lvl,below){var ev=[];for(var i=1;i<r.length;i++){if(r[i]==null||r[i-1]==null)continue;
  if(below?(r[i]<lvl&&r[i-1]>=lvl):(r[i]>lvl&&r[i-1]<=lvl))ev.push(i)}return ev;}
function syncStat(bev,eev,W){var hit=0,lags=[];bev.forEach(function(i){var best=null;eev.forEach(function(j){if(Math.abs(j-i)<=W&&(best===null||Math.abs(j-i)<Math.abs(best-i)))best=j});
  if(best!==null){hit++;lags.push(best-i)}});return {n:bev.length,hit:hit,lag:lags.length?med(lags):null};}
function trigPx(b,li){var W=wilder(b.c,7),g=W.g[li],l=W.l[li],px=b.c[li];if(g==null)return null;
  return {r:W.r[li],p30:px-(14*g-6*l),p70:px+(14*l-6*g),px:px};}
function linkModel(tf,now){
  var C=LK_TF[tf],e=lkBars(ALT,tf),b=lkBars('BTC',tf);if(!e||!b)return null;
  var Ne=lkClosed(e,C.sec,now),Nb=lkClosed(b,C.sec,now),bi={};
  for(var i=0;i<Nb;i++)bi[b.t[i]]=i;
  var ec=[],bc=[],ts=[];for(i=0;i<Ne;i++){var j=bi[e.t[i]];if(j!=null){ec.push(e.c[i]);bc.push(b.c[j]);ts.push(e.t[i])}}
  if(ec.length<10)return null;
  var er=[],br=[];for(i=1;i<ec.length;i++){er.push(Math.log(ec[i]/ec[i-1]));br.push(Math.log(bc[i]/bc[i-1]))}
  var win=C.w.map(function(w){var k=Math.min(w,br.length);return corrBeta(br.slice(-k),er.slice(-k))});
  var re=wilder(ec,7).r,rb=wilder(bc,7).r,m=ec.length-1;
  var s30=syncStat(crossEv(rb,30,true),crossEv(re,30,true),C.sync),s70=syncStat(crossEv(rb,70,false),crossEv(re,70,false),C.sync);
  var te=trigPx(e,Ne-1),tb=trigPx(b,Nb-1);
  var beta=(win[1]||win[0]).beta;
  var imp=function(P){return P>0?e.c[e.t.length-1]*Math.pow(P/b.c[b.t.length-1],beta):null};
  var ratio=ec.map(function(v,k){return v/bc[k]});var back=Math.min(20,m);
  var resid=function(n){n=Math.min(n,m);var de=ec[m]/ec[m-n]-1,db=bc[m]/bc[m-n]-1;return {n:n,de:de,db:db,res:de-beta*db}};
  var div=function(c,r){var k=Math.min(30,m-3);if(k<5)return null;var j=m-3-k,lo=j;for(var q=j;q<m-2;q++)if(c[q]<c[lo])lo=q;
    if(r[lo]==null||r[m]==null)return null;var pl=c[m]<c[lo],rl=r[m]<r[lo];
    return {type:pl&&!rl?'bull':pl&&rl?'down':!pl&&rl?'hidden':'none',p0:c[lo],r0:r[lo]}};
  var emaT=function(bb,N){if(bb.c.length<250)return null;var E=bb.c[0],kk=2/201;for(var q=1;q<N;q++)E=E+kk*(bb.c[q]-E);return {ema:E,above:bb.c[N-1]>E}};
  return {tf:tf,C:C,win:win,beta:beta,rE:te?te.r:re[m],rB:tb?tb.r:rb[m],te:te,tb:tb,imp:imp,s30:s30,s70:s70,
    ratio:ratio,ts:ts,rchg:ratio[m]/ratio[m-back]-1,rs:resid(tf==='1W'?5:20),rs2:resid(tf==='1W'?20:5),dE:div(ec,re),dB:div(bc,rb),tE:tf==='1W'?null:emaT(e,Ne),tB:tf==='1W'?null:emaT(b,Nb),back:back,eNow:e.c[e.t.length-1],bNow:b.c[b.t.length-1],span:ec.length};
}
function lkChecks(M){var out=[];
  var dw=function(nm,d){if(!d)return null;return d.type==='bull'?nm+': bullish divergence (price below the '+fmtP(d.p0)+' low, RSI higher than its '+d.r0.toFixed(1)+')':d.type==='down'?nm+': lower low with lower RSI ('+d.r0.toFixed(1)+' then), downtrend confirmed, no divergence yet':d.type==='hidden'?nm+': higher low with lower RSI (hidden bullish)':null};
  var a=dw(ALT,M.dE),b=dw('BTC',M.dB);if(a)out.push(a);if(b)out.push(b);
  if(M.dE&&M.dB&&(M.dE.type==='bull')!==(M.dB.type==='bull'))out.push('Contradiction: only '+(M.dE.type==='bull'?ALT:'BTC')+' shows a divergence.');
  if(M.tE&&M.tB){out.push('EMA 200: '+ALT+' '+(M.tE.above?'above':'below')+' '+fmtP(M.tE.ema)+', BTC '+(M.tB.above?'above':'below')+' '+fmtP(M.tB.ema)+'.');
    if(M.tE.above!==M.tB.above)out.push('Contradiction: the two coins are on opposite sides of their EMA 200, so a BTC-based signal does not carry the same trend for '+ALT+'.');}
  out.push('Price vs beta: last '+M.rs2.n+' candles '+ALT+' '+pct(M.rs2.de)+', BTC '+pct(M.rs2.db)+', '+ALT+' off its usual link by '+pct(M.rs2.res)+'.');
  return '<div class="meta"><b>Checks.</b> '+out.join(' ')+'</div>';}
function corrWord(c){return c>=0.8?'strong':c>=0.5?'moderate':c>=0.2?'weak':'none'}
function linkVerdict(M){var e=M.rE,b=M.rB,d=e-b;
  if(Math.abs(M.rs.res)>=0.05&&Math.abs(d)<15)return [M.rs.res<0?''+ALT+' lagging on price':''+ALT+' leading on price','p-wait','RSI readings look close, but over the last '+M.rs.n+' candles '+ALT+' moved '+pct(M.rs.de)+' against BTC '+pct(M.rs.db)+'. With beta '+M.beta.toFixed(2)+' '+ALT+' should have moved about '+pct(M.beta*M.rs.db)+', so '+ALT+' is '+pct(M.rs.res)+' off its usual link.'];
  if(e<30&&b<30)return ['Both oversold','p-buy','Both RSI(7) closes are under 30. With correlation this high, a BTC bounce should carry '+ALT+', usually by about '+M.beta.toFixed(2)+'× the BTC move.'];
  if(e>70&&b>70)return ['Both overbought','p-sell','Both RSI(7) closes are over 70. A BTC pullback is likely to hit '+ALT+' harder.'];
  if(e<30)return [''+ALT+' oversold, BTC not','p-wait',''+ALT+' is under 30 while BTC sits at '+b.toFixed(1)+'. '+ALT+' is weaker here; wait for BTC to confirm before trusting the '+ALT+' bounce.'];
  if(b<30)return ['BTC oversold, '+ALT+' not','p-wait','BTC is under 30 while '+ALT+' holds '+e.toFixed(1)+'. '+ALT+' is showing relative strength.'];
  if(Math.abs(d)>=15)return [d>0?''+ALT+' stronger':''+ALT+' weaker','p-wait',''+ALT+' RSI is '+Math.abs(d).toFixed(0)+' points '+(d>0?'above':'below')+' BTC on this timeframe.'];
  return ['In step','p-hold','The two RSI readings are within '+Math.abs(d).toFixed(0)+' points, so they are moving together.'];}
function linkCard(tf,now){
  var M=LINK[tf];if(!M)return '<article class="lk"><div class="tf">'+LK_TF[tf].name+'</div><div class="meta">Not enough matching '+ALT+' and BTC candles yet. Press Refresh.</div></article>';
  var C=M.C,v=linkVerdict(M),a=M.win[0],b2=M.win[1];
  var lab=function(w,k){return w.n<C.w[k]?w.n+' candles':C.wl[k]};
  var row=function(name,bp,own){var ip=M.imp(bp);return '<tr><td>'+name+'</td><td>'+(bp>0?fmtP(bp):'–')+'</td><td>'+(ip?fmtP(ip):'–')+'</td><td>'+(own>0?fmtP(own):'–')+'</td></tr>'};
  var both30=M.rE<30&&M.rB<30,both70=M.rE>70&&M.rB>70;
  var tbl=M.tb&&M.te?'<div class="tw"><table><thead><tr><th>This candle closes at</th><th>BTC</th><th>→ '+ALT+' implied</th><th>'+ALT+' own</th></tr></thead><tbody>'+
    row(both30?'Stays under 30 below':'RSI under 30',M.tb.p30,M.te.p30)+row(both70?'Stays over 70 above':'RSI over 70',M.tb.p70,M.te.p70)+'</tbody></table></div>':'';
  var cmp='';if(M.tb&&M.te&&!both30&&M.rE>=30&&M.rB>=30){var i30=M.imp(M.tb.p30);if(i30&&M.te.p30>0)cmp=M.te.p30>i30?''+ALT+' needs a smaller drop than BTC-implied to reach 30, so '+ALT+' is likely to tag oversold first.':''+ALT+' needs a bigger drop than BTC-implied to reach 30, so BTC is likely to tag oversold first.';}
  var sy=function(s,l){return s.n?'BTC '+l+': '+s.n+' times, '+ALT+' followed within '+C.sync+' '+C.unit+' '+Math.round(s.hit/s.n*100)+'%'+(s.lag!=null?' (median lag '+(s.lag>0?'+':'')+s.lag+')':''):'BTC '+l+': no events in this history'};
  return '<article class="lk"><div class="ph"><div class="tf">'+C.name+'<small>'+M.span+' matched candles</small></div><span class="sd-pill '+v[1]+'">'+v[0]+'</span></div>'+
    '<div class="lead">'+v[2]+'</div>'+
    '<div class="duo"><div><span>Correlation · '+lab(a,0)+'</span><b>'+a.corr.toFixed(2)+'</b><i>'+corrWord(a.corr)+' · '+lab(b2,1)+' '+b2.corr.toFixed(2)+'</i></div>'+
      '<div><span>Beta to BTC · '+lab(b2,1)+'</span><b>'+M.beta.toFixed(2)+'×</b><i>'+lab(a,0)+' '+a.beta.toFixed(2)+'×</i></div>'+
      '<div><span>'+ALT+' RSI(7)</span><b>'+M.rE.toFixed(1)+'</b><i>'+ALT+' '+fmtP(M.eNow)+'</i></div>'+
      '<div><span>BTC RSI(7)</span><b>'+M.rB.toFixed(1)+'</b><i>BTC '+fmtP(M.bNow)+'</i></div></div>'+
    tbl+(cmp?'<div class="trig">'+cmp+'</div>':'')+lkChecks(M)+
    '<canvas id="k'+tf+'" role="img" aria-label="'+ALT+'/BTC ratio, '+C.name+'"></canvas>'+
    '<div class="meta">'+ALT+'/BTC '+M.ratio[M.ratio.length-1].toFixed(5)+', '+pct(M.rchg)+' over the last '+M.back+' candles ('+(M.rchg>=0?''+ALT+' outperforming':''+ALT+' lagging')+'). '+sy(M.s30,'under 30')+'. '+sy(M.s70,'over 70')+'.</div></article>';
}
function drawLink(tf){var cv=$('k'+tf),M=LINK[tf];if(!cv||!M)return;var r=M.ratio,n=r.length,from=Math.max(0,n-120);
  var W=cv.clientWidth,H=70,dpr=window.devicePixelRatio||1;cv.width=W*dpr;cv.height=H*dpr;var x=cv.getContext('2d');x.scale(dpr,dpr);
  var lo=Infinity,hi=-Infinity;for(var i=from;i<n;i++){lo=Math.min(lo,r[i]);hi=Math.max(hi,r[i])}var pd=(hi-lo)*0.08||hi*0.01;lo-=pd;hi+=pd;
  var L=4,Rr=W-50,T=4,B=H-4,X=function(i){return L+(i-from)/Math.max(1,n-1-from)*(Rr-L)},Y=function(v){return B-(v-lo)/(hi-lo)*(B-T)};
  x.font='10px '+css('--f-num');x.fillStyle=css('--muted');x.fillText(hi.toFixed(4),Rr+4,T+8);x.fillText(lo.toFixed(4),Rr+4,B);
  x.strokeStyle=css('--accent');x.lineWidth=1.3;x.beginPath();for(i=from;i<n;i++){i===from?x.moveTo(X(i),Y(r[i])):x.lineTo(X(i),Y(r[i]))}x.stroke();
  x.fillStyle=css('--accent');x.beginPath();x.arc(X(n-1),Y(r[n-1]),3,0,7);x.fill();}
function renderLinks(){var now=Date.now()/1000;['4H','1D','1W'].forEach(function(tf){LINK[tf]=linkModel(tf,now)});
  $('links').innerHTML=['4H','1D','1W'].map(function(tf){return linkCard(tf,now)}).join('');['4H','1D','1W'].forEach(drawLink);}
function peerOf(){return ASSET==='BTC'?'ETH':'BTC'}
function btcCheck(tf){var P=peerOf(),pb=lkBars(P,tf);if(!pb||pb.t.length<20)return '';
  var R=SIG.run(pb,tf,Date.now()/1000),s=R.state,M=LINK[tf],st=s.signalNow==='BUY'?'a buy signal':s.signalNow==='SELL'?'a sell/exit':s.open?'holding a trade':'flat';
  var ok=s.rsi<40?'supports':s.rsi>60?'works against':'is neutral on';
  return '<br><b>'+P+' check:</b> RSI(7) <span class="num">'+s.rsi.toFixed(1)+'</span>, '+P+' plan is '+st+'. With correlation <span class="num">'+(M?M.win[0].corr.toFixed(2):'–')+'</span>, '+P+' '+ok+' a '+ASSET+' buy here.';}
function cycPeer(tf){var P=peerOf(),pb=lkBars(P,tf);if(!pb||pb.t.length<30)return '';
  var now=Date.now()/1000,M=cycModel(pb,LK_TF[tf].sec,now),me=CYC[tf];if(M.ps==null)return '';
  var w70=M.phase==='wait70',same=me&&me.phase===M.phase,ago=M.li-M.ps;
  return '<div class="meta"><b>'+P+':</b> '+(w70?'below 30':'above 70')+' '+ago+' candle'+(ago===1?'':'s')+' ago, now <span class="num">'+M.r[M.li].toFixed(1)+'</span>, '+(w70?'waiting for 70':'waiting for 30')+'. '+(same?'Same leg as '+ASSET+', so the clocks agree.':'Different leg from '+ASSET+', so the clocks disagree. Treat the timing as weaker.')+'</div>';}


function html(){
  return '<div id="sd">'+
  '<div class="sd-head"><div><div class="htop"><h2 id="sdTitle">BTC RSI Signal Desk</h2>'+
    (ASSETS.length>1?'<div class="asset" role="group" aria-label="Asset">'+ASSETS.map(function(a){return '<button type="button" id="a'+a+'" aria-pressed="'+(a===ASSET)+'">'+a+'</button>'}).join('')+'</div>':'')+'</div>'+
    '<div class="sub"><span id="sym">BINANCE:BTCUSDT</span> spot · <span id="asof" class="num">loading…</span></div></div>'+
    '<div class="status">Signals only, no orders. Rebuilt on GitHub when new candles arrive and when you press Refresh.</div></div>'+
  '<div class="rules"><span>Buy: RSI(7) closes below 30</span><span>4H filter: price in 0.5–0.786 fib of the last 30-day swing</span><span>1D filter: close above EMA 200</span>'+
    '<span>4H sell: RSI(7) closes above 70</span><span>1D sell: 0.236 fib target of the entry swing</span><span>1D stop: daily close below the swing low</span><span>Long only · 0.1% fee each side</span></div>'+
  '<div class="panels"><section class="panel" id="p4H" aria-label="4 hour signal"></section><section class="panel" id="p1D" aria-label="Daily signal"></section></div>'+
  '<section class="link" aria-labelledby="lk-h"><div><h2 id="lk-h"><span class="lkAlt">ETH</span> ↔ BTC link</h2>'+
    '<p class="cyc-intro"><span class="lkAlt">ETH</span> (<span id="lkSym">BINANCE:ETHUSDT</span>) moves with BTC (BINANCE:BTCUSDT). Correlation and beta use log returns of matching closed candles. Beta 1.2 means <span class="lkAlt">ETH</span> tends to move 1.2% for every 1% BTC moves. BTC-implied <span class="lkAlt">ETH</span> maps a BTC price onto <span class="lkAlt">ETH</span> with that beta, so you can check one coin\'s level against the other.</p></div>'+
    '<div class="lgrid" id="links"></div>'+
    '<div class="foot">RSI sync: of the past times BTC\'s RSI(7) closed below 30 (or above 70), how often <span class="lkAlt">ETH</span> did the same within the window shown, and the median lag in candles (negative means <span class="lkAlt">ETH</span> got there first). Weekly candles are built from daily bars. Not financial advice.</div></section>'+
  '<section class="cycles" aria-labelledby="cyc-h"><div><h2 id="cyc-h">Tentative cycle</h2>'+
    '<p class="cyc-intro">Plain RSI(7): a close below 30, then the first close above 70, then back below 30. No fib or EMA filter, so this is a timing guide, not a trade signal. Early, likely and late are the 25th, 50th and 75th percentiles of past legs that had already lasted as long as this one.</p></div>'+
    '<div class="cgrid" id="cycles"></div>'+
    '<div class="foot">Dates are candle closes in your time zone. Weekly candles are built from the daily bars (weeks start Monday 00:00 UTC). Odds are the share of those past legs that finished within that time. History: 4H since mid-2024, 1D and 1W since late 2020. Updates every 30 seconds and on each refresh. Not financial advice.</div></section>'+
  '<section class="ledger"><div class="lh"><h2>Trade history</h2><div class="sd-tabs" role="tablist">'+
    '<button role="tab" id="t4H" aria-selected="true" type="button">4H</button><button role="tab" id="t1D" aria-selected="false" type="button">1D</button></div></div>'+
    '<div class="stats" id="stats"></div><div class="cols">'+
    '<div><h3>By month</h3><div class="tw sd-scroll"><table><thead><tr><th>Month</th><th>Trades</th><th>W / L</th><th>P&amp;L</th></tr></thead><tbody id="months"></tbody></table></div></div>'+
    '<div><h3>Trades</h3><div class="tw sd-scroll"><table><thead><tr><th>Bought</th><th>Buy</th><th>Sold</th><th>Sell</th><th>Exit</th><th>P&amp;L</th><th>Candles</th><th>Worst dip</th></tr></thead><tbody id="trades"></tbody></table></div></div></div>'+
    '<div class="foot">Signals use closed candles only; the forming candle is ignored. P&amp;L is compounded per trade with a 0.1% fee on buy and sell. 1D targets fill when the daily high touches the 0.236 level (a resting limit order); stops sell on the daily close below the swing low. History covers the bars loaded (4H about 2.3 years, 1D since 2021). Backtest results, not financial advice.</div></section>'+
  '</div>';
}

function render(){
  if(!$('sd'))return;
  ALT=ASSET==='BTC'?'ETH':ASSET;
  $('sym').textContent=SYM[ASSET];$('sdTitle').textContent=ASSET+' RSI Signal Desk';
  ASSETS.forEach(function(a){var b=$('a'+a);if(b)b.setAttribute('aria-pressed',String(a===ASSET))});
  document.querySelectorAll('#sd .lkAlt').forEach(function(x){x.textContent=ALT});$('lkSym').textContent=SYM[ALT];
  $('asof').textContent='bars up to '+new Date(DATA['4H'].t[DATA['4H'].t.length-1]*1000).toLocaleString(undefined,{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit',hour12:false})+' (your time)';
  compute();renderLinks();panel('4H');panel('1D');renderCycles();ledger();
}
function setAsset(a){if(a===ASSET||!ALL[a])return;ASSET=a;try{localStorage.setItem(KEY+'asset',a)}catch(e){}DATA=ALL[a];render();}
function wire(){
  $('t4H').onclick=function(){TAB='4H';try{localStorage.setItem(KEY+'tab',TAB)}catch(e){}ledger()};
  $('t1D').onclick=function(){TAB='1D';try{localStorage.setItem(KEY+'tab',TAB)}catch(e){}ledger()};
  ASSETS.forEach(function(a){var b=$('a'+a);if(b)b.onclick=function(){setAsset(a)}});
}
function redraw(){if(!$('sd')||!DATA)return;draw('4H');draw('1D');['4H','1D','1W'].forEach(drawCyc);['4H','1D','1W'].forEach(drawLink)}
var rt;window.addEventListener('resize',function(){clearTimeout(rt);rt=setTimeout(redraw,150)});
if(window.matchMedia){window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change',redraw);}
setInterval(function(){renderCycles();},30000);

function load(){
  if(!loading)loading=fetch('signal-desk.json',{cache:'no-store'}).then(function(r){if(!r.ok)throw new Error('HTTP '+r.status);return r.json()}).then(function(d){
    SRC=d;ASSETS.concat(PEERS).forEach(function(a){if(d.assets&&d.assets[a]){ALL[a]={'4H':d.assets[a]['4H'],'1D':d.assets[a]['1D']};SYM[a]=d.assets[a].sym}});
    if(!ALL[ASSET])ASSET='BTC';DATA=ALL[ASSET];return d;}).catch(function(e){loading=null;throw e});
  return loading;
}
/* app.js puts html() into the page, then calls mount() */
function mount(){
  if(!$('sd'))return;
  if(DATA){wire();render();return;}
  $('p4H').innerHTML='<p class="foot">Loading candles…</p>';
  load().then(function(){if($('sd')){wire();render();}}).catch(function(e){if($('p4H'))$('p4H').textContent='The price data did not load ('+e.message+'). Reload the page.'});
}
window.SignalDeskView={html:html,mount:mount,_load:load};
})();
