/* app.js — BuildKhata CRM (v2). Framework-free. Premium black & white.
 * Desktop = sidebar app; mobile = bottom tabs. Dashboard computes client-side.
 * Voice understands transactions AND commands. Custom SVG icons only. */
(function () {
  'use strict';
  var api = function (a, p) { return BK.api.call(a, p); };
  var money = BK.money, I = BK.icon, CI = BK.catIcon;

  /* ---------- helpers ---------- */
  function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c];});}
  function h(html){var t=document.createElement('template');t.innerHTML=html.trim();return t.content.firstElementChild;}
  function $(s,r){return (r||document).querySelector(s);}
  function $all(s,r){return Array.prototype.slice.call((r||document).querySelectorAll(s));}
  var toastT;
  function toast(msg,type){var el=$('#toast');if(!el)return;var ic=type==='err'?'close':type==='ok'?'check':'bell';
    el.innerHTML=I(ic)+'<span>'+esc(msg)+'</span>';el.className=(type||'')+' show';clearTimeout(toastT);
    toastT=setTimeout(function(){el.className=el.className.replace('show','').trim();},2800);}
  function errMsg(e){return (e&&e.message)||'Something went wrong';}
  function todayStr(){var d=new Date();return d.getFullYear()+'-'+p2(d.getMonth()+1)+'-'+p2(d.getDate());}
  function p2(n){return (n<10?'0':'')+n;}
  function fmtDate(d){try{return new Date(String(d).slice(0,10)+'T00:00:00').toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'2-digit'});}catch(e){return d;}}
  function monthKey(d){return String(d).slice(0,7);}
  function monthLabel(ym){try{var p=ym.split('-');return new Date(p[0],p[1]-1,1).toLocaleDateString('en-IN',{month:'short',year:'numeric'});}catch(e){return ym;}}
  function addMonths(ym,n){var p=ym.split('-');var d=new Date(Number(p[0]),Number(p[1])-1+n,1);return d.getFullYear()+'-'+p2(d.getMonth()+1);}
  function daysAgo(n){var d=new Date();d.setDate(d.getDate()-n);return d.toISOString().slice(0,10);}
  function rangeFromDays(n){return {from:daysAgo(n),to:todayStr()};}

  /* ---------- state ---------- */
  var S={user:null,route:'dashboard',projects:[],projectId:null,lookups:null,features:{ai:true,email:false},
    tx:null,txProj:null};
  var seq=0; // render sequence for click-fast guards
  function alive(mySeq){return mySeq===seq;}
  function getProjId(){try{return localStorage.getItem('bk_proj')||null;}catch(e){return null;}}
  function setProjId(id){S.projectId=id;try{localStorage.setItem('bk_proj',id);}catch(e){}}
  function curProject(){return S.projects.filter(function(p){return p.id===S.projectId;})[0]||{};}

  var CAT={BOOKING:{label:'Booking',lookup:'INVENTORY_TYPE'},VENDOR:{label:'Vendor',lookup:'VENDOR_TYPE'},
    SALARY:{label:'Salary',lookup:'SALARY_ROLE'},MISC:{label:'Miscellaneous',lookup:'MISC_TYPE'},
    LAND:{label:'Land cost',lookup:null},CHALLAN:{label:'Challan / Sanction',lookup:null}};
  var NAV=[['dashboard','Dashboard','dashboard'],['ledger','Transactions','ledger'],
    ['bookings','Bookings','home'],['vendors','Vendors','cube'],['invoices','Invoices','doc'],
    ['gst','GST invoices','folder'],['reminders','Reminders','bell']];

  /* ======================= AUTH ======================= */
  function renderAuth(msg){
    $('#app').classList.add('hide');
    var root=$('#auth-root');root.classList.remove('hide');
    root.innerHTML='';
    root.appendChild(h(
      '<div class="auth"><div class="auth-card">'+
      '<div class="auth-brand"><img src="assets/icons/icon.svg" alt=""/> BuildKhata</div>'+
      '<h1>Welcome back</h1><p class="sub">Sign in to your builder\'s ledger.</p>'+
      (msg?'<div class="auth-err">'+esc(msg)+'</div>':'')+
      '<form id="lf">'+
      '<div class="field"><label>Email</label><input id="liEmail" type="email" autocomplete="username" required placeholder="you@example.com"/></div>'+
      '<div class="field"><label>Password</label><input id="liPass" type="password" autocomplete="current-password" required placeholder="Your password"/></div>'+
      '<button class="btn btn-primary btn-block" type="submit" id="liBtn">Sign in '+I('chevronRight')+'</button>'+
      '</form>'+
      '<p class="muted" style="font-size:12.5px;margin-top:18px"><a href="index.html">Back to site</a></p>'+
      '</div></div>'));
    $('#lf').addEventListener('submit',function(e){
      e.preventDefault();
      var btn=$('#liBtn');btn.disabled=true;btn.innerHTML='<span class="spin"></span>';
      BK.api.login($('#liEmail').value.trim(),$('#liPass').value)
        .then(function(u){S.user=u;boot();})
        .catch(function(err){renderAuth(err.code==='NETWORK'?'Cannot reach the server. Please try again.':errMsg(err));});
    });
  }
  function logout(){BK.api.logout();S.user=null;location.reload();}

  /* ======================= BOOT ======================= */
  function boot(){
    $('#auth-root').classList.add('hide');
    $('#app').classList.remove('hide');
    renderShell();
    Promise.all([api('getSettings',{}).catch(function(){return{features:{}};}),api('listProjects',{})])
      .then(function(r){
        S.features=r[0].features||S.features;S.projects=r[1].projects||[];
        var saved=getProjId();var active=S.projects.filter(function(p){return p.status!=='archived';});
        S.projectId=(saved&&S.projects.some(function(p){return p.id===saved;}))?saved:((active[0]&&active[0].id)||(S.projects[0]&&S.projects[0].id)||null);
        if(S.projectId)setProjId(S.projectId);
        return S.projectId?loadLookups():null;
      })
      .then(function(){go(S.route);startNotifications();setTimeout(showCoachmark,900);})
      .catch(function(err){if(err.code==='UNAUTHORIZED')renderAuth('Session expired. Please sign in.');else toast(errMsg(err),'err');});
  }
  function loadLookups(){return api('listLookups',{projectId:S.projectId}).then(function(d){S.lookups=d.lookups;});}
  function lookupNames(kind){return (S.lookups&&S.lookups[kind]?S.lookups[kind]:[]).map(function(x){return x.name;});}
  function loadTx(force){
    if(!force&&S.tx&&S.txProj===S.projectId)return Promise.resolve(S.tx);
    return api('listTransactions',{projectId:S.projectId,limit:2000}).then(function(d){S.tx=d.transactions||[];S.txProj=S.projectId;return S.tx;});
  }
  function invalidateTx(){S.tx=null;}

  /* ======================= SHELL ======================= */
  function renderShell(){
    $('#app').innerHTML=
      '<div class="shell">'+
        '<aside class="side">'+
          '<div class="side-brand"><img src="assets/icons/icon.svg" alt=""/> BuildKhata</div>'+
          '<div class="side-proj"><select id="projSel" aria-label="Project"></select></div>'+
          '<nav class="nav-group" id="navGroup">'+NAV.map(function(n){return navBtn(n);}).join('')+'</nav>'+
          '<div class="side-foot">'+
            '<div class="side-user" id="sideUser"></div>'+
            '<button class="nav-item" data-go="settings">'+I('settings')+'<span>Settings</span></button>'+
            '<button class="nav-item" id="logoutBtn">'+I('logout')+'<span>Log out</span></button>'+
          '</div>'+
        '</aside>'+
        '<div class="main">'+
          '<div class="topbar">'+
            '<span class="tb-brand"><img src="assets/icons/icon.svg" alt=""/> BuildKhata</span>'+
            '<select class="tb-proj" id="projSelM" aria-label="Project"></select>'+
          '</div>'+
          '<div class="content"><div id="view"></div></div>'+
          tabbar()+
        '</div>'+
      '</div>'+
      '<div id="assistant"></div><div id="voiceOverlay" class="hide"></div>';
    $('#sideUser').textContent=S.user?S.user.email:'';
    $('#navGroup').addEventListener('click',navClick);
    $('.side-foot').addEventListener('click',navClick);
    $('#logoutBtn').addEventListener('click',logout);
    $('#tabbar').addEventListener('click',navClick);
    mountAssistant();
    bindHoldMic($('#micTab'));
  }
  function navBtn(n){return '<button class="nav-item" data-go="'+n[0]+'">'+I(n[2])+'<span>'+n[1]+'</span></button>';}
  function navClick(e){var b=e.target.closest('[data-go]');if(b)go(b.getAttribute('data-go'));}
  function tabbar(){
    function t(id,label,icon){return '<button class="tab" data-go="'+id+'">'+I(icon)+'<span>'+label+'</span></button>';}
    return '<nav class="tabbar" id="tabbar">'+
      t('dashboard','Home','dashboard')+t('ledger','Txns','ledger')+
      '<button class="tab center" id="micTab" aria-label="Hold to speak"><span class="fab">'+I('mic')+'</span></button>'+
      t('reminders','Reminders','bell')+t('more','More','more')+'</nav>';
  }
  function syncProjSel(){
    [$('#projSel'),$('#projSelM')].forEach(function(sel){
      if(!sel)return;
      sel.innerHTML=S.projects.map(function(p){return '<option value="'+p.id+'"'+(p.id===S.projectId?' selected':'')+'>'+esc(p.name)+(p.status==='archived'?' (archived)':'')+'</option>';}).join('')+'<option value="__new">+ New project</option>';
      sel.onchange=function(){if(sel.value==='__new'){sel.value=S.projectId||'';return openProjectSheet();}setProjId(sel.value);invalidateTx();loadLookups().then(function(){go(S.route);});};
    });
  }
  function setActive(route){
    $all('.nav-item,[data-go].tab').forEach(function(el){el.classList.toggle('active',el.getAttribute('data-go')===route);});
  }

  /* ======================= ROUTER ======================= */
  var VIEWS={dashboard:viewDashboard,ledger:viewLedger,bookings:viewBookings,
    vendors:viewVendors,invoices:viewInvoices,gst:viewGst,reminders:viewReminders,settings:viewSettings};
  function go(route){
    seq++;destroyCharts();
    if(route==='more'){return openMoreMenu();}
    S.route=route;setActive(route);syncProjSel();
    var root=$('#view');if(!root){renderShell();root=$('#view');}
    if(!S.projectId&&route!=='settings'){root.innerHTML=noProject();var b=$('#npBtn');if(b)b.onclick=openProjectSheet;return;}
    root.innerHTML='<div class="view" id="viewInner"></div>';
    (VIEWS[route]||viewDashboard)($('#viewInner'),seq);
  }
  function noProject(){return '<div class="view"><div class="empty"><div class="ei">'+I('building')+'</div><h3>Create your first project</h3><p>Every entry belongs to a project (a site). Add one to begin.</p><button class="btn btn-primary" id="npBtn" style="margin-top:14px">'+I('plus')+' New project</button></div></div>';}
  function pageHead(title,sub,actions){return '<div class="page-h"><div><h1>'+esc(title)+'</h1>'+(sub?'<div class="page-sub">'+esc(sub)+'</div>':'')+'</div>'+(actions?'<div class="page-actions">'+actions+'</div>':'')+'</div>';}

  /* ======================= DASHBOARD (client-side) ======================= */
  var chartTrend,chartPie;
  function destroyCharts(){[chartTrend,chartPie].forEach(function(c){try{c&&c.destroy();}catch(e){}});chartTrend=chartPie=null;}
  function viewDashboard(v,mySeq){
    v.innerHTML=pageHead('Dashboard',curProject().name||'',
      '<button class="btn btn-ghost btn-sm" id="dlReport">'+I('download')+' Export PDF</button>'+
      '<button class="btn btn-ghost btn-sm" id="emReport">'+I('mail')+' Email report</button>')+
      '<div class="kpis" id="kpis">'+kpiSkel()+'</div>'+
      '<div class="card" style="margin-top:16px">'+
        '<div class="card-h"><h3>Cashflow</h3></div>'+
        '<div class="range-bar">'+
          '<span class="seg" id="rangeSeg"><button data-r="30">30D</button><button data-r="90" class="on">90D</button><button data-r="365">1Y</button><button data-r="0">All</button></span>'+
          '<span class="range-dates"><input type="date" id="rFrom" aria-label="From date"/><span class="rto">to</span><input type="date" id="rTo" aria-label="To date"/></span>'+
        '</div>'+
        '<div class="chart-box"><canvas id="trendC"></canvas></div></div>'+
      '<div class="dash-grid">'+
        '<div class="card"><div class="card-h"><h3>Where the money went</h3></div><div class="chart-box" style="height:230px"><canvas id="pieC"></canvas></div><div class="legend" id="pieLegend"></div></div>'+
        '<div class="card"><div class="card-h"><h3>Projection</h3><span class="sub">from this month</span></div><div id="projBox"></div></div>'+
      '</div>';
    $('#dlReport').onclick=exportReportPdf;$('#emReport').onclick=emailReportFlow;
    // default 90D, with the date inputs already filled to match (no hide/show, no layout shift)
    var def=rangeFromDays(90);$('#rFrom').value=def.from;$('#rTo').value=def.to;
    $('#rangeSeg').addEventListener('click',function(e){var b=e.target.closest('button');if(!b)return;
      $all('#rangeSeg button').forEach(function(x){x.classList.remove('on');});b.classList.add('on');
      var r=Number(b.getAttribute('data-r'));
      if(r===0){$('#rFrom').value='';$('#rTo').value='';}else{var rg=rangeFromDays(r);$('#rFrom').value=rg.from;$('#rTo').value=rg.to;}
      renderDash(mySeq);});
    function onDate(){$all('#rangeSeg button').forEach(function(x){x.classList.remove('on');});renderDash(mySeq);}
    $('#rFrom').addEventListener('change',onDate);$('#rTo').addEventListener('change',onDate);
    loadTx().then(function(){if(alive(mySeq))renderDash(mySeq);}).catch(function(e){toast(errMsg(e),'err');});
  }
  function kpiSkel(){return '<div class="skeleton" style="height:92px"></div>'.repeat(4);}
  function rangeBounds(){var f=$('#rFrom'),t=$('#rTo');return{from:f?f.value:'',to:t?t.value:''};}
  function renderDash(mySeq){
    if(!alive(mySeq))return;
    var b=rangeBounds();var s=computeSummary(S.tx||[],Number(curProject().landCost)||0,b.from,b.to);
    renderKpis(s);renderTrend(s);renderPie(s);renderProjection(s);
    _lastSummary=s;
  }
  function computeSummary(tx,landCost,from,to){
    function inR(d){d=String(d).slice(0,10);if(from&&d<from)return false;if(to&&d>to)return false;return true;}
    var period={income:0,expense:0,byCategory:{},byVendorType:{},byMonth:{}};
    tx.forEach(function(t){
      if(from||to){if(!inR(t.date))return;}
      var amt=Number(t.amount)||0,m=monthKey(t.date);
      if(!period.byMonth[m])period.byMonth[m]={month:m,income:0,expense:0};
      if(t.type==='INCOME'){period.income+=amt;period.byMonth[m].income+=amt;}
      else if(t.type==='EXPENSE'){period.byMonth[m].expense+=amt;
        if(t.category!=='LAND'){period.expense+=amt;period.byCategory[t.category]=(period.byCategory[t.category]||0)+amt;
          if(t.category==='VENDOR'){var vt=t.subCategory||'Other';period.byVendorType[vt]=(period.byVendorType[vt]||0)+amt;}}}
    });
    period.net=period.income-period.expense;
    period.byMonth=Object.keys(period.byMonth).sort().map(function(k){return period.byMonth[k];});
    var ti=0,te=0;tx.forEach(function(t){var a=Number(t.amount)||0;if(t.type==='INCOME')ti+=a;else if(t.type==='EXPENSE'&&t.category!=='LAND')te+=a;});
    var profit=ti-(landCost+te);
    // projection from current month
    var bm={};tx.forEach(function(t){var m=monthKey(t.date);if(!m)return;if(!bm[m])bm[m]=0;var a=Number(t.amount)||0;if(t.type==='INCOME')bm[m]+=a;else if(t.type==='EXPENSE'&&t.category!=='LAND')bm[m]-=a;});
    var mk=Object.keys(bm);var avg=mk.length?mk.reduce(function(s,k){return s+bm[k];},0)/mk.length:0;
    var series=[],cum=0,start=monthKey(todayStr());for(var i=0;i<6;i++){cum+=avg;series.push({month:addMonths(start,i),cumulative:Math.round(cum),net:Math.round(avg)});}
    return{period:period,totals:{income:ti,expense:te,landCost:landCost,profit:profit,profitRatio:ti>0?profit/ti:0},
      projection:{monthlyNetAvg:Math.round(avg),series:series},range:{from:from,to:to}};
  }
  function renderKpis(s){
    var p=s.period,t=s.totals;
    $('#kpis').innerHTML=
      '<div class="kpi pos"><div class="kl">'+I('arrowDown')+'In (period)</div><div class="kv">'+money(p.income)+'</div></div>'+
      '<div class="kpi neg"><div class="kl">'+I('arrowUp')+'Out (period)</div><div class="kv">'+money(p.expense)+'</div></div>'+
      '<div class="kpi"><div class="kl">'+I('wallet')+'Net (period)</div><div class="kv">'+money(p.net)+'</div></div>'+
      '<div class="kpi hero"><div class="kl">'+I('trendUp')+'Profit (lifetime)</div><div class="kv">'+money(t.profit)+'</div><div class="kchip">'+Math.round(t.profitRatio*100)+'% margin</div></div>';
  }
  function renderTrend(s){
    var c=$('#trendC');if(!c||!window.Chart)return;
    var labels=s.period.byMonth.map(function(m){return monthLabel(m.month);});
    if(!labels.length){c.parentNode.innerHTML='<div class="empty" style="padding:30px">'+I('trendUp')+'<p>No entries in this range yet.</p></div>';return;}
    chartTrend=new Chart(c,{type:'bar',data:{labels:labels,datasets:[
      {label:'Income',data:s.period.byMonth.map(function(m){return m.income;}),backgroundColor:'#1F9D6B',borderRadius:6,maxBarThickness:30},
      {label:'Expense',data:s.period.byMonth.map(function(m){return m.expense;}),backgroundColor:'#DC5B57',borderRadius:6,maxBarThickness:30}]},
      options:baseOpts(true)});
  }
  var PIE=['#0A0A0B','#4F7CF0','#1F9D6B','#DC5B57','#C98A2B','#7A5AF8','#5B6472','#E0609A','#17A2A2','#A0A0A8'];
  function renderPie(s){
    var c=$('#pieC');if(!c||!window.Chart)return;
    var data=Object.keys(s.period.byVendorType).length?s.period.byVendorType:s.period.byCategory;
    var labels=Object.keys(data);
    if(!labels.length){c.parentNode.innerHTML='<div class="empty" style="padding:20px">'+I('pie')+'<p>No expenses in this range.</p></div>';$('#pieLegend').innerHTML='';return;}
    var vals=labels.map(function(k){return data[k];}),total=vals.reduce(function(a,b){return a+b;},0);
    chartPie=new Chart(c,{type:'doughnut',data:{labels:labels.map(prettyCat),datasets:[{data:vals,backgroundColor:labels.map(function(_,i){return PIE[i%PIE.length];}),borderWidth:2,borderColor:'#fff'}]},
      options:{cutout:'64%',responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},tooltip:{callbacks:{label:function(x){return ' '+money(x.raw);}}}}}});
    $('#pieLegend').innerHTML=labels.map(function(k,i){return '<div class="legend-row"><span class="dot" style="background:'+PIE[i%PIE.length]+'"></span><span class="nm">'+esc(prettyCat(k))+'</span><b>'+money(data[k])+'</b><span class="pc">'+Math.round(data[k]/total*100)+'%</span></div>';}).join('');
  }
  function prettyCat(k){return CAT[k]?CAT[k].label:k;}
  function renderProjection(s){
    var pr=s.projection;
    $('#projBox').innerHTML='<div style="font-size:14px;color:var(--txt-2)">Average net per month: <b style="color:'+(pr.monthlyNetAvg>=0?'var(--pos)':'var(--neg)')+'">'+money(pr.monthlyNetAvg)+'</b></div>'+
      '<div class="chips" style="margin-top:12px">'+pr.series.map(function(x){return '<span class="chip">'+monthLabel(x.month)+': <b>'+money(x.cumulative)+'</b></span>';}).join('')+'</div>';
  }
  function baseOpts(legend){return{responsive:true,maintainAspectRatio:false,
    plugins:{legend:{display:!!legend,position:'bottom',labels:{boxWidth:12,font:{size:12},color:'#55555E'}},
      tooltip:{callbacks:{label:function(c){return c.dataset.label+': '+money(c.raw);}}}},
    scales:{x:{grid:{display:false},ticks:{color:'#8A8A93',font:{size:11}}},
      y:{ticks:{color:'#8A8A93',font:{size:11},callback:function(v){return BK.brand.currency.symbol+(Math.abs(v)>=1000?(v/1000)+'k':v);}},grid:{color:'#F0F0F4'}}}};}

  /* ======================= VOICE / COMMAND ASSISTANT ======================= */
  // Global utterance handler (from the hold-to-talk mic OR the chatbot text box).
  function handleUtterance(text){
    text=(text||'').trim();
    if(!text){hideVoiceOverlay();toast('Did not catch that. Try again.');return;}
    chatBot.push('user',text);
    if(S.features.ai===false){hideVoiceOverlay();manualConfirm(text);return;}
    chatBot.thinking(true);
    api('interpretBatch',{text:text,projectId:S.projectId}).then(function(d){
      chatBot.thinking(false);hideVoiceOverlay();
      var items=d.items||[];
      if(!items.length){toast("I can't help with that",'err');chatBot.push('bot',"Sorry, I can only help with your project's money, reminders and reports. I'm not able to do that.");return;}
      if(items.length===1){dispatchIntent(items[0],text);}
      else{showBatchReview(items);}
    }).catch(function(e){chatBot.thinking(false);hideVoiceOverlay();
      if(e.code==='AI_DISABLED'){manualConfirm(text);return;}
      if(e.code==='UNKNOWN_ACTION'){ // backend not re-deployed yet: fall back to single interpret
        return api('interpret',{text:text,projectId:S.projectId}).then(function(d){dispatchIntent(d.result,text);}).catch(function(e2){toast(errMsg(e2),'err');chatBot.push('bot',errMsg(e2));});
      }
      toast(errMsg(e),'err');chatBot.push('bot',errMsg(e));});
  }
  function dispatchIntent(r,rawText){
    var d=r.data||{};
    if(r.speak)chatBot.push('bot',r.speak);
    if(r.intent==='ADD_TRANSACTION'){return showTxConfirm(d,rawText,true,r.confidence);}
    if(r.intent==='SET_LAND_COST'){return commandConfirm('Set land cost','Update land cost for '+esc(curProject().name)+' to '+money(d.amount)+'?',function(){
      return api('updateProject',{id:S.projectId,landCost:Number(d.amount)||0}).then(function(res){S.projects=S.projects.map(function(x){return x.id===res.project.id?res.project:x;});});},'Land cost updated');}
    if(r.intent==='ADD_REMINDER'){return openReminderSheet(d);}
    if(r.intent==='ADD_PROJECT'){return commandConfirm('New project','Create project "'+esc(d.name||'')+'"?',function(){
      return api('createProject',{name:d.name,landCost:Number(d.landCost)||0}).then(function(res){S.projects.push(res.project);setProjId(res.project.id);return loadLookups();});},'Project created',function(){invalidateTx();go('dashboard');});}
    if(r.intent==='ADD_VENDOR'){return commandConfirm('New vendor','Add vendor "'+esc(d.name||'')+'"'+(d.vendorType?' ('+esc(d.vendorType)+')':'')+'?',function(){
      return api('createVendor',{projectId:S.projectId,name:d.name,vendorType:d.vendorType||'',phone:d.phone||''});},'Vendor added');}
    if(r.intent==='ADD_VENDOR_TYPE'||r.intent==='ADD_SALARY_ROLE'||r.intent==='ADD_UNIT_TYPE'){
      var kind={ADD_VENDOR_TYPE:'VENDOR_TYPE',ADD_SALARY_ROLE:'SALARY_ROLE',ADD_UNIT_TYPE:'INVENTORY_TYPE'}[r.intent];
      return commandConfirm('New '+kindLabel(kind),'Add "'+esc(d.name||'')+'"?',function(){return api('createLookup',{kind:kind,name:d.name,projectId:S.projectId}).then(loadLookups);},'Added');}
    if(r.intent==='SET_DAILY_REPORT'){go('settings');toast('Configure the daily report below');return;}
    if(r.intent==='SEND_REPORT'){return doSendReport(d);}
    if(r.intent==='QUERY'){return doQuery(d);}
    // off-topic or not understood: generic refusal (the AI is scoped to this CRM only)
    chatBot.push('bot',"Sorry, I can only help with your project's money, reminders and reports. I'm not able to do that.");
    toast("I can't help with that",'err');
  }
  function doSendReport(d){
    if(!S.features.email){chatBot.push('bot','Email reports are off. Add a Resend key on the server to enable them.');toast('Email is off','err');return;}
    var to=(S.user&&S.user.email)||'';
    if(!to){chatBot.push('bot','I do not have an email to send to.');return;}
    var period=(d&&d.period)||'today',from='',until=todayStr(),label='today';
    if(period==='today'){from=todayStr();label='today';}
    else if(period==='yesterday'){from=daysAgo(1);until=daysAgo(1);label='yesterday';}
    else if(period==='this_week'){from=daysAgo(7);label='the last 7 days';}
    else if(period==='this_month'){var d2=new Date();from=d2.getFullYear()+'-'+p2(d2.getMonth()+1)+'-01';label='this month';}
    else if(period==='all'){from='';until='';label='all time';}
    chatBot.thinking(true);
    api('sendReportNow',{projectId:S.projectId,to:to,from:from,until:until}).then(function(){chatBot.thinking(false);chatBot.push('bot','Done. I emailed the '+label+' report to '+to+'.');toast('Report sent','ok');})
      .catch(function(e){chatBot.thinking(false);chatBot.push('bot',errMsg(e));toast(errMsg(e),'err');});
  }
  function doQuery(d){
    var map={today_expense:'todayOut',today_income:'todayIn',this_month:'month',month:'month',open_reminders:'rem',reminders:'rem'};
    var metric=d&&d.metric;
    if(map[metric])return quickQuery(map[metric]);
    if(metric==='profit'||metric==='margin'){
      chatBot.thinking(true);
      return loadTx().then(function(tx){chatBot.thinking(false);
        var ti=0,te=0;tx.forEach(function(t){var a=Number(t.amount)||0;if(t.type==='INCOME')ti+=a;else if(t.type==='EXPENSE'&&t.category!=='LAND')te+=a;});
        var land=Number(curProject().landCost)||0,profit=ti-(land+te);
        chatBot.push('bot','Profit so far: '+money(profit)+' ('+(ti>0?Math.round(profit/ti*100):0)+'% margin). Income '+money(ti)+', land '+money(land)+', expenses '+money(te)+'.');
      }).catch(function(e){chatBot.thinking(false);chatBot.push('bot',errMsg(e));});
    }
    chatBot.push('bot',"I can tell you today's spend or income, this month's numbers, your profit, or open reminders.");
  }
  function manualConfirm(text){showTxConfirm({type:'EXPENSE',category:'VENDOR',subCategory:'',vendorName:'',amount:0,date:todayStr(),note:text||''},text||'',false,1);}

  // ---- multiple entries in one utterance: review all, approve all ----
  function itemSummary(it){
    var d=it.data||{};
    if(it.intent==='ADD_TRANSACTION'){var out=d.type!=='INCOME';return{icon:CI[d.category]||'box',title:d.vendorName||d.subCategory||((CAT[d.category]||{}).label)||'Entry',sub:(out?'Expense':'Income')+(d.subCategory?' · '+d.subCategory:''),amt:(out?'-':'+')+money(d.amount),cls:out?'out':'in'};}
    if(it.intent==='ADD_REMINDER'){return{icon:'bell',title:d.title||'Reminder',sub:'Reminder · '+fmtDate(d.dueDate||todayStr())+' '+(d.time||''),amt:Number(d.amount)>0?money(d.amount):'',cls:''};}
    if(it.intent==='SET_LAND_COST'){return{icon:'land',title:'Set land cost',sub:curProject().name||'',amt:money(d.amount),cls:''};}
    if(it.intent==='ADD_PROJECT'){return{icon:'building',title:'New project: '+(d.name||''),sub:'Project',amt:'',cls:''};}
    if(it.intent==='ADD_VENDOR'){return{icon:'cube',title:d.name||'Vendor',sub:'Vendor'+(d.vendorType?' · '+d.vendorType:''),amt:'',cls:''};}
    if(it.intent==='ADD_VENDOR_TYPE'||it.intent==='ADD_SALARY_ROLE'||it.intent==='ADD_UNIT_TYPE'){var k={ADD_VENDOR_TYPE:'VENDOR_TYPE',ADD_SALARY_ROLE:'SALARY_ROLE',ADD_UNIT_TYPE:'INVENTORY_TYPE'}[it.intent];return{icon:'plus',title:'Add '+kindLabel(k)+': '+(d.name||''),sub:'Category',amt:'',cls:''};}
    return{icon:'box',title:it.intent,sub:'',amt:'',cls:''};
  }
  function executeItem(it){
    var d=it.data||{};
    switch(it.intent){
      case 'ADD_TRANSACTION':
        if(!(Number(d.amount)>0))return Promise.reject(new Error('no amount'));
        return api('createTransaction',{projectId:S.projectId,type:d.type,category:d.category,subCategory:d.subCategory||'',vendorName:d.vendorName||'',amount:Number(d.amount)||0,rate:Number(d.rate)||0,quantity:Number(d.quantity)||0,unit:d.unit||'',date:d.date||todayStr(),note:d.note||'',source:'voice',rawText:''});
      case 'ADD_REMINDER':
        return api('createReminder',{projectId:S.projectId,title:d.title,dueDate:d.dueDate,time:d.time,remindBefore:d.remindBefore,recurrence:d.recurrence,amount:Number(d.amount)||0,notify:true});
      case 'SET_LAND_COST':
        return api('updateProject',{id:S.projectId,landCost:Number(d.amount)||0}).then(function(res){S.projects=S.projects.map(function(x){return x.id===res.project.id?res.project:x;});});
      case 'ADD_PROJECT':
        return api('createProject',{name:d.name,landCost:Number(d.landCost)||0}).then(function(res){S.projects.push(res.project);});
      case 'ADD_VENDOR':
        return api('createVendor',{projectId:S.projectId,name:d.name,vendorType:d.vendorType||'',phone:d.phone||''});
      case 'ADD_VENDOR_TYPE':return api('createLookup',{kind:'VENDOR_TYPE',name:d.name,projectId:S.projectId}).then(loadLookups);
      case 'ADD_SALARY_ROLE':return api('createLookup',{kind:'SALARY_ROLE',name:d.name,projectId:S.projectId}).then(loadLookups);
      case 'ADD_UNIT_TYPE':return api('createLookup',{kind:'INVENTORY_TYPE',name:d.name,projectId:S.projectId}).then(loadLookups);
      default:return Promise.resolve();
    }
  }
  function showBatchReview(items){
    var live=items.slice();
    openSheet('Review '+items.length+' entries','<p class="muted" style="margin:0 0 12px;font-size:13px">I understood these from what you said. Remove any you don\'t want, then approve.</p><div id="brBody"></div><button class="btn btn-primary btn-block" id="brApprove" style="margin-top:8px"></button>',function(root){
      function render(){
        var body=$('#brBody',root);
        body.innerHTML=live.map(function(it,idx){var s=itemSummary(it);
          return '<div class="item" style="cursor:default"><div class="av">'+I(s.icon)+'</div><div class="meta"><div class="t">'+esc(s.title)+'</div><div class="s">'+esc(s.sub)+'</div></div>'+(s.amt?'<div class="amt '+s.cls+'">'+s.amt+'</div>':'')+'<button class="br-x" data-x="'+idx+'" aria-label="Remove">'+I('close')+'</button></div>';
        }).join('');
        $all('[data-x]',body).forEach(function(b){b.onclick=function(){live.splice(Number(b.getAttribute('data-x')),1);if(!live.length){closeSheet();return;}render();};});
        var ap=$('#brApprove',root);ap.innerHTML=I('check')+' Approve all ('+live.length+')';
      }
      render();
      $('#brApprove',root).onclick=function(){
        if(!live.length)return;var ap=$('#brApprove',root);ap.disabled=true;ap.innerHTML='<span class="spin"></span>';
        var total=live.length,ok=0,fail=0;
        (function next(i){
          if(i>=total){invalidateTx();closeSheet();
            toast('Saved '+ok+' entr'+(ok===1?'y':'ies')+(fail?', '+fail+' skipped':''),fail?'err':'ok');
            chatBot.push('bot','Saved '+ok+' of '+total+' entries.');
            if(S.route==='dashboard'||S.route==='ledger'||S.route==='reminders')go(S.route);return;}
          executeItem(live[i]).then(function(){ok++;next(i+1);}).catch(function(){fail++;next(i+1);});
        })(0);
      };
    });
  }
  function showTxConfirm(sg,rawText,fromAi,confidence){
    var cats=Object.keys(CAT);
    openSheet(fromAi?'Confirm entry':'New entry',
      (fromAi?'<div class="chip" style="margin-bottom:14px">'+(Number(confidence)>0?Math.round(confidence*100)+'% sure. ':'')+'Edit anything, then save.</div>':'')+
      '<div class="row2"><div class="field"><label>Type</label><select id="cType"><option value="EXPENSE"'+(sg.type!=='INCOME'?' selected':'')+'>Money out</option><option value="INCOME"'+(sg.type==='INCOME'?' selected':'')+'>Money in</option></select></div>'+
      '<div class="field"><label>Category</label><select id="cCat">'+cats.map(function(c){return '<option value="'+c+'"'+(sg.category===c?' selected':'')+'>'+CAT[c].label+'</option>';}).join('')+'</select></div></div>'+
      '<div class="field" id="subWrap"></div><div class="field" id="venWrap"></div>'+
      '<div class="row2"><div class="field"><label>Amount ('+BK.brand.currency.symbol+')</label><input id="cAmt" type="number" inputmode="decimal" value="'+(sg.amount||'')+'"/></div>'+
      '<div class="field"><label>Date</label><input id="cDate" type="date" value="'+esc(sg.date||todayStr())+'"/></div></div>'+
      '<details style="margin-bottom:12px"><summary class="muted" style="cursor:pointer;font-size:13px">Rate / quantity (optional)</summary>'+
      '<div class="row2" style="margin-top:10px"><div class="field"><label>Rate</label><input id="cRate" type="number" value="'+(sg.rate||'')+'"/></div>'+
      '<div class="field"><label>Qty &amp; unit</label><div style="display:flex;gap:8px"><input id="cQty" type="number" value="'+(sg.quantity||'')+'" style="flex:1"/><input id="cUnit" placeholder="bags" value="'+esc(sg.unit||'')+'" style="flex:1"/></div></div></div></details>'+
      '<div class="field"><label>Note</label><input id="cNote" value="'+esc(sg.note||'')+'"/></div>'+
      '<button class="btn btn-primary btn-block" id="saveTx">'+I('check')+' Save entry</button>',
      function(root){
        function refreshSub(){
          var cat=$('#cCat',root).value,sub=$('#subWrap',root),ven=$('#venWrap',root),lk=CAT[cat].lookup;
          if(lk){var opts=lookupNames(lk);
            sub.innerHTML='<label>'+(cat==='SALARY'?'Role':cat==='BOOKING'?'Unit type':'Type')+'</label><select id="cSub">'+opts.map(function(o){return '<option'+(String(sg.subCategory).toLowerCase()===o.toLowerCase()?' selected':'')+'>'+esc(o)+'</option>';}).join('')+'<option value="__new">+ Add new</option></select>';
            $('#cSub',root).onchange=function(){if(this.value==='__new')addLookupPrompt(lk,this);};}
          else sub.innerHTML='';
          ven.innerHTML=(cat==='VENDOR')?'<label>Vendor name</label><input id="cVen" placeholder="e.g. Sharma Steel" value="'+esc(sg.vendorName||'')+'"/>':'';
        }
        $('#cCat',root).onchange=refreshSub;refreshSub();
        $('#saveTx',root).onclick=function(){
          var g=function(id){return $('#'+id,root);};
          var payload={projectId:S.projectId,type:g('cType').value,category:g('cCat').value,
            subCategory:g('cSub')?g('cSub').value:'',vendorName:g('cVen')?g('cVen').value.trim():'',
            amount:Number(g('cAmt').value)||0,rate:Number(g('cRate')&&g('cRate').value)||0,
            quantity:Number(g('cQty')&&g('cQty').value)||0,unit:(g('cUnit')&&g('cUnit').value)||'',
            date:g('cDate').value||todayStr(),note:g('cNote').value.trim(),source:fromAi?'voice':'manual',rawText:rawText||''};
          if(!(payload.amount>0)){toast('Enter an amount','err');return;}
          var btn=g('saveTx');btn.disabled=true;btn.innerHTML='<span class="spin"></span>';
          api('createTransaction',payload).then(function(){invalidateTx();closeSheet();toast('Saved','ok');chatBot.push('bot','Saved '+(payload.type==='INCOME'?'income':'expense')+' of '+money(payload.amount)+'.');if(S.route==='dashboard'||S.route==='ledger')go(S.route);})
            .catch(function(e){btn.disabled=false;btn.innerHTML=I('check')+' Save entry';toast(errMsg(e),'err');});
        };
      });
  }
  function kindLabel(k){return{VENDOR_TYPE:'vendor type',SALARY_ROLE:'salary role',INVENTORY_TYPE:'unit type',MISC_TYPE:'misc type'}[k]||'item';}
  function addLookupPrompt(kind,selectEl){
    openSheet('Add '+kindLabel(kind),'<div class="field"><label>Name</label><input id="lkN" placeholder="e.g. Scaffolding"/></div><button class="btn btn-primary btn-block" id="lkS">Add</button>',function(root){
      $('#lkS',root).onclick=function(){var name=$('#lkN',root).value.trim();if(!name)return;
        api('createLookup',{kind:kind,name:name,projectId:S.projectId}).then(function(){loadLookups().then(function(){
          if(selectEl){var o=document.createElement('option');o.textContent=name;o.selected=true;selectEl.insertBefore(o,selectEl.lastChild);}closeSheet();toast('Added','ok');});}).catch(function(e){toast(errMsg(e),'err');});};
    });
  }

  /* ---- floating assistant: hold-to-talk mic (all views) + desktop chatbot ---- */
  // onboarding hint shown just after login: mobile -> the mic, desktop -> the AI Agent
  function showCoachmark(){
    if($('.coach'))return;
    var isMobile=window.matchMedia&&window.matchMedia('(max-width:899px)').matches;
    var el=document.createElement('div');
    el.className='coach '+(isMobile?'mobile':'desktop');
    el.innerHTML=isMobile
      ? '<div class="ct">'+I('mic')+' Hold to speak</div><div class="cd">Hold the mic and speak to log anything: a payment, income, or a reminder.</div>'
      : '<div class="ct">'+I('agent')+' Meet your AI Agent</div><div class="cd">Click here to ask a question, or speak to log entries, set reminders and more.</div>';
    document.body.appendChild(el);
    function dismiss(){if(!el.parentNode)return;el.classList.add('out');document.removeEventListener('pointerdown',dismiss);setTimeout(function(){if(el.parentNode)el.remove();},400);}
    el.addEventListener('click',dismiss);
    setTimeout(function(){document.addEventListener('pointerdown',dismiss);},500);
    setTimeout(dismiss,8000);
  }
  function mountAssistant(){
    var el=$('#assistant');if(!el)return;
    el.innerHTML=
      '<div class="assist-dock">'+
        '<button class="assist-btn chat-btn" id="chatToggle" aria-label="Open AI Agent">'+I('agent')+'</button>'+
      '</div>'+
      '<div class="chat-panel hide" id="chatPanel">'+
        '<div class="chat-h"><span class="chat-title">'+I('agent')+' AI Agent</span><button class="btn-icon" id="chatClose" aria-label="Close">'+I('close')+'</button></div>'+
        '<div class="chat-msgs" id="chatMsgs"></div>'+
        '<div class="chat-quick" id="chatQuick">'+
          '<button class="qchip" data-q="todayOut">Today\'s spend</button>'+
          '<button class="qchip" data-q="todayIn">Today\'s income</button>'+
          '<button class="qchip" data-q="month">This month</button>'+
          '<button class="qchip" data-q="rem">Open reminders</button>'+
        '</div>'+
        '<div class="chat-in"><input id="chatText" placeholder="Type, or click the mic to speak" autocomplete="off"/>'+
          '<button class="btn-icon chat-mic" id="chatMic" aria-label="Click to speak">'+I('mic')+'</button>'+
          '<button class="btn-icon chat-send" id="chatSend" aria-label="Send">'+I('chevronRight')+'</button></div>'+
      '</div>';
    bindClickMic($('#chatMic'),$('#chatText')); // desktop: click to toggle, transcribes into the box
    $('#chatToggle').onclick=chatBot.toggle;
    $('#chatClose').onclick=chatBot.close;
    $('#chatSend').onclick=function(){var t=$('#chatText').value.trim();if(!t)return;$('#chatText').value='';handleUtterance(t);};
    $('#chatText').addEventListener('keydown',function(e){if(e.key==='Enter'){e.preventDefault();$('#chatSend').click();}});
    $all('.qchip',$('#chatPanel')).forEach(function(b){b.onclick=function(){quickQuery(b.getAttribute('data-q'));};});
  }
  // instant answers computed from loaded data (no AI round-trip)
  function quickQuery(type){
    chatBot.show();
    var labels={todayOut:"Today's spend",todayIn:"Today's income",month:"This month",rem:"Open reminders"};
    chatBot.push('user',labels[type]||'Query');chatBot.thinking(true);
    loadTx().then(function(tx){
      var today=todayStr(),m=monthKey(today);
      function sum(pred){return tx.reduce(function(s,t){return pred(t)?s+(Number(t.amount)||0):s;},0);}
      if(type==='rem'){
        return api('listReminders',{projectId:S.projectId}).then(function(d){chatBot.thinking(false);
          var open=(d.reminders||[]).filter(function(r){return r.status==='open';});
          if(!open.length){chatBot.push('bot','No open reminders. You are all caught up.');return;}
          var next=open.slice().sort(function(a,b){return String(a.dueDate).localeCompare(String(b.dueDate));})[0];
          chatBot.push('bot',open.length+' open reminder'+(open.length>1?'s':'')+'. Next: '+next.title+' on '+fmtDate(next.dueDate)+(Number(next.amount)>0?' ('+money(next.amount)+')':'')+'.');});
      }
      var msg='';
      if(type==='todayOut'){var o=sum(function(t){return t.type==='EXPENSE'&&t.category!=='LAND'&&String(t.date).slice(0,10)===today;});msg='You have spent '+money(o)+' today.';}
      else if(type==='todayIn'){var i=sum(function(t){return t.type==='INCOME'&&String(t.date).slice(0,10)===today;});msg='Income received today: '+money(i)+'.';}
      else if(type==='month'){var mi=sum(function(t){return t.type==='INCOME'&&monthKey(t.date)===m;});var me=sum(function(t){return t.type==='EXPENSE'&&t.category!=='LAND'&&monthKey(t.date)===m;});msg='This month: '+money(mi)+' in, '+money(me)+' out. Net '+money(mi-me)+'.';}
      chatBot.thinking(false);chatBot.push('bot',msg);
    }).catch(function(e){chatBot.thinking(false);chatBot.push('bot',errMsg(e));});
  }
  var chatBot={
    open:false,
    toggle:function(){chatBot.open?chatBot.close():chatBot.show();},
    show:function(){var p=$('#chatPanel');if(!p)return;p.classList.remove('hide');chatBot.open=true;var m=$('#chatMsgs');if(m&&!m.children.length)chatBot.push('bot','Hi, I am your BuildKhata AI Agent. Tell me what you paid or earned, ask me to set the land cost or add a reminder, or tap a quick question below.');setTimeout(function(){var i=$('#chatText');i&&i.focus();},60);},
    close:function(){var p=$('#chatPanel');if(p)p.classList.add('hide');chatBot.open=false;},
    push:function(who,text){var m=$('#chatMsgs');if(!m||!text)return;m.appendChild(h('<div class="msg '+who+'">'+esc(text)+'</div>'));m.scrollTop=m.scrollHeight;},
    thinking:function(on){var m=$('#chatMsgs');if(!m)return;var t=$('#chatThink');if(on){if(!t){m.appendChild(h('<div class="msg bot thinking" id="chatThink"><span class="dots"><i></i><i></i><i></i></span></div>'));m.scrollTop=m.scrollHeight;}}else if(t)t.remove();}
  };
  function bindHoldMic(btn){
    if(!btn)return;
    if(!BK.voice.supported){btn.addEventListener('click',function(){openTypeSheet('');});return;}
    var holding=false,downAt=0;
    function end(){ // release ANYWHERE stops it (the overlay sits on top of the mic button)
      if(!holding)return;holding=false;
      window.removeEventListener('pointerup',end);window.removeEventListener('pointercancel',end);
      window.removeEventListener('touchend',end);window.removeEventListener('touchcancel',end);
      btn.classList.remove('rec');
      BK.voice.stop(); // -> onDone below
    }
    function start(e){
      if(holding)return;e.preventDefault();holding=true;downAt=Date.now();
      btn.classList.add('rec');openVoiceOverlay();
      window.addEventListener('pointerup',end);window.addEventListener('pointercancel',end);
      window.addEventListener('touchend',end);window.addEventListener('touchcancel',end);
      BK.voice.start(
        function(t){updateVoiceOverlay(t);},
        function(fin){btn.classList.remove('rec');
          if(Date.now()-downAt<350&&!fin){hideVoiceOverlay();openTypeSheet('');return;} // quick tap -> type
          if(!fin){hideVoiceOverlay();toast('Did not catch that. Try again.');return;}
          setOverlayProcessing();handleUtterance(fin);},
        function(err){holding=false;btn.classList.remove('rec');hideVoiceOverlay();if(err==='not-allowed')toast('Microphone blocked. Allow access or type.','err');}
      );
    }
    btn.addEventListener('pointerdown',start);
  }
  // Click-to-toggle mic for the desktop chatbot: first click records (live transcript into
  // the input), second click stops. User reviews, then sends. No hold-release on desktop.
  function bindClickMic(btn,input){
    if(!btn||!input)return;
    if(!BK.voice.supported){btn.style.display='none';return;}
    btn.addEventListener('click',function(){
      if(BK.voice.listening){BK.voice.stop();return;}
      btn.classList.add('rec');input.placeholder='Listening... click the mic to stop';
      BK.voice.start(
        function(t){input.value=t;},
        function(fin){btn.classList.remove('rec');input.placeholder='Type, or click the mic to speak';if(fin)input.value=fin;input.focus();},
        function(err){btn.classList.remove('rec');input.placeholder='Type, or click the mic to speak';if(err==='not-allowed')toast('Microphone blocked. Allow access or type.','err');}
      );
    });
  }
  function openTypeSheet(pre){
    openSheet('What happened?','<div class="field"><textarea id="tyT" rows="2" placeholder="e.g. Paid 45 thousand to Sharma Steel today">'+esc(pre||'')+'</textarea></div>'+
      '<div class="row2"><button class="btn btn-accent" id="tyGo">'+I('sparkle')+' Understand</button><button class="btn btn-ghost" id="tyMan">'+I('edit')+' Manual form</button></div>',function(root){
      setTimeout(function(){var t=$('#tyT',root);t&&t.focus();},60);
      $('#tyGo',root).onclick=function(){var t=$('#tyT',root).value.trim();if(!t){toast('Type something first');return;}closeSheet();if(S.features.ai===false)manualConfirm(t);else handleUtterance(t);};
      $('#tyMan',root).onclick=function(){var t=$('#tyT',root).value.trim();closeSheet();manualConfirm(t);};
    });
  }
  function openVoiceOverlay(){var o=$('#voiceOverlay');if(!o)return;o.classList.remove('hide');
    o.innerHTML='<div class="vo-card"><div class="vo-mic" id="voMic">'+I('mic')+'</div><div class="vo-status" id="voStatus">Listening</div><div class="vo-text" id="voText">Speak now</div><div class="vo-hint" id="voHint">Release to save</div></div>';}
  function updateVoiceOverlay(t){var e=$('#voText');if(e)e.textContent=t||'Speak now';}
  function setOverlayProcessing(){var o=$('#voiceOverlay');if(!o||o.classList.contains('hide'))return;
    var st=$('#voStatus');if(st)st.textContent='Understanding';
    var mic=$('#voMic');if(mic){mic.classList.remove('vo-mic');mic.className='vo-mic proc';mic.innerHTML='<span class="spin"></span>';}
    var hint=$('#voHint');if(hint)hint.textContent='One moment';}
  function hideVoiceOverlay(){var o=$('#voiceOverlay');if(!o)return;o.classList.add('hide');o.innerHTML='';}

  /* ======================= LEDGER (monthly) ======================= */
  var ledFilter='all',ledFrom='',ledTo='';
  function viewLedger(v,mySeq){
    v.innerHTML=pageHead('Transactions',curProject().name||'')+
      '<div class="card">'+
        '<div class="range-bar">'+
          '<span class="seg" id="ledSeg"><button data-f="all" class="'+(ledFilter==='all'?'on':'')+'">All</button><button data-f="INCOME" class="'+(ledFilter==='INCOME'?'on':'')+'">In</button><button data-f="EXPENSE" class="'+(ledFilter==='EXPENSE'?'on':'')+'">Out</button></span>'+
          '<span class="range-dates"><input type="date" id="lFrom" aria-label="From date" value="'+ledFrom+'"/><span class="rto">to</span><input type="date" id="lTo" aria-label="To date" value="'+ledTo+'"/><button class="btn btn-ghost btn-sm" id="lClear">Clear</button></span>'+
        '</div>'+
        '<div id="txList"><div class="skeleton" style="height:220px"></div></div></div>';
    $('#ledSeg').addEventListener('click',function(e){var b=e.target.closest('button');if(!b)return;$all('#ledSeg button').forEach(function(x){x.classList.remove('on');});b.classList.add('on');ledFilter=b.getAttribute('data-f');paint();});
    $('#lFrom').onchange=function(){ledFrom=this.value;paint();};$('#lTo').onchange=function(){ledTo=this.value;paint();};
    $('#lClear').onclick=function(){ledFrom='';ledTo='';$('#lFrom').value='';$('#lTo').value='';paint();};
    loadTx().then(function(){if(alive(mySeq))paint();}).catch(function(e){toast(errMsg(e),'err');});
    function paint(){
      var rows=(S.tx||[]).filter(function(t){
        if(ledFilter!=='all'&&t.type!==ledFilter)return false;
        var d=String(t.date).slice(0,10);if(ledFrom&&d<ledFrom)return false;if(ledTo&&d>ledTo)return false;return true;});
      var el=$('#txList');if(!el)return;
      if(!rows.length){el.innerHTML='<div class="empty"><div class="ei">'+I('ledger')+'</div><h3>No entries</h3><p>Tap Add entry to record your first one.</p></div>';return;}
      // group by month
      var groups={};rows.forEach(function(t){var m=monthKey(t.date);(groups[m]=groups[m]||[]).push(t);});
      var html=Object.keys(groups).sort().reverse().map(function(m){
        var g=groups[m];var inc=0,exp=0;g.forEach(function(t){if(t.type==='INCOME')inc+=Number(t.amount)||0;else exp+=Number(t.amount)||0;});
        return '<div class="list-month"><span>'+monthLabel(m)+'</span><span>+'+money(inc)+' / -'+money(exp)+'</span></div>'+g.map(txRow).join('');
      }).join('');
      el.innerHTML=html;
      $all('.item[data-id]',el).forEach(function(it){it.onclick=function(){openTxSheet(rows.filter(function(t){return t.id===it.getAttribute('data-id');})[0]);};});
    }
  }
  function txRow(t){var out=t.type==='EXPENSE';var title=t.subCategory||(CAT[t.category]||{}).label||t.category;
    return '<div class="item" data-id="'+t.id+'"><div class="av">'+I(CI[t.category]||'box')+'</div>'+
      '<div class="meta"><div class="t">'+esc(title)+(t.note?' <span class="muted">'+esc(t.note)+'</span>':'')+'</div>'+
      '<div class="s">'+fmtDate(t.date)+' · '+(CAT[t.category]||{}).label+(t.source==='voice'?' · voice':'')+'</div></div>'+
      '<div class="amt '+(out?'out':'in')+'">'+(out?'-':'+')+money(t.amount)+'</div></div>';}
  function openTxSheet(t){if(!t)return;
    openSheet('Entry','<div class="item" style="cursor:default"><div class="av">'+I(CI[t.category]||'box')+'</div><div class="meta"><div class="t">'+esc(t.subCategory||(CAT[t.category]||{}).label)+'</div><div class="s">'+fmtDate(t.date)+'</div></div><div class="amt '+(t.type==='EXPENSE'?'out':'in')+'">'+(t.type==='EXPENSE'?'-':'+')+money(t.amount)+'</div></div>'+
      (t.note?'<p class="muted" style="margin:12px 2px">'+esc(t.note)+'</p>':'')+
      '<div class="row2" style="margin-top:14px"><button class="btn btn-ghost" id="txEdit">'+I('edit')+' Edit amount</button><button class="btn btn-danger" id="txDel">'+I('trash')+' Delete</button></div>',function(root){
        $('#txDel',root).onclick=function(){confirmSheet('Delete this entry?',function(){api('deleteTransaction',{id:t.id}).then(function(){invalidateTx();closeSheet();toast('Deleted','ok');go('ledger');}).catch(function(e){toast(errMsg(e),'err');});});};
        $('#txEdit',root).onclick=function(){var val=prompt('New amount:',t.amount);if(val==null)return;api('updateTransaction',{id:t.id,amount:Number(val)||0}).then(function(){invalidateTx();closeSheet();toast('Updated','ok');go('ledger');}).catch(function(e){toast(errMsg(e),'err');});};
      });
  }

  /* ======================= REMINDERS ======================= */
  function viewReminders(v,mySeq){
    v.innerHTML=pageHead('Reminders',curProject().name||'','<button class="btn btn-primary btn-sm" id="addRem">'+I('plus')+' New reminder</button>')+
      '<div class="card"><div id="remList"><div class="skeleton" style="height:120px"></div></div></div>';
    $('#addRem').onclick=function(){openReminderSheet();};
    loadReminders(mySeq);
  }
  function loadReminders(mySeq){
    api('listReminders',{projectId:S.projectId}).then(function(d){
      if(mySeq&&!alive(mySeq))return;var el=$('#remList');if(!el)return;
      if(!d.reminders.length){el.innerHTML='<div class="empty"><div class="ei">'+I('bell')+'</div><h3>No reminders</h3><p>Add payments you must not forget. We can email you and alert you in the app.</p></div>';return;}
      el.innerHTML=d.reminders.map(function(r){var overdue=r.status==='open'&&(String(r.dueDate).slice(0,10)<todayStr());
        return '<div class="item" style="cursor:default"><div class="av">'+I(r.status==='done'?'check':'bell')+'</div>'+
          '<div class="meta"><div class="t" style="'+(r.status==='done'?'color:var(--txt-3);text-decoration:line-through':'')+'">'+esc(r.title)+'</div>'+
          '<div class="s">'+fmtDate(r.dueDate)+' '+esc(r.time||'')+(Number(r.amount)>0?' · '+money(r.amount):'')+(r.recurrence&&r.recurrence!=='none'?' · '+esc(r.recurrence):'')+(overdue?' · <span style="color:var(--neg)">overdue</span>':'')+'</div></div>'+
          (r.status==='done'?'':'<button class="btn btn-sm btn-ghost" data-done="'+r.id+'">'+I('check')+' Done</button>')+
          '<button class="btn-icon btn-sm" data-del="'+r.id+'" style="margin-left:6px">'+I('trash')+'</button></div>';}).join('');
      $all('[data-done]',el).forEach(function(b){b.onclick=function(){api('updateReminder',{id:b.getAttribute('data-done'),status:'done'}).then(function(){loadReminders();});};});
      $all('[data-del]',el).forEach(function(b){b.onclick=function(){api('deleteReminder',{id:b.getAttribute('data-del')}).then(function(){loadReminders();toast('Deleted','ok');});};});
    }).catch(function(e){toast(errMsg(e),'err');});
  }
  function openReminderSheet(pre){
    pre=pre||{};
    openSheet('New reminder',
      '<div class="field"><label>What for?</label><input id="rT" placeholder="Pay cement vendor" value="'+esc(pre.title||'')+'"/></div>'+
      '<div class="row2"><div class="field"><label>Date</label><input id="rD" type="date" value="'+esc(pre.dueDate||todayStr())+'"/></div>'+
      '<div class="field"><label>Time</label><input id="rTime" type="time" value="'+esc(pre.time||'10:00')+'"/></div></div>'+
      '<div class="row2"><div class="field"><label>Remind before</label><select id="rBefore"><option value="0">At time</option><option value="30"'+((pre.remindBefore==null||pre.remindBefore==30)?' selected':'')+'>30 min before</option><option value="60">1 hour before</option><option value="1440">1 day before</option></select></div>'+
      '<div class="field"><label>Repeat</label><select id="rRec"><option value="none">No repeat</option><option value="daily"'+(pre.recurrence==='daily'?' selected':'')+'>Daily</option><option value="weekly"'+(pre.recurrence==='weekly'?' selected':'')+'>Weekly</option><option value="monthly"'+(pre.recurrence==='monthly'?' selected':'')+'>Monthly</option></select></div></div>'+
      '<div class="field"><label>Amount (optional)</label><input id="rA" type="number" value="'+(pre.amount||'')+'"/></div>'+
      '<button class="btn btn-primary btn-block" id="rS">'+I('bell')+' Save reminder</button>',function(root){
        if(pre.remindBefore!=null)$('#rBefore',root).value=String(pre.remindBefore);
        $('#rS',root).onclick=function(){var title=$('#rT',root).value.trim();if(!title){toast('Enter a title');return;}
          api('createReminder',{projectId:S.projectId,title:title,dueDate:$('#rD',root).value,time:$('#rTime',root).value,
            remindBefore:Number($('#rBefore',root).value)||0,recurrence:$('#rRec',root).value,amount:Number($('#rA',root).value)||0,notify:true})
            .then(function(){closeSheet();toast('Reminder set','ok');if(S.route==='reminders')loadReminders();}).catch(function(e){toast(errMsg(e),'err');});};
      });
  }

  /* ======================= VENDORS ======================= */
  function viewVendors(v,mySeq){
    v.innerHTML=pageHead('Vendors',curProject().name||'','<button class="btn btn-primary btn-sm" id="addV">'+I('plus')+' New vendor</button>')+
      '<div class="card"><div id="venList"><div class="skeleton" style="height:140px"></div></div></div>';
    $('#addV').onclick=function(){openVendorSheet();};
    api('listVendors',{projectId:S.projectId}).then(function(d){if(!alive(mySeq))return;var el=$('#venList');
      el.innerHTML=d.vendors.length?d.vendors.map(function(v){return '<div class="item" style="cursor:default"><div class="av">'+I('cube')+'</div><div class="meta"><div class="t">'+esc(v.name)+'</div><div class="s">'+esc(v.vendorType||'')+(v.phone?' · '+esc(v.phone):'')+(v.gstin?' · GST '+esc(v.gstin):'')+'</div></div></div>';}).join(''):'<div class="empty"><div class="ei">'+I('cube')+'</div><h3>No vendors yet</h3></div>';
    }).catch(function(e){toast(errMsg(e),'err');});
  }
  function openVendorSheet(){var types=lookupNames('VENDOR_TYPE');
    openSheet('New vendor','<div class="field"><label>Name</label><input id="vN" placeholder="Sharma Steel"/></div>'+
      '<div class="field"><label>Type</label><select id="vT">'+types.map(function(t){return '<option>'+esc(t)+'</option>';}).join('')+'</select></div>'+
      '<div class="row2"><div class="field"><label>Phone</label><input id="vP"/></div><div class="field"><label>GSTIN</label><input id="vG"/></div></div>'+
      '<button class="btn btn-primary btn-block" id="vS">Save vendor</button>',function(root){
        $('#vS',root).onclick=function(){var n=$('#vN',root).value.trim();if(!n){toast('Enter a name');return;}
          api('createVendor',{projectId:S.projectId,name:n,vendorType:$('#vT',root).value,phone:$('#vP',root).value.trim(),gstin:$('#vG',root).value.trim()}).then(function(){closeSheet();toast('Saved','ok');go('vendors');}).catch(function(e){toast(errMsg(e),'err');});};
      });
  }

  /* ======================= BOOKINGS ======================= */
  function viewBookings(v,mySeq){
    v.innerHTML=pageHead('Bookings',curProject().name||'','<button class="btn btn-primary btn-sm" id="addB">'+I('plus')+' New booking</button>')+
      '<div class="card"><div id="bkList"><div class="skeleton" style="height:140px"></div></div></div>';
    $('#addB').onclick=function(){openBookingSheet();};
    api('listBookings',{projectId:S.projectId}).then(function(d){if(!alive(mySeq))return;var el=$('#bkList');
      el.innerHTML=d.bookings.length?d.bookings.map(function(b){return '<div class="item" style="cursor:default"><div class="av">'+I('home')+'</div><div class="meta"><div class="t">'+esc(b.customerName)+' · '+esc(b.inventoryType)+'</div><div class="s">'+fmtDate(b.bookingDate)+' · '+esc(b.status)+'</div></div><div class="amt in">'+money(b.amount)+'</div></div>';}).join(''):'<div class="empty"><div class="ei">'+I('home')+'</div><h3>No bookings yet</h3></div>';
    }).catch(function(e){toast(errMsg(e),'err');});
  }
  function openBookingSheet(){var types=lookupNames('INVENTORY_TYPE');
    openSheet('New booking','<div class="field"><label>Customer name</label><input id="bN" placeholder="Mr. Patil"/></div>'+
      '<div class="row2"><div class="field"><label>Unit</label><select id="bT">'+types.map(function(t){return '<option>'+esc(t)+'</option>';}).join('')+'</select></div><div class="field"><label>Amount</label><input id="bA" type="number"/></div></div>'+
      '<div class="row2"><div class="field"><label>Date</label><input id="bD" type="date" value="'+todayStr()+'"/></div><div class="field"><label>Phone</label><input id="bP"/></div></div>'+
      '<p class="muted" style="font-size:12.5px">Saving also records this as project income.</p>'+
      '<button class="btn btn-primary btn-block" id="bS">Save booking</button>',function(root){
        $('#bS',root).onclick=function(){var n=$('#bN',root).value.trim();if(!n){toast('Enter a name');return;}
          api('createBooking',{projectId:S.projectId,customerName:n,inventoryType:$('#bT',root).value,amount:Number($('#bA',root).value)||0,bookingDate:$('#bD',root).value,customerPhone:$('#bP',root).value.trim()}).then(function(){invalidateTx();closeSheet();toast('Saved','ok');go('bookings');}).catch(function(e){toast(errMsg(e),'err');});};
      });
  }

  /* ======================= INVOICES ======================= */
  function viewInvoices(v,mySeq){
    v.innerHTML=pageHead('Invoices',curProject().name||'','<button class="btn btn-primary btn-sm" id="addI">'+I('plus')+' New invoice</button>')+
      '<div class="card"><div id="invList"><div class="skeleton" style="height:120px"></div></div></div>';
    $('#addI').onclick=function(){openInvoiceSheet();};
    api('listInvoices',{projectId:S.projectId}).then(function(d){if(!alive(mySeq))return;var el=$('#invList');
      el.innerHTML=d.invoices.length?d.invoices.map(function(inv){return '<div class="item" data-inv=\''+esc(JSON.stringify(inv))+'\'><div class="av">'+I('doc')+'</div><div class="meta"><div class="t">'+esc(inv.number)+' · '+esc(inv.customerName)+'</div><div class="s">'+fmtDate(inv.date)+'</div></div><div class="amt">'+money(inv.total)+'</div></div>';}).join(''):'<div class="empty"><div class="ei">'+I('doc')+'</div><h3>No invoices yet</h3></div>';
      $all('.item[data-inv]',el).forEach(function(row){row.onclick=function(){invoicePdf(JSON.parse(row.getAttribute('data-inv')));};});
    }).catch(function(e){toast(errMsg(e),'err');});
  }
  function openInvoiceSheet(){
    openSheet('New invoice','<div class="field"><label>Customer</label><input id="iN" placeholder="Mr. Patil"/></div><div id="items"></div><button class="btn btn-ghost btn-sm" id="addItem" style="margin:4px 0 14px">'+I('plus')+' Add line</button><button class="btn btn-primary btn-block" id="iS">'+I('download')+' Create &amp; download PDF</button>',function(root){
      function addItem(){root.querySelector('#items').appendChild(h('<div class="row2" style="gap:8px;margin-bottom:8px"><input placeholder="Description" class="it-d"/><div style="display:flex;gap:6px"><input type="number" placeholder="Qty" class="it-q" style="width:62px"/><input type="number" placeholder="Rate" class="it-r" style="flex:1"/></div></div>'));}
      addItem();$('#addItem',root).onclick=addItem;
      $('#iS',root).onclick=function(){var name=$('#iN',root).value.trim();if(!name){toast('Enter customer');return;}
        var items=$all('#items .row2',root).map(function(r){var q=Number($('.it-q',r).value)||0,rate=Number($('.it-r',r).value)||0;return{desc:$('.it-d',r).value.trim(),qty:q,rate:rate,amount:q*rate};}).filter(function(it){return it.desc&&it.amount;});
        if(!items.length){toast('Add at least one line');return;}
        api('createInvoice',{projectId:S.projectId,customerName:name,date:todayStr(),items:items}).then(function(d){closeSheet();toast('Invoice created','ok');invoicePdf(d.invoice);go('invoices');}).catch(function(e){toast(errMsg(e),'err');});};
    });
  }
  function invoicePdf(inv){
    if(!window.jspdf){toast('PDF engine still loading');return;}
    var items;try{items=typeof inv.items==='string'?JSON.parse(inv.items):(inv.items||[]);}catch(e){items=[];}
    var proj=curProject().name||'Project';var sym=BK.brand.currency.symbol;
    var doc=new window.jspdf.jsPDF();
    doc.setFontSize(20);doc.text('BuildKhata',14,20);doc.setFontSize(10);doc.setTextColor(120);doc.text(proj,14,27);
    doc.setTextColor(0);doc.setFontSize(14);doc.text('INVOICE '+(inv.number||''),14,40);
    doc.setFontSize(10);doc.text('Bill to: '+(inv.customerName||''),14,48);doc.text('Date: '+(inv.date||''),150,48);
    var y=62;doc.setFont(undefined,'bold');doc.text('Description',14,y);doc.text('Qty',120,y);doc.text('Rate',140,y);doc.text('Amount',196,y,{align:'right'});
    doc.setFont(undefined,'normal');y+=4;doc.line(14,y,196,y);y+=8;
    items.forEach(function(it){doc.text(String(it.desc||''),14,y);doc.text(String(it.qty||''),120,y);doc.text(String(it.rate||''),140,y);doc.text(sym+Math.round(it.amount||0),196,y,{align:'right'});y+=8;});
    y+=2;doc.line(14,y,196,y);y+=10;doc.setFont(undefined,'bold');doc.setFontSize(13);
    doc.text('Total  '+sym+Math.round(inv.total||0).toLocaleString('en-IN'),196,y,{align:'right'});
    doc.save((inv.number||'invoice')+'.pdf');
  }

  /* ======================= GST VAULT (multi-upload) ======================= */
  function viewGst(v,mySeq){
    v.innerHTML=pageHead('GST invoices',curProject().name||'',
      '<button class="btn btn-primary btn-sm" id="upG">'+I('upload')+' Upload</button>'+
      '<button class="btn btn-ghost btn-sm" id="bundleG">'+I('download')+' Bundle selected</button>')+
      '<div class="card"><div id="gstList"><div class="skeleton" style="height:140px"></div></div></div>';
    var selected={};
    $('#upG').onclick=function(){openGstUpload();};
    $('#bundleG').onclick=function(){var ids=Object.keys(selected).filter(function(k){return selected[k];});if(!ids.length){toast('Select invoices first');return;}toast('Preparing ZIP...');api('bundleGstInvoices',{ids:ids}).then(function(d){downloadBase64(d.base64,d.fileName,'application/zip');}).catch(function(e){toast(errMsg(e),'err');});};
    api('listGstInvoices',{projectId:S.projectId}).then(function(d){if(!alive(mySeq))return;var el=$('#gstList');
      if(!d.gstInvoices.length){el.innerHTML='<div class="empty"><div class="ei">'+I('folder')+'</div><h3>No GST invoices</h3><p>Upload purchase invoices from your vendors. You can upload many at once.</p></div>';return;}
      el.innerHTML=d.gstInvoices.map(function(g){return '<div class="item" style="cursor:default"><input type="checkbox" data-sel="'+g.id+'" style="width:18px;height:18px;flex:none"/><div class="meta"><div class="t">'+esc(g.number||g.fileName)+'</div><div class="s">'+fmtDate(g.date)+(Number(g.amount)>0?' · '+money(g.amount):'')+'</div></div><button class="btn btn-sm btn-ghost" data-view="'+g.id+'">View</button><button class="btn-icon btn-sm" data-del="'+g.id+'" style="margin-left:6px">'+I('trash')+'</button></div>';}).join('');
      $all('[data-sel]',el).forEach(function(c){c.onchange=function(){selected[c.getAttribute('data-sel')]=c.checked;};});
      $all('[data-view]',el).forEach(function(b){b.onclick=function(){viewGstFile(b.getAttribute('data-view'));};});
      $all('[data-del]',el).forEach(function(b){b.onclick=function(){api('deleteGstInvoice',{id:b.getAttribute('data-del')}).then(function(){go('gst');toast('Deleted','ok');});};});
    }).catch(function(e){toast(errMsg(e),'err');});
  }
  function openGstUpload(){
    api('listVendors',{projectId:S.projectId}).then(function(d){var vendors=d.vendors;
      openSheet('Upload GST invoices','<div class="field"><label>Vendor</label><select id="gV">'+(vendors.length?vendors.map(function(v){return '<option value="'+v.id+'">'+esc(v.name)+'</option>';}).join(''):'<option value="">(add a vendor first)</option>')+'</select></div>'+
        '<div class="field"><label>Files (PDF or images, up to 8MB each, multiple allowed)</label><input id="gF" type="file" accept="application/pdf,image/*" multiple/></div>'+
        '<div id="gProg" class="muted" style="font-size:13px"></div>'+
        '<button class="btn btn-primary btn-block" id="gS" style="margin-top:8px">'+I('upload')+' Upload</button>',function(root){
        $('#gS',root).onclick=function(){
          var ven=$('#gV',root).value;if(!ven){toast('Add a vendor first','err');return;}
          var files=Array.prototype.slice.call($('#gF',root).files);if(!files.length){toast('Choose file(s)');return;}
          var tooBig=files.filter(function(f){return f.size>8*1024*1024;});if(tooBig.length){toast('Some files exceed 8MB','err');return;}
          var btn=$('#gS',root);btn.disabled=true;var done=0;
          (function next(i){
            if(i>=files.length){closeSheet();toast('Uploaded '+done+' file'+(done===1?'':'s'),'ok');go('gst');return;}
            var f=files[i];$('#gProg',root).textContent='Uploading '+(i+1)+' of '+files.length+': '+f.name;
            var reader=new FileReader();
            reader.onload=function(){var b64=String(reader.result).split(',')[1];
              api('uploadGstInvoice',{projectId:S.projectId,vendorId:ven,fileName:f.name,mimeType:f.type,fileBase64:b64,date:todayStr()})
                .then(function(){done++;next(i+1);}).catch(function(e){toast(f.name+': '+errMsg(e),'err');next(i+1);});};
            reader.readAsDataURL(f);
          })(0);
        };
      });
    });
  }
  function viewGstFile(id){toast('Opening...');api('getGstFile',{id:id}).then(function(d){var url=URL.createObjectURL(base64ToBlob(d.base64,d.mimeType));window.open(url,'_blank');setTimeout(function(){URL.revokeObjectURL(url);},60000);}).catch(function(e){toast(errMsg(e),'err');});}

  /* ======================= SETTINGS (no backend URL) ======================= */
  function viewSettings(v){
    var p=curProject();
    v.innerHTML=pageHead('Settings',p.name||'')+
      '<div class="card"><div class="card-h"><h3>Project</h3><button class="btn btn-ghost btn-sm" id="newProj">'+I('plus')+' New</button></div>'+
        (S.projectId?'<div class="field"><label>Name</label><input id="pName" value="'+esc(p.name||'')+'"/></div>'+
        '<div class="field"><label>Land cost ('+BK.brand.currency.symbol+', one-time)</label><input id="pLand" type="number" value="'+(p.landCost||0)+'"/></div>'+
        '<button class="btn btn-primary" id="pSave">'+I('check')+' Save project</button>':'<p class="muted">Create a project to begin.</p>')+'</div>'+
      '<div class="card"><div class="card-h"><h3>Categories</h3><span class="sub">Add your own types</span></div>'+
        '<div class="row2"><button class="btn btn-ghost btn-sm" data-add="VENDOR_TYPE">'+I('plus')+' Vendor type</button><button class="btn btn-ghost btn-sm" data-add="SALARY_ROLE">'+I('plus')+' Salary role</button></div>'+
        '<div class="row2" style="margin-top:8px"><button class="btn btn-ghost btn-sm" data-add="INVENTORY_TYPE">'+I('plus')+' Unit type</button><button class="btn btn-ghost btn-sm" data-add="MISC_TYPE">'+I('plus')+' Misc type</button></div></div>'+
      '<div class="card"><div class="card-h"><h3>Voice language</h3><span class="sub">for speaking entries</span></div>'+
        '<div class="field"><label>Recognise my voice in</label><select id="langSel">'+
        [['en-IN','English (India)'],['hi-IN','Hindi'],['mr-IN','Marathi'],['gu-IN','Gujarati'],['bn-IN','Bengali'],['ta-IN','Tamil'],['te-IN','Telugu'],['kn-IN','Kannada'],['pa-IN','Punjabi'],['en-US','English (US)']]
          .map(function(l){var cur='en-IN';try{cur=localStorage.getItem('bk_lang')||'en-IN';}catch(e){}return '<option value="'+l[0]+'"'+(cur===l[0]?' selected':'')+'>'+l[1]+'</option>';}).join('')+
        '</select></div><p class="muted" style="font-size:12.5px;margin-top:-4px">Speak in this language. The AI also understands mixed language (for example Hinglish).</p></div>'+
      '<div class="card"><div class="card-h"><h3>Daily email report</h3></div>'+
        (S.features.email?'':'<p class="muted" style="font-size:13px;margin-top:-8px">Add a Resend key on the server to enable email.</p>')+
        '<div class="field"><label>Send to</label><input id="rEmail" type="email" value="'+esc(S.user?S.user.email:'')+'"/></div>'+
        '<div class="row2"><div class="field"><label>Hour (0-23)</label><input id="rHour" type="number" min="0" max="23" value="20"/></div>'+
        '<div class="field" style="display:flex;align-items:flex-end"><button class="btn btn-primary btn-block" id="rEnable"'+(S.features.email?'':' disabled')+'>Enable</button></div></div></div>'+
      '<div class="card"><div class="card-h"><h3>Account</h3></div><p class="muted" style="font-size:13.5px;margin-top:-8px">Signed in as <b>'+esc(S.user?S.user.email:'')+'</b></p>'+
        '<button class="btn btn-danger" id="lo">'+I('logout')+' Log out</button></div>';
    if(S.projectId)$('#pSave').onclick=function(){api('updateProject',{id:S.projectId,name:$('#pName').value.trim(),landCost:Number($('#pLand').value)||0}).then(function(d){S.projects=S.projects.map(function(x){return x.id===d.project.id?d.project:x;});toast('Saved','ok');syncProjSel();}).catch(function(e){toast(errMsg(e),'err');});};
    $('#newProj').onclick=openProjectSheet;
    $('#langSel').onchange=function(){try{localStorage.setItem('bk_lang',this.value);}catch(e){}toast('Voice language set','ok');};
    $all('[data-add]').forEach(function(b){b.onclick=function(){addLookupPrompt(b.getAttribute('data-add'),null);};});
    $('#rEnable').onclick=function(){api('configureDailyReport',{enabled:true,email:$('#rEmail').value.trim(),hour:Number($('#rHour').value)}).then(function(){toast('Daily report enabled','ok');}).catch(function(e){toast(errMsg(e),'err');});};
    $('#lo').onclick=logout;
  }
  function openProjectSheet(){
    openSheet('New project','<div class="field"><label>Project / site name</label><input id="npN" placeholder="Riverside Towers"/></div><div class="field"><label>Land cost (optional)</label><input id="npL" type="number"/></div><button class="btn btn-primary btn-block" id="npS">Create project</button>',function(root){
      $('#npS',root).onclick=function(){var n=$('#npN',root).value.trim();if(!n){toast('Enter a name');return;}
        api('createProject',{name:n,landCost:Number($('#npL',root).value)||0}).then(function(d){S.projects.push(d.project);setProjId(d.project.id);invalidateTx();closeSheet();toast('Created','ok');loadLookups().then(function(){go('dashboard');});}).catch(function(e){toast(errMsg(e),'err');});};
    });
  }

  /* ======================= MORE MENU (mobile) ======================= */
  function openMoreMenu(){
    var items=[['bookings','home','Bookings'],['vendors','cube','Vendors'],['invoices','doc','Invoices'],['gst','folder','GST invoices'],['settings','settings','Settings']];
    openSheet('More',items.map(function(it){return '<button class="btn btn-ghost btn-block" data-m="'+it[0]+'" style="justify-content:flex-start;margin-bottom:8px">'+I(it[1])+' '+it[2]+'</button>';}).join('')+'<button class="btn btn-danger btn-block" id="mLo" style="margin-top:6px">'+I('logout')+' Log out</button>',function(root){
      $all('[data-m]',root).forEach(function(b){b.onclick=function(){closeSheet();go(b.getAttribute('data-m'));};});
      $('#mLo',root).onclick=logout;
    });
  }

  /* ======================= REPORT PDF / EMAIL ======================= */
  var _lastSummary=null;
  function exportReportPdf(){
    if(!_lastSummary||!window.jspdf){toast('Nothing to export yet');return;}
    var s=_lastSummary,sym=BK.brand.currency.symbol,doc=new window.jspdf.jsPDF();
    doc.setFontSize(20);doc.text('BuildKhata',14,20);doc.setFontSize(12);doc.setTextColor(90);
    doc.text(curProject().name+(s.range.from?'  ('+s.range.from+' to '+s.range.to+')':''),14,28);doc.setTextColor(0);var y=44;
    function line(l,val,col){doc.setFontSize(12);if(col)doc.setTextColor.apply(doc,col);doc.text(l,14,y);doc.text(sym+Math.round(val).toLocaleString('en-IN'),196,y,{align:'right'});doc.setTextColor(0);y+=10;}
    line('Income (period)',s.period.income,[31,157,107]);line('Expense (period)',s.period.expense,[220,91,87]);line('Net (period)',s.period.net);
    y+=4;doc.setFontSize(11);doc.setTextColor(120);doc.text('Expense by category',14,y);doc.setTextColor(0);y+=8;
    Object.keys(s.period.byCategory).forEach(function(k){line('  '+prettyCat(k),s.period.byCategory[k]);});
    y+=4;doc.line(14,y,196,y);y+=10;line('Land cost',s.totals.landCost);
    doc.setFont(undefined,'bold');line('Profit (lifetime)  '+Math.round(s.totals.profitRatio*100)+'%',s.totals.profit);
    doc.save('buildkhata-report.pdf');
  }
  function emailReportFlow(){
    if(!S.features.email){toast('Email is off. Add a Resend key on the server.','err');return;}
    var to=prompt('Send report to which email?',S.user?S.user.email:'');if(!to)return;
    var b=rangeBounds();
    api('sendReportNow',{projectId:S.projectId,to:to,from:b.from,until:b.to}).then(function(){toast('Report sent','ok');}).catch(function(e){toast(errMsg(e),'err');});
  }

  /* ======================= NOTIFICATIONS (email set server-side; in-app here) ======================= */
  var shownReminders={};
  function startNotifications(){
    if('Notification'in window&&Notification.permission==='default'){try{Notification.requestPermission();}catch(e){}}
    notifyCheck();setInterval(notifyCheck,60000);
  }
  function notifyCheck(){
    if(!S.projectId)return;
    api('dueReminders',{projectId:S.projectId}).then(function(d){
      (d.due||[]).forEach(function(r){
        if(shownReminders[r.id])return;shownReminders[r.id]=true;
        var body=fmtDate(r.dueDate)+' '+(r.time||'')+(Number(r.amount)>0?' · '+money(r.amount):'');
        toast('Reminder: '+r.title);
        if('Notification'in window&&Notification.permission==='granted'){try{new Notification('BuildKhata reminder',{body:r.title+'\n'+body,icon:'assets/icons/icon-192.png'});}catch(e){}}
      });
    }).catch(function(){});
  }

  /* ======================= SHEET / CONFIRM / FILE UTILS ======================= */
  function openSheet(title,body,onReady){
    var root=$('#modal-root');
    root.innerHTML='<div class="sheet-bg" id="sbg"><div class="sheet"><div class="sheet-h"><h3>'+esc(title)+'</h3><button class="btn-icon" id="sX" aria-label="Close">'+I('close')+'</button></div><div class="sheet-body" id="sBody">'+body+'</div></div></div>';
    $('#sX').onclick=closeSheet;$('#sbg').onclick=function(e){if(e.target.id==='sbg')closeSheet();};
    onReady&&onReady(root);
  }
  function closeSheet(){$('#modal-root').innerHTML='';}
  function confirmSheet(msg,onYes){
    openSheet('Please confirm','<p style="margin:0 0 18px">'+esc(msg)+'</p><div class="row2"><button class="btn btn-ghost" id="cN">Cancel</button><button class="btn btn-danger" id="cY">Confirm</button></div>',function(root){
      $('#cN',root).onclick=closeSheet;$('#cY',root).onclick=function(){closeSheet();onYes();};});
  }
  function commandConfirm(title,msg,action,okMsg,after){
    openSheet(title,'<p style="margin:0 0 18px">'+msg+'</p><div class="row2"><button class="btn btn-ghost" id="cN">Cancel</button><button class="btn btn-primary" id="cY">'+I('check')+' Yes</button></div>',function(root){
      $('#cN',root).onclick=closeSheet;
      $('#cY',root).onclick=function(){var btn=$('#cY',root);btn.disabled=true;btn.innerHTML='<span class="spin"></span>';
        Promise.resolve(action()).then(function(){closeSheet();toast(okMsg||'Done','ok');syncProjSel();after?after():(S.route==='dashboard'&&go('dashboard'));}).catch(function(e){btn.disabled=false;btn.innerHTML=I('check')+' Yes';toast(errMsg(e),'err');});};
    });
  }
  function base64ToBlob(b64,mime){var bin=atob(b64),len=bin.length,arr=new Uint8Array(len);for(var i=0;i<len;i++)arr[i]=bin.charCodeAt(i);return new Blob([arr],{type:mime||'application/octet-stream'});}
  function downloadBase64(b64,name,mime){var url=URL.createObjectURL(base64ToBlob(b64,mime));var a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(function(){URL.revokeObjectURL(url);},60000);}

  /* ======================= START ======================= */
  function start(){
    if(BK.api.isAuthed()&&BK.apiBase()){
      api('me',{}).then(function(u){S.user={email:u.email,role:u.role};boot();}).catch(function(e){renderAuth(e.code==='UNAUTHORIZED'?'Please sign in.':'');});
    }else{renderAuth('');}
    if('serviceWorker'in navigator)navigator.serviceWorker.register('sw.js').catch(function(){});
  }
  start();
})();
