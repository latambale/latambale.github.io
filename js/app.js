/* app.js — BuildKhata CRM single-page app.
 * Renders into #auth-root / #app / #modal-root. Talks to the backend via BK.api.
 * Kept framework-free on purpose (see CLAUDE.md rule 2). */
(function () {
  'use strict';
  var api = function (a, p) { return BK.api.call(a, p); };
  var money = BK.money;

  // ---------- tiny DOM helpers ----------
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]; }); }
  function h(html) { var t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; }
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $all(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  var toastT;
  function toast(msg, isErr) {
    var el = $('#toast'); el.textContent = msg; el.className = isErr ? 'err show' : 'show';
    clearTimeout(toastT); toastT = setTimeout(function () { el.className = el.className.replace('show', '').trim(); }, 2600);
  }
  function fmtDate(d) { try { return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }); } catch (e) { return d; } }
  function todayStr() { var d = new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function errMsg(e) { return (e && e.message) || 'Something went wrong'; }

  // ---------- state ----------
  var S = {
    user: null, route: 'dashboard',
    projects: [], projectId: null, lookups: null, features: { ai: true, email: false }
  };
  function getProjId() { try { return localStorage.getItem('bk_proj') || null; } catch (e) { return null; } }
  function setProjId(id) { S.projectId = id; try { localStorage.setItem('bk_proj', id); } catch (e) {} }

  var CAT = {
    BOOKING: { label: 'Booking', icon: '🏠', lookup: 'INVENTORY_TYPE' },
    VENDOR: { label: 'Vendor', icon: '🧱', lookup: 'VENDOR_TYPE' },
    SALARY: { label: 'Salary', icon: '👷', lookup: 'SALARY_ROLE' },
    MISC: { label: 'Miscellaneous', icon: '📦', lookup: 'MISC_TYPE' },
    LAND: { label: 'Land cost', icon: '🏞️', lookup: null },
    CHALLAN: { label: 'Challan / Sanction', icon: '📄', lookup: null }
  };

  /* ========================================================= AUTH ===== */
  function renderAuth(msg) {
    $('#app').classList.add('hide');
    var root = $('#auth-root'); root.classList.remove('hide');
    root.innerHTML = '';
    var hasBackend = !!BK.apiBase();
    var card = h(
      '<div class="auth"><div class="auth-card">' +
      '<div class="auth-brand"><img src="assets/icons/icon.svg" alt=""/> BuildKhata</div>' +
      '<h1>Welcome back</h1><p class="sub">Sign in to your builder\'s ledger.</p>' +
      (msg ? '<div class="auth-err">' + esc(msg) + '</div>' : '') +
      '<form id="loginForm">' +
      '<div class="field"><label>Email</label><input id="liEmail" type="email" autocomplete="username" required placeholder="you@example.com"/></div>' +
      '<div class="field"><label>Password</label><input id="liPass" type="password" autocomplete="current-password" required placeholder="••••••••"/></div>' +
      '<button class="btn btn-dark btn-block" type="submit" id="liBtn">Sign in</button>' +
      '</form>' +
      '<details class="auth-adv" ' + (hasBackend ? '' : 'open') + '><summary>Backend connection</summary>' +
      '<div class="field" style="margin-top:12px"><label>Apps Script Web App URL (/exec)</label>' +
      '<input id="liApi" type="url" placeholder="https://script.google.com/macros/s/.../exec" value="' + esc(BK.apiBase()) + '"/>' +
      '<p class="muted" style="font-size:12px;margin:8px 0 0">Saved only in this browser. See docs/SETUP.md.</p></div></details>' +
      '<p class="muted" style="font-size:12.5px;margin-top:18px"><a href="index.html">← Back to site</a></p>' +
      '</div></div>'
    );
    root.appendChild(card);
    $('#loginForm').addEventListener('submit', function (e) {
      e.preventDefault();
      var apiUrl = $('#liApi').value.trim();
      if (apiUrl) BK.setApiBase(apiUrl);
      if (!BK.apiBase()) { renderAuth('Please enter your backend URL first.'); return; }
      var btn = $('#liBtn'); btn.disabled = true; btn.innerHTML = '<span class="spin"></span>';
      BK.api.login($('#liEmail').value.trim(), $('#liPass').value)
        .then(function (user) { S.user = user; boot(); })
        .catch(function (err) { renderAuth(err.code === 'NETWORK' ? 'Cannot reach backend — check the URL.' : errMsg(err)); });
    });
  }

  function logout() { BK.api.logout(); S.user = null; location.reload(); }

  /* ========================================================= BOOT ===== */
  function boot() {
    $('#auth-root').classList.add('hide');
    $('#app').classList.remove('hide');
    renderShellChrome();
    Promise.all([api('getSettings', {}).catch(function () { return { features: {} }; }), api('listProjects', {})])
      .then(function (res) {
        S.features = res[0].features || S.features;
        S.projects = res[1].projects || [];
        var saved = getProjId();
        var active = S.projects.filter(function (p) { return p.status !== 'archived'; });
        S.projectId = (saved && S.projects.some(function (p) { return p.id === saved; })) ? saved : (active[0] && active[0].id) || (S.projects[0] && S.projects[0].id) || null;
        if (S.projectId) setProjId(S.projectId);
        return S.projectId ? loadLookups() : null;
      })
      .then(function () { go(S.route); })
      .catch(function (err) {
        if (err.code === 'UNAUTHORIZED') renderAuth('Session expired — please sign in.');
        else toast(errMsg(err), true);
      });
  }

  function loadLookups() {
    return api('listLookups', { projectId: S.projectId }).then(function (d) { S.lookups = d.lookups; });
  }
  function lookupNames(kind) { return (S.lookups && S.lookups[kind] ? S.lookups[kind] : []).map(function (x) { return x.name; }); }

  /* ================================================ SHELL (chrome) ===== */
  function renderShellChrome() {
    var app = $('#app');
    app.innerHTML =
      '<div class="topbar">' +
      '<span class="tb-brand"><img src="assets/icons/icon.svg" alt=""/> BuildKhata</span>' +
      '<select class="proj-select" id="projSelect" aria-label="Project"></select>' +
      '<button class="icon-btn" id="btnSettings" title="Settings" aria-label="Settings">⚙️</button>' +
      '</div>' +
      '<div id="viewRoot"></div>' +
      tabbarHtml();
    $('#btnSettings').addEventListener('click', function () { go('settings'); });
    bindTabs();
  }

  function tabbarHtml() {
    function tab(id, label, svg, fab) {
      if (fab) return '<button class="tab fab" data-go="add" aria-label="Add entry"><span class="fab-btn">' + svg + '</span></button>';
      return '<button class="tab" data-go="' + id + '">' + svg + '<span>' + label + '</span></button>';
    }
    var I = {
      dash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="8" height="8" rx="2"/><rect x="13" y="3" width="8" height="5" rx="2"/><rect x="13" y="11" width="8" height="10" rx="2"/><rect x="3" y="13" width="8" height="8" rx="2"/></svg>',
      ledger: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h16v16H4z"/><path d="M8 8h8M8 12h8M8 16h5"/></svg>',
      mic: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 2a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"/><path d="M19 10v1a7 7 0 0 1-14 0v-1"/><path d="M12 18v4"/></svg>',
      bell: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/></svg>',
      more: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/></svg>'
    };
    return '<nav class="tabbar">' +
      tab('dashboard', 'Home', I.dash) +
      tab('ledger', 'Ledger', I.ledger) +
      tab('add', '', I.mic, true) +
      tab('reminders', 'Reminders', I.bell) +
      tab('more', 'More', I.more) +
      '</nav>';
  }
  function bindTabs() {
    $all('.tab').forEach(function (t) { t.addEventListener('click', function () { go(t.getAttribute('data-go')); }); });
  }
  function setActiveTab(route) {
    var map = { dashboard: 'dashboard', ledger: 'ledger', add: 'add', reminders: 'reminders' };
    $all('.tab').forEach(function (t) {
      var g = t.getAttribute('data-go');
      t.classList.toggle('active', map[route] === g);
    });
  }

  function syncProjectSelect() {
    var sel = $('#projSelect'); if (!sel) return;
    sel.innerHTML = S.projects.map(function (p) {
      return '<option value="' + p.id + '"' + (p.id === S.projectId ? ' selected' : '') + '>' + esc(p.name) + (p.status === 'archived' ? ' (archived)' : '') + '</option>';
    }).join('') + '<option value="__new">+ New project…</option>';
    sel.onchange = function () {
      if (sel.value === '__new') { sel.value = S.projectId || ''; openProjectSheet(); return; }
      setProjId(sel.value); loadLookups().then(function () { go(S.route); });
    };
  }

  /* ================================================= ROUTER / VIEWS ==== */
  var chart1, chart2; // dashboard chart instances
  function destroyCharts() { [chart1, chart2].forEach(function (c) { try { c && c.destroy(); } catch (e) {} }); chart1 = chart2 = null; }

  function go(route) {
    S.route = route;
    destroyCharts();
    setActiveTab(route);
    syncProjectSelect();
    var root = $('#viewRoot');
    if (!root) { renderShellChrome(); root = $('#viewRoot'); }

    if (!S.projectId && route !== 'settings') { root.innerHTML = noProjectHtml(); $('#npCreate') && ($('#npCreate').onclick = openProjectSheet); return; }
    if (route === 'more') { openMoreMenu(); S.route = 'dashboard'; setActiveTab('dashboard'); return; }

    root.innerHTML = '<div class="view enter" id="view"></div>';
    var v = $('#view');
    ({
      dashboard: viewDashboard, ledger: viewLedger, add: viewAdd, reminders: viewReminders,
      vendors: viewVendors, bookings: viewBookings, invoices: viewInvoices, gst: viewGst, settings: viewSettings
    }[route] || viewDashboard)(v);
  }

  function noProjectHtml() {
    return '<div class="view"><div class="empty"><div class="big">🏗️</div>' +
      '<h2 style="margin:0 0 6px">Create your first project</h2>' +
      '<p>Every entry belongs to a project (a site). Add one to begin.</p>' +
      '<button class="btn btn-dark" id="npCreate" style="margin-top:12px">+ New project</button></div></div>';
  }

  /* ---------------- DASHBOARD ---------------- */
  function viewDashboard(v) {
    v.innerHTML = '<div class="view-title">Dashboard</div>' +
      '<div class="card"><div class="kpis" id="kpis">' + skelKpis() + '</div></div>' +
      '<div class="card"><div class="card-h"><h3>Cashflow</h3><span class="seg" id="rangeSeg">' +
      '<button data-r="30">30d</button><button data-r="90" class="on">90d</button><button data-r="365">1y</button><button data-r="0">All</button></span></div>' +
      '<canvas id="trendChart" height="180"></canvas></div>' +
      '<div class="card"><div class="card-h"><h3>Where the money went</h3></div><canvas id="catChart" height="200"></canvas><div id="catLegend" style="margin-top:12px"></div></div>' +
      '<div class="card"><div class="card-h"><h3>Projection (next 6 months)</h3></div><div id="projBox" class="muted">—</div></div>' +
      '<div class="row2" style="margin-top:14px"><button class="btn btn-ghost" id="dlReport">⬇ Export PDF</button><button class="btn btn-ghost" id="emailReport">✉ Email report</button></div>';

    $('#rangeSeg').addEventListener('click', function (e) {
      if (e.target.tagName !== 'BUTTON') return;
      $all('#rangeSeg button').forEach(function (b) { b.classList.remove('on'); });
      e.target.classList.add('on');
      loadDashboard(Number(e.target.getAttribute('data-r')));
    });
    $('#dlReport').onclick = function () { exportReportPdf(); };
    $('#emailReport').onclick = function () { emailReportFlow(); };
    loadDashboard(90);
  }
  function skelKpis() { return '<div class="skeleton" style="height:70px"></div><div class="skeleton" style="height:70px"></div><div class="skeleton" style="height:90px;grid-column:1/-1"></div>'; }

  var _lastSummary = null;
  function loadDashboard(days) {
    var range = rangeFromDays(days);
    api('summary', { projectId: S.projectId, from: range.from, to: range.to }).then(function (d) {
      var s = d.summary; _lastSummary = s;
      renderKpis(s); renderTrend(s); renderCategoryChart(s); renderProjection(s);
    }).catch(function (e) { toast(errMsg(e), true); });
  }
  function rangeFromDays(days) {
    if (!days) return { from: '', to: '' };
    var to = new Date(), from = new Date(); from.setDate(to.getDate() - days);
    return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
  }
  function renderKpis(s) {
    var p = s.period, t = s.totals;
    $('#kpis').innerHTML =
      '<div class="kpi income"><div class="lab">Income (period)</div><div class="val">' + money(p.income) + '</div></div>' +
      '<div class="kpi expense"><div class="lab">Expense (period)</div><div class="val">' + money(p.expense) + '</div></div>' +
      '<div class="kpi profit"><span class="ratio">' + Math.round(t.profitRatio * 100) + '% margin</span>' +
      '<div class="lab">Profit (lifetime, incl. land ' + money(t.landCost) + ')</div>' +
      '<div class="val">' + money(t.profit) + '</div></div>';
  }
  function renderTrend(s) {
    var ctx = $('#trendChart'); if (!ctx || !window.Chart) return;
    var labels = s.period.byMonth.map(function (m) { return m.month; });
    if (!labels.length) { ctx.parentNode.insertBefore(h('<div class="empty" style="padding:20px">No data in this range yet.</div>'), ctx); ctx.style.display = 'none'; return; }
    chart1 = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [
          { label: 'Income', data: s.period.byMonth.map(function (m) { return m.income; }), backgroundColor: '#2FA37C', borderRadius: 6, maxBarThickness: 26 },
          { label: 'Expense', data: s.period.byMonth.map(function (m) { return m.expense; }), backgroundColor: '#E05A5A', borderRadius: 6, maxBarThickness: 26 }
        ]
      },
      options: chartOpts({ legend: true })
    });
  }
  var PIE = ['#0B0B0C', '#5B8DEF', '#2FA37C', '#E05A5A', '#D9A441', '#8B5CF6', '#64748B', '#EC4899', '#14B8A6'];
  function renderCategoryChart(s) {
    var ctx = $('#catChart'); if (!ctx || !window.Chart) return;
    var byVt = s.period.byVendorType, byCat = s.period.byCategory;
    var data = Object.keys(byVt).length ? byVt : byCat;
    var labels = Object.keys(data);
    if (!labels.length) { $('#catLegend').innerHTML = '<div class="empty" style="padding:10px">No expenses in this range.</div>'; ctx.style.display = 'none'; return; }
    var vals = labels.map(function (k) { return data[k]; });
    chart2 = new Chart(ctx, {
      type: 'doughnut',
      data: { labels: labels.map(prettyCat), datasets: [{ data: vals, backgroundColor: labels.map(function (_, i) { return PIE[i % PIE.length]; }), borderWidth: 2, borderColor: '#fff' }] },
      options: { cutout: '62%', plugins: { legend: { display: false }, tooltip: { callbacks: { label: function (c) { return ' ' + money(c.raw); } } } } }
    });
    var total = vals.reduce(function (a, b) { return a + b; }, 0);
    $('#catLegend').innerHTML = labels.map(function (k, i) {
      return '<div style="display:flex;align-items:center;gap:8px;padding:4px 0;font-size:13.5px">' +
        '<span style="width:10px;height:10px;border-radius:3px;background:' + PIE[i % PIE.length] + '"></span>' +
        '<span style="flex:1">' + esc(prettyCat(k)) + '</span><b>' + money(data[k]) + '</b>' +
        '<span class="muted" style="width:44px;text-align:right">' + Math.round(data[k] / total * 100) + '%</span></div>';
    }).join('');
  }
  function prettyCat(k) { return CAT[k] ? CAT[k].label : k; }
  function renderProjection(s) {
    var pr = s.projection;
    $('#projBox').innerHTML = '<div style="font-size:14px">Based on your history, average net per month is <b style="color:' + (pr.monthlyNetAvg >= 0 ? 'var(--income)' : 'var(--expense)') + '">' + money(pr.monthlyNetAvg) + '</b>.</div>' +
      '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:10px">' + pr.series.map(function (x) {
        return '<span class="pill">' + x.month + ': <b>' + money(x.cumulative) + '</b></span>';
      }).join('') + '</div>';
  }
  function chartOpts(o) {
    return {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: !!o.legend, position: 'bottom', labels: { boxWidth: 12, font: { size: 12 } } },
        tooltip: { callbacks: { label: function (c) { return c.dataset.label + ': ' + money(c.raw); } } } },
      scales: { x: { grid: { display: false } }, y: { ticks: { callback: function (v) { return BK.brand.currency.symbol + (v >= 1000 ? (v / 1000) + 'k' : v); } }, grid: { color: '#F0F0F4' } } }
    };
  }

  /* ---------------- ADD ENTRY (voice) ---------------- */
  function viewAdd(v) {
    var canVoice = BK.voice.supported && S.features.ai !== false;
    v.innerHTML = '<div class="view-title">Add entry</div>' +
      '<div class="card"><div class="mic-wrap">' +
      '<button class="mic-big" id="micBtn" ' + (BK.voice.supported ? '' : 'disabled') + '>' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 2a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"/><path d="M19 10v1a7 7 0 0 1-14 0v-1"/><path d="M12 18v4"/></svg></button>' +
      '<div class="mic-hint" id="micHint">' + (BK.voice.supported ? 'Tap and say what you paid or received today' : 'Voice isn\'t supported here — type below') + '</div>' +
      '</div>' +
      '<div class="field" style="margin-top:14px"><textarea id="entryText" rows="2" placeholder="e.g. Paid 45 thousand to Sharma Steel today"></textarea></div>' +
      '<div class="row2"><button class="btn btn-accent" id="parseBtn">✨ Understand</button><button class="btn btn-ghost" id="manualBtn">Enter manually</button></div>' +
      (S.features.ai === false ? '<p class="muted" style="font-size:12.5px;margin-top:10px">AI parsing is off on the backend — use manual entry.</p>' : '') +
      '</div><div id="parsedBox"></div>';

    var txt = $('#entryText');
    var micBtn = $('#micBtn');
    if (BK.voice.supported) micBtn.onclick = function () {
      if (BK.voice.listening) { BK.voice.stop(); return; }
      micBtn.classList.add('rec'); $('#micHint').textContent = 'Listening… tap to stop';
      BK.voice.start(
        function (t) { txt.value = t; },
        function (finalText) { micBtn.classList.remove('rec'); $('#micHint').textContent = 'Tap to speak again'; if (finalText && S.features.ai !== false) doParse(finalText); },
        function (err) { micBtn.classList.remove('rec'); $('#micHint').textContent = err === 'not-allowed' ? 'Microphone blocked — allow access or type' : 'Could not hear that — try typing'; }
      );
    };
    $('#parseBtn').onclick = function () { var t = txt.value.trim(); if (!t) { toast('Say or type something first'); return; } doParse(t); };
    $('#manualBtn').onclick = function () { showConfirm({ type: 'EXPENSE', category: 'VENDOR', subCategory: '', vendorName: '', amount: 0, rate: 0, quantity: 0, unit: '', date: todayStr(), note: '', confidence: 1 }, txt.value.trim(), false); };
  }
  function doParse(text) {
    if (S.features.ai === false) { showConfirm({ type: 'EXPENSE', category: 'VENDOR', subCategory: '', vendorName: '', amount: 0, date: todayStr(), note: text }, text, false); return; }
    var box = $('#parsedBox'); box.innerHTML = '<div class="card"><div class="skeleton" style="height:120px"></div></div>';
    api('parseEntry', { text: text, projectId: S.projectId }).then(function (d) { showConfirm(d.suggestion, text, true); })
      .catch(function (e) {
        box.innerHTML = '';
        if (e.code === 'AI_DISABLED') { toast('Voice parsing off — enter manually'); showConfirm({ type: 'EXPENSE', category: 'VENDOR', amount: 0, date: todayStr(), note: text }, text, false); }
        else toast(errMsg(e), true);
      });
  }
  function showConfirm(sg, rawText, fromAi) {
    var box = $('#parsedBox');
    var cats = Object.keys(CAT);
    box.innerHTML = '<div class="card parsed enter">' +
      '<div class="card-h"><h3>' + (fromAi ? 'Is this right?' : 'New entry') + '</h3>' +
      (fromAi ? '<span class="pill">AI ' + Math.round((sg.confidence || 0) * 100) + '%</span>' : '') + '</div>' +
      '<div class="row2"><div class="field"><label>Type</label><select id="cType"><option value="EXPENSE"' + (sg.type !== 'INCOME' ? ' selected' : '') + '>Money out</option><option value="INCOME"' + (sg.type === 'INCOME' ? ' selected' : '') + '>Money in</option></select></div>' +
      '<div class="field"><label>Category</label><select id="cCat">' + cats.map(function (c) { return '<option value="' + c + '"' + (sg.category === c ? ' selected' : '') + '>' + CAT[c].label + '</option>'; }).join('') + '</select></div></div>' +
      '<div class="field" id="subWrap"></div>' +
      '<div class="field" id="vendorWrap"></div>' +
      '<div class="row2"><div class="field"><label>Amount (₹)</label><input id="cAmt" type="number" inputmode="decimal" value="' + (sg.amount || '') + '"/></div>' +
      '<div class="field"><label>Date</label><input id="cDate" type="date" value="' + esc(sg.date || todayStr()) + '"/></div></div>' +
      '<details style="margin-bottom:12px"><summary class="muted" style="font-size:13px;cursor:pointer">Rate / quantity (optional)</summary>' +
      '<div class="row2" style="margin-top:10px"><div class="field"><label>Rate</label><input id="cRate" type="number" value="' + (sg.rate || '') + '"/></div>' +
      '<div class="field"><label>Qty &amp; unit</label><div style="display:flex;gap:8px"><input id="cQty" type="number" value="' + (sg.quantity || '') + '" style="flex:1"/><input id="cUnit" placeholder="bags" value="' + esc(sg.unit || '') + '" style="flex:1"/></div></div></div></details>' +
      '<div class="field"><label>Note</label><input id="cNote" value="' + esc(sg.note || '') + '"/></div>' +
      '<button class="btn btn-dark btn-block" id="saveTx">Save entry</button></div>';

    function refreshSub() {
      var cat = $('#cCat').value, sub = $('#subWrap'), ven = $('#vendorWrap');
      var lk = CAT[cat].lookup;
      if (lk) {
        var opts = lookupNames(lk);
        sub.innerHTML = '<label>' + (cat === 'SALARY' ? 'Role' : cat === 'BOOKING' ? 'Unit type' : 'Type') + '</label>' +
          '<select id="cSub">' + opts.map(function (o) { return '<option' + (String(sg.subCategory).toLowerCase() === o.toLowerCase() ? ' selected' : '') + '>' + esc(o) + '</option>'; }).join('') +
          '<option value="__new">+ Add new…</option></select>';
        sub.classList.remove('hide');
        $('#cSub').onchange = function () { if (this.value === '__new') { addLookupPrompt(lk, this); } };
      } else { sub.innerHTML = ''; }
      ven.innerHTML = (cat === 'VENDOR') ? '<label>Vendor name</label><input id="cVendor" placeholder="e.g. Sharma Steel" value="' + esc(sg.vendorName || '') + '"/>' : '';
    }
    $('#cCat').onchange = refreshSub; refreshSub();

    $('#saveTx').onclick = function () {
      var payload = {
        projectId: S.projectId, type: $('#cType').value, category: $('#cCat').value,
        subCategory: $('#cSub') ? $('#cSub').value : '', vendorName: $('#cVendor') ? $('#cVendor').value.trim() : '',
        amount: Number($('#cAmt').value) || 0, rate: Number($('#cRate') && $('#cRate').value) || 0,
        quantity: Number($('#cQty') && $('#cQty').value) || 0, unit: ($('#cUnit') && $('#cUnit').value) || '',
        date: $('#cDate').value || todayStr(), note: $('#cNote').value.trim(),
        source: fromAi ? 'voice' : 'manual', rawText: rawText || ''
      };
      if (!(payload.amount > 0)) { toast('Enter an amount', true); return; }
      var btn = $('#saveTx'); btn.disabled = true; btn.innerHTML = '<span class="spin"></span>';
      api('createTransaction', payload).then(function () {
        toast('Saved ✓'); $('#parsedBox').innerHTML = ''; $('#entryText').value = '';
      }).catch(function (e) { btn.disabled = false; btn.textContent = 'Save entry'; toast(errMsg(e), true); });
    };
  }
  function addLookupPrompt(kind, selectEl) {
    openSheet('Add ' + kindLabel(kind), '<div class="field"><label>Name</label><input id="lkName" placeholder="e.g. Scaffolding"/></div><button class="btn btn-dark btn-block" id="lkSave">Add</button>', function (root) {
      $('#lkSave', root).onclick = function () {
        var name = $('#lkName', root).value.trim(); if (!name) return;
        api('createLookup', { kind: kind, name: name, projectId: S.projectId }).then(function () {
          loadLookups().then(function () {
            if (selectEl) { var o = document.createElement('option'); o.textContent = name; o.selected = true; selectEl.insertBefore(o, selectEl.lastChild); }
            closeSheet(); toast('Added ✓');
          });
        }).catch(function (e) { toast(errMsg(e), true); });
      };
    });
  }
  function kindLabel(k) { return { VENDOR_TYPE: 'vendor type', SALARY_ROLE: 'salary role', INVENTORY_TYPE: 'unit type', MISC_TYPE: 'misc type' }[k] || 'item'; }

  /* ---------------- LEDGER ---------------- */
  function viewLedger(v) {
    v.innerHTML = '<div class="view-title">Ledger</div>' +
      '<div class="card"><div class="card-h"><h3>Transactions</h3><span class="seg" id="lFilter"><button data-f="all" class="on">All</button><button data-f="INCOME">In</button><button data-f="EXPENSE">Out</button></span></div>' +
      '<div id="txList"><div class="skeleton" style="height:200px"></div></div></div>';
    var filter = 'all';
    function load() {
      api('listTransactions', { projectId: S.projectId, limit: 300 }).then(function (d) {
        var rows = d.transactions.filter(function (t) { return filter === 'all' || t.type === filter; });
        $('#txList').innerHTML = rows.length ? rows.map(txRow).join('') : '<div class="empty"><div class="big">🧾</div>No entries yet. Tap + to add one.</div>';
        $all('#txList .tx').forEach(function (el) { el.onclick = function () { openTxSheet(d.transactions.find(function (t) { return t.id === el.getAttribute('data-id'); })); }; });
      }).catch(function (e) { toast(errMsg(e), true); });
    }
    $('#lFilter').addEventListener('click', function (e) { if (e.target.tagName !== 'BUTTON') return; $all('#lFilter button').forEach(function (b) { b.classList.remove('on'); }); e.target.classList.add('on'); filter = e.target.getAttribute('data-f'); load(); });
    load();
  }
  function txRow(t) {
    var out = t.type === 'EXPENSE';
    var icon = (CAT[t.category] || {}).icon || '•';
    var title = t.subCategory || (CAT[t.category] || {}).label || t.category;
    return '<div class="tx" data-id="' + t.id + '"><div class="av">' + icon + '</div>' +
      '<div class="meta"><div class="t">' + esc(title) + (t.note ? ' · <span class="muted">' + esc(t.note) + '</span>' : '') + '</div>' +
      '<div class="s">' + fmtDate(t.date) + ' · ' + (CAT[t.category] || {}).label + (t.source === 'voice' ? ' · 🎙️' : '') + '</div></div>' +
      '<div class="amt ' + (out ? 'out' : 'in') + '">' + (out ? '−' : '+') + money(t.amount) + '</div></div>';
  }
  function openTxSheet(t) {
    if (!t) return;
    openSheet('Entry', '<div class="tx" style="border:0"><div class="av">' + ((CAT[t.category] || {}).icon || '•') + '</div><div class="meta"><div class="t">' + esc(t.subCategory || (CAT[t.category] || {}).label) + '</div><div class="s">' + fmtDate(t.date) + '</div></div><div class="amt ' + (t.type === 'EXPENSE' ? 'out' : 'in') + '">' + (t.type === 'EXPENSE' ? '−' : '+') + money(t.amount) + '</div></div>' +
      (t.note ? '<p class="muted" style="margin:10px 2px">' + esc(t.note) + '</p>' : '') +
      '<div class="row2" style="margin-top:14px"><button class="btn btn-ghost" id="txEdit">Edit amount</button><button class="btn btn-danger" id="txDel">Delete</button></div>', function (root) {
        $('#txDel', root).onclick = function () {
          if (!confirm('Delete this entry?')) return;
          api('deleteTransaction', { id: t.id }).then(function () { closeSheet(); toast('Deleted'); go('ledger'); }).catch(function (e) { toast(errMsg(e), true); });
        };
        $('#txEdit', root).onclick = function () {
          var val = prompt('New amount (₹):', t.amount); if (val == null) return;
          api('updateTransaction', { id: t.id, amount: Number(val) || 0 }).then(function () { closeSheet(); toast('Updated'); go('ledger'); }).catch(function (e) { toast(errMsg(e), true); });
        };
      });
  }

  /* ---------------- REMINDERS ---------------- */
  function viewReminders(v) {
    v.innerHTML = '<div class="view-title">Reminders</div>' +
      '<button class="btn btn-dark btn-block" id="addRem" style="margin-bottom:14px">+ New reminder</button>' +
      '<div class="card"><div id="remList"><div class="skeleton" style="height:120px"></div></div></div>';
    $('#addRem').onclick = function () { openReminderSheet(); };
    loadReminders();
  }
  function loadReminders() {
    api('listReminders', { projectId: S.projectId }).then(function (d) {
      var el = $('#remList'); if (!el) return;
      if (!d.reminders.length) { el.innerHTML = '<div class="empty"><div class="big">🔔</div>No reminders. Add payments you must not forget.</div>'; return; }
      el.innerHTML = d.reminders.map(function (r) {
        var overdue = r.status === 'open' && r.dueDate < todayStr();
        return '<div class="tx"><div class="av">' + (r.status === 'done' ? '✅' : (overdue ? '⚠️' : '🔔')) + '</div>' +
          '<div class="meta"><div class="t" style="' + (r.status === 'done' ? 'text-decoration:line-through;color:var(--muted)' : '') + '">' + esc(r.title) + '</div>' +
          '<div class="s">' + fmtDate(r.dueDate) + (r.amount > 0 ? ' · ' + money(r.amount) : '') + (overdue ? ' · <span style="color:var(--expense)">overdue</span>' : '') + '</div></div>' +
          (r.status === 'done' ? '' : '<button class="btn btn-sm btn-ghost" data-done="' + r.id + '">Done</button>') + '</div>';
      }).join('');
      $all('[data-done]', el).forEach(function (b) { b.onclick = function () { api('updateReminder', { id: b.getAttribute('data-done'), status: 'done' }).then(loadReminders); }; });
    }).catch(function (e) { toast(errMsg(e), true); });
  }
  function openReminderSheet() {
    openSheet('New reminder', '<div class="field"><label>What for?</label><input id="rTitle" placeholder="Pay cement vendor"/></div>' +
      '<div class="row2"><div class="field"><label>Due date</label><input id="rDate" type="date" value="' + todayStr() + '"/></div>' +
      '<div class="field"><label>Amount (optional)</label><input id="rAmt" type="number"/></div></div>' +
      '<button class="btn btn-dark btn-block" id="rSave">Save reminder</button>', function (root) {
        $('#rSave', root).onclick = function () {
          var title = $('#rTitle', root).value.trim(); if (!title) { toast('Enter a title'); return; }
          api('createReminder', { projectId: S.projectId, title: title, dueDate: $('#rDate', root).value, amount: Number($('#rAmt', root).value) || 0, notify: true })
            .then(function () { closeSheet(); toast('Saved ✓'); loadReminders(); }).catch(function (e) { toast(errMsg(e), true); });
        };
      });
  }

  /* ---------------- VENDORS ---------------- */
  function viewVendors(v) {
    v.innerHTML = '<div class="view-title">Vendors</div>' +
      '<button class="btn btn-dark btn-block" id="addVen" style="margin-bottom:14px">+ New vendor</button>' +
      '<div class="card"><div id="venList"><div class="skeleton" style="height:140px"></div></div></div>';
    $('#addVen').onclick = function () { openVendorSheet(); };
    api('listVendors', { projectId: S.projectId }).then(function (d) {
      var el = $('#venList');
      el.innerHTML = d.vendors.length ? d.vendors.map(function (v) {
        return '<div class="tx"><div class="av">🧱</div><div class="meta"><div class="t">' + esc(v.name) + '</div><div class="s">' + esc(v.vendorType || '—') + (v.phone ? ' · ' + esc(v.phone) : '') + (v.gstin ? ' · GST ' + esc(v.gstin) : '') + '</div></div></div>';
      }).join('') : '<div class="empty"><div class="big">🧱</div>No vendors yet.</div>';
    }).catch(function (e) { toast(errMsg(e), true); });
  }
  function openVendorSheet() {
    var types = lookupNames('VENDOR_TYPE');
    openSheet('New vendor', '<div class="field"><label>Name</label><input id="vName" placeholder="Sharma Steel"/></div>' +
      '<div class="field"><label>Type</label><select id="vType">' + types.map(function (t) { return '<option>' + esc(t) + '</option>'; }).join('') + '</select></div>' +
      '<div class="row2"><div class="field"><label>Phone</label><input id="vPhone"/></div><div class="field"><label>GSTIN</label><input id="vGst"/></div></div>' +
      '<button class="btn btn-dark btn-block" id="vSave">Save vendor</button>', function (root) {
        $('#vSave', root).onclick = function () {
          var name = $('#vName', root).value.trim(); if (!name) { toast('Enter a name'); return; }
          api('createVendor', { projectId: S.projectId, name: name, vendorType: $('#vType', root).value, phone: $('#vPhone', root).value.trim(), gstin: $('#vGst', root).value.trim() })
            .then(function () { closeSheet(); toast('Saved ✓'); go('vendors'); }).catch(function (e) { toast(errMsg(e), true); });
        };
      });
  }

  /* ---------------- BOOKINGS ---------------- */
  function viewBookings(v) {
    v.innerHTML = '<div class="view-title">Bookings</div>' +
      '<button class="btn btn-dark btn-block" id="addBk" style="margin-bottom:14px">+ New booking</button>' +
      '<div class="card"><div id="bkList"><div class="skeleton" style="height:140px"></div></div></div>';
    $('#addBk').onclick = function () { openBookingSheet(); };
    api('listBookings', { projectId: S.projectId }).then(function (d) {
      var el = $('#bkList');
      el.innerHTML = d.bookings.length ? d.bookings.map(function (b) {
        return '<div class="tx"><div class="av">🏠</div><div class="meta"><div class="t">' + esc(b.customerName) + ' · ' + esc(b.inventoryType) + '</div><div class="s">' + fmtDate(b.bookingDate) + ' · ' + esc(b.status) + '</div></div><div class="amt in">' + money(b.amount) + '</div></div>';
      }).join('') : '<div class="empty"><div class="big">🏠</div>No bookings yet.</div>';
    }).catch(function (e) { toast(errMsg(e), true); });
  }
  function openBookingSheet() {
    var types = lookupNames('INVENTORY_TYPE');
    openSheet('New booking', '<div class="field"><label>Customer name</label><input id="bName" placeholder="Mr. Patil"/></div>' +
      '<div class="row2"><div class="field"><label>Unit</label><select id="bType">' + types.map(function (t) { return '<option>' + esc(t) + '</option>'; }).join('') + '</select></div>' +
      '<div class="field"><label>Amount (₹)</label><input id="bAmt" type="number"/></div></div>' +
      '<div class="row2"><div class="field"><label>Date</label><input id="bDate" type="date" value="' + todayStr() + '"/></div>' +
      '<div class="field"><label>Phone</label><input id="bPhone"/></div></div>' +
      '<p class="muted" style="font-size:12.5px">Saving also records this as project income.</p>' +
      '<button class="btn btn-dark btn-block" id="bSave">Save booking</button>', function (root) {
        $('#bSave', root).onclick = function () {
          var name = $('#bName', root).value.trim(); if (!name) { toast('Enter customer name'); return; }
          api('createBooking', { projectId: S.projectId, customerName: name, inventoryType: $('#bType', root).value, amount: Number($('#bAmt', root).value) || 0, bookingDate: $('#bDate', root).value, customerPhone: $('#bPhone', root).value.trim() })
            .then(function () { closeSheet(); toast('Saved ✓'); go('bookings'); }).catch(function (e) { toast(errMsg(e), true); });
        };
      });
  }

  /* ---------------- INVOICES (client-side PDF) ---------------- */
  function viewInvoices(v) {
    v.innerHTML = '<div class="view-title">Invoices</div>' +
      '<button class="btn btn-dark btn-block" id="addInv" style="margin-bottom:14px">+ New invoice</button>' +
      '<div class="card"><div id="invList"><div class="skeleton" style="height:120px"></div></div></div>';
    $('#addInv').onclick = function () { openInvoiceSheet(); };
    api('listInvoices', { projectId: S.projectId }).then(function (d) {
      var el = $('#invList');
      el.innerHTML = d.invoices.length ? d.invoices.map(function (inv) {
        return '<div class="tx" data-inv=\'' + esc(JSON.stringify(inv)) + '\'><div class="av">🧾</div><div class="meta"><div class="t">' + esc(inv.number) + ' · ' + esc(inv.customerName) + '</div><div class="s">' + fmtDate(inv.date) + '</div></div><div class="amt">' + money(inv.total) + '</div></div>';
      }).join('') : '<div class="empty"><div class="big">🧾</div>No invoices yet.</div>';
      $all('#invList .tx', el).forEach(function (row) { row.onclick = function () { invoicePdf(JSON.parse(row.getAttribute('data-inv'))); }; });
    }).catch(function (e) { toast(errMsg(e), true); });
  }
  function openInvoiceSheet() {
    openSheet('New invoice', '<div class="field"><label>Customer</label><input id="inName" placeholder="Mr. Patil"/></div>' +
      '<div id="items"></div><button class="btn btn-ghost btn-sm" id="addItem" style="margin:4px 0 14px">+ Add line</button>' +
      '<button class="btn btn-dark btn-block" id="inSave">Create &amp; download PDF</button>', function (root) {
        function addItem(d, q, r) {
          var row = h('<div class="row2" style="gap:8px;margin-bottom:8px"><input placeholder="Description" class="it-d" value="' + esc(d || '') + '"/><div style="display:flex;gap:6px"><input type="number" placeholder="Qty" class="it-q" value="' + (q || '') + '" style="width:60px"/><input type="number" placeholder="Rate" class="it-r" value="' + (r || '') + '" style="flex:1"/></div></div>');
          $('#items', root).appendChild(row);
        }
        addItem('', 1, '');
        $('#addItem', root).onclick = function () { addItem('', 1, ''); };
        $('#inSave', root).onclick = function () {
          var name = $('#inName', root).value.trim(); if (!name) { toast('Enter customer'); return; }
          var items = $all('#items .row2', root).map(function (r) {
            var q = Number($('.it-q', r).value) || 0, rate = Number($('.it-r', r).value) || 0;
            return { desc: $('.it-d', r).value.trim(), qty: q, rate: rate, amount: q * rate };
          }).filter(function (it) { return it.desc && it.amount; });
          if (!items.length) { toast('Add at least one line'); return; }
          api('createInvoice', { projectId: S.projectId, customerName: name, date: todayStr(), items: items })
            .then(function (d) { closeSheet(); toast('Invoice created ✓'); invoicePdf(d.invoice); go('invoices'); })
            .catch(function (e) { toast(errMsg(e), true); });
        };
      });
  }
  function invoicePdf(inv) {
    if (!window.jspdf) { toast('PDF library still loading…'); return; }
    var items; try { items = typeof inv.items === 'string' ? JSON.parse(inv.items) : (inv.items || []); } catch (e) { items = []; }
    var proj = (S.projects.find(function (p) { return p.id === S.projectId; }) || {}).name || 'Project';
    var doc = new window.jspdf.jsPDF();
    doc.setFontSize(20); doc.text('BuildKhata', 14, 20);
    doc.setFontSize(10); doc.setTextColor(120); doc.text(proj, 14, 27);
    doc.setTextColor(0); doc.setFontSize(14); doc.text('INVOICE ' + (inv.number || ''), 14, 40);
    doc.setFontSize(10); doc.text('Bill to: ' + (inv.customerName || ''), 14, 48); doc.text('Date: ' + (inv.date || ''), 150, 48);
    var y = 62; doc.setFont(undefined, 'bold'); doc.text('Description', 14, y); doc.text('Qty', 120, y); doc.text('Rate', 140, y); doc.text('Amount', 175, y, { align: 'right' });
    doc.setFont(undefined, 'normal'); y += 4; doc.line(14, y, 196, y); y += 8;
    items.forEach(function (it) { doc.text(String(it.desc || ''), 14, y); doc.text(String(it.qty || ''), 120, y); doc.text(String(it.rate || ''), 140, y); doc.text(String(Math.round(it.amount || 0)), 196, y, { align: 'right' }); y += 8; });
    y += 2; doc.line(14, y, 196, y); y += 10; doc.setFont(undefined, 'bold'); doc.setFontSize(13);
    doc.text('Total  ' + BK.brand.currency.symbol + Math.round(inv.total || 0).toLocaleString('en-IN'), 196, y, { align: 'right' });
    doc.save((inv.number || 'invoice') + '.pdf');
  }

  /* ---------------- GST INVOICE VAULT ---------------- */
  function viewGst(v) {
    v.innerHTML = '<div class="view-title">GST invoices</div>' +
      '<button class="btn btn-dark btn-block" id="upGst" style="margin-bottom:14px">⬆ Upload purchase invoice</button>' +
      '<div class="card"><div class="card-h"><h3>Received invoices</h3><button class="btn btn-sm btn-ghost" id="bundleBtn">⬇ Bundle selected</button></div>' +
      '<div id="gstList"><div class="skeleton" style="height:140px"></div></div></div>';
    $('#upGst').onclick = function () { openGstUpload(); };
    var selected = {};
    $('#bundleBtn').onclick = function () {
      var ids = Object.keys(selected).filter(function (k) { return selected[k]; });
      if (!ids.length) { toast('Select invoices first'); return; }
      toast('Preparing ZIP…');
      api('bundleGstInvoices', { ids: ids }).then(function (d) { downloadBase64(d.base64, d.fileName, 'application/zip'); }).catch(function (e) { toast(errMsg(e), true); });
    };
    api('listGstInvoices', { projectId: S.projectId }).then(function (d) {
      var el = $('#gstList');
      if (!d.gstInvoices.length) { el.innerHTML = '<div class="empty"><div class="big">📂</div>No GST invoices uploaded.</div>'; return; }
      el.innerHTML = d.gstInvoices.map(function (g) {
        return '<div class="tx"><input type="checkbox" data-sel="' + g.id + '" style="width:18px;height:18px"/>' +
          '<div class="meta" data-view="' + g.id + '" style="cursor:pointer"><div class="t">' + esc(g.number || g.fileName) + '</div><div class="s">' + fmtDate(g.date) + (g.amount > 0 ? ' · ' + money(g.amount) : '') + '</div></div>' +
          '<button class="btn btn-sm btn-ghost" data-view="' + g.id + '">View</button></div>';
      }).join('');
      $all('[data-sel]', el).forEach(function (c) { c.onchange = function () { selected[c.getAttribute('data-sel')] = c.checked; }; });
      $all('[data-view]', el).forEach(function (b) { b.onclick = function () { viewGstFile(b.getAttribute('data-view')); }; });
    }).catch(function (e) { toast(errMsg(e), true); });
  }
  function openGstUpload() {
    api('listVendors', { projectId: S.projectId }).then(function (d) {
      var vendors = d.vendors;
      openSheet('Upload GST invoice', '<div class="field"><label>Vendor</label><select id="gVen">' + (vendors.length ? vendors.map(function (v) { return '<option value="' + v.id + '">' + esc(v.name) + '</option>'; }).join('') : '<option value="">(add a vendor first)</option>') + '</select></div>' +
        '<div class="row2"><div class="field"><label>Invoice no.</label><input id="gNum"/></div><div class="field"><label>Amount</label><input id="gAmt" type="number"/></div></div>' +
        '<div class="field"><label>File (PDF/image, ≤8MB)</label><input id="gFile" type="file" accept="application/pdf,image/*"/></div>' +
        '<button class="btn btn-dark btn-block" id="gSave">Upload</button>', function (root) {
          $('#gSave', root).onclick = function () {
            var file = $('#gFile', root).files[0]; var ven = $('#gVen', root).value;
            if (!ven) { toast('Add a vendor first', true); return; }
            if (!file) { toast('Choose a file'); return; }
            if (file.size > 8 * 1024 * 1024) { toast('File too large (max 8MB)', true); return; }
            var btn = $('#gSave', root); btn.disabled = true; btn.innerHTML = '<span class="spin"></span>';
            var reader = new FileReader();
            reader.onload = function () {
              var b64 = String(reader.result).split(',')[1];
              api('uploadGstInvoice', { projectId: S.projectId, vendorId: ven, number: $('#gNum', root).value.trim(), amount: Number($('#gAmt', root).value) || 0, fileName: file.name, mimeType: file.type, fileBase64: b64, date: todayStr() })
                .then(function () { closeSheet(); toast('Uploaded ✓'); go('gst'); })
                .catch(function (e) { btn.disabled = false; btn.textContent = 'Upload'; toast(errMsg(e), true); });
            };
            reader.readAsDataURL(file);
          };
        });
    });
  }
  function viewGstFile(id) {
    toast('Opening…');
    api('getGstFile', { id: id }).then(function (d) {
      var blob = base64ToBlob(d.base64, d.mimeType);
      var url = URL.createObjectURL(blob); window.open(url, '_blank');
      setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
    }).catch(function (e) { toast(errMsg(e), true); });
  }

  /* ---------------- SETTINGS ---------------- */
  function viewSettings(v) {
    var p = S.projects.find(function (x) { return x.id === S.projectId; }) || {};
    v.innerHTML = '<div class="view-title">Settings</div>' +
      '<div class="card"><div class="card-h"><h3>Project</h3><button class="btn btn-sm btn-ghost" id="newProj">+ New</button></div>' +
      '<div class="field"><label>Name</label><input id="pName" value="' + esc(p.name || '') + '"/></div>' +
      '<div class="field"><label>Land cost (₹, one-time)</label><input id="pLand" type="number" value="' + (p.landCost || 0) + '"/></div>' +
      '<button class="btn btn-dark btn-block" id="pSave">Save project</button></div>' +

      '<div class="card"><div class="card-h"><h3>Categories</h3></div><p class="muted" style="font-size:13px;margin-top:-6px">Add your own vendor types, salary roles and unit types.</p>' +
      '<div class="row2"><button class="btn btn-ghost btn-sm" data-add="VENDOR_TYPE">+ Vendor type</button><button class="btn btn-ghost btn-sm" data-add="SALARY_ROLE">+ Salary role</button></div>' +
      '<div class="row2" style="margin-top:8px"><button class="btn btn-ghost btn-sm" data-add="INVENTORY_TYPE">+ Unit type</button><button class="btn btn-ghost btn-sm" data-add="MISC_TYPE">+ Misc type</button></div></div>' +

      '<div class="card"><div class="card-h"><h3>Daily email report</h3></div>' +
      (S.features.email ? '' : '<p class="muted" style="font-size:13px;margin-top:-6px">Add a Resend key on the backend to enable email.</p>') +
      '<div class="field"><label>Send to</label><input id="rEmail" type="email" placeholder="you@example.com"/></div>' +
      '<div class="row2"><div class="field"><label>Hour (0–23)</label><input id="rHour" type="number" min="0" max="23" value="20"/></div>' +
      '<div class="field"><label>&nbsp;</label><button class="btn btn-dark btn-block" id="rEnable"' + (S.features.email ? '' : ' disabled') + '>Enable</button></div></div></div>' +

      '<div class="card"><div class="card-h"><h3>Account</h3></div>' +
      '<p class="muted" style="font-size:13.5px;margin-top:-6px">Signed in as <b>' + esc(S.user ? S.user.email : '') + '</b></p>' +
      '<div class="field"><label>Backend URL</label><input id="sApi" value="' + esc(BK.apiBase()) + '"/></div>' +
      '<div class="row2"><button class="btn btn-ghost" id="sApiSave">Save URL</button><button class="btn btn-danger" id="sLogout">Log out</button></div></div>';

    $('#pSave').onclick = function () {
      if (!S.projectId) { return openProjectSheet(); }
      api('updateProject', { id: S.projectId, name: $('#pName').value.trim(), landCost: Number($('#pLand').value) || 0 })
        .then(function (d) { S.projects = S.projects.map(function (x) { return x.id === d.project.id ? d.project : x; }); toast('Saved ✓'); syncProjectSelect(); }).catch(function (e) { toast(errMsg(e), true); });
    };
    $('#newProj').onclick = openProjectSheet;
    $all('[data-add]').forEach(function (b) { b.onclick = function () { addLookupPrompt(b.getAttribute('data-add'), null); }; });
    $('#rEnable').onclick = function () {
      api('configureDailyReport', { enabled: true, email: $('#rEmail').value.trim(), hour: Number($('#rHour').value) })
        .then(function () { toast('Daily report enabled ✓'); }).catch(function (e) { toast(errMsg(e), true); });
    };
    $('#sApiSave').onclick = function () { BK.setApiBase($('#sApi').value.trim()); toast('Saved — reloading…'); setTimeout(function () { location.reload(); }, 700); };
    $('#sLogout').onclick = logout;
  }
  function openProjectSheet() {
    openSheet('New project', '<div class="field"><label>Project / site name</label><input id="npName" placeholder="Riverside Towers"/></div>' +
      '<div class="field"><label>Land cost (₹, optional)</label><input id="npLand" type="number"/></div>' +
      '<button class="btn btn-dark btn-block" id="npSave">Create project</button>', function (root) {
        $('#npSave', root).onclick = function () {
          var name = $('#npName', root).value.trim(); if (!name) { toast('Enter a name'); return; }
          api('createProject', { name: name, landCost: Number($('#npLand', root).value) || 0 }).then(function (d) {
            S.projects.push(d.project); setProjId(d.project.id); closeSheet(); toast('Created ✓');
            loadLookups().then(function () { go('dashboard'); });
          }).catch(function (e) { toast(errMsg(e), true); });
        };
      });
  }

  /* ---------------- MORE MENU ---------------- */
  function openMoreMenu() {
    var items = [['vendors', '🧱', 'Vendors'], ['bookings', '🏠', 'Bookings'], ['invoices', '🧾', 'Invoices'], ['gst', '📂', 'GST invoices'], ['settings', '⚙️', 'Settings']];
    openSheet('More', items.map(function (it) {
      return '<button class="btn btn-ghost btn-block" data-m="' + it[0] + '" style="justify-content:flex-start;margin-bottom:8px;font-size:15px">' + it[1] + '&nbsp;&nbsp;' + it[2] + '</button>';
    }).join('') + '<button class="btn btn-danger btn-block" id="mLogout" style="margin-top:6px">Log out</button>', function (root) {
      $all('[data-m]', root).forEach(function (b) { b.onclick = function () { closeSheet(); go(b.getAttribute('data-m')); }; });
      $('#mLogout', root).onclick = logout;
    });
  }

  /* ---------------- REPORT PDF / EMAIL ---------------- */
  function exportReportPdf() {
    if (!_lastSummary || !window.jspdf) { toast('Nothing to export yet'); return; }
    var s = _lastSummary, doc = new window.jspdf.jsPDF();
    doc.setFontSize(20); doc.text('BuildKhata', 14, 20);
    doc.setFontSize(12); doc.setTextColor(90); doc.text(s.project.name + (s.range.from ? '  (' + s.range.from + ' → ' + s.range.to + ')' : ''), 14, 28);
    doc.setTextColor(0); var y = 44;
    function line(l, val, color) { doc.setFontSize(12); if (color) doc.setTextColor.apply(doc, color); doc.text(l, 14, y); doc.text(BK.brand.currency.symbol + Math.round(val).toLocaleString('en-IN'), 196, y, { align: 'right' }); doc.setTextColor(0); y += 10; }
    line('Income (period)', s.period.income, [47, 163, 124]);
    line('Expense (period)', s.period.expense, [224, 90, 90]);
    line('Net (period)', s.period.net);
    y += 4; doc.setFontSize(11); doc.setTextColor(120); doc.text('Expense by category', 14, y); doc.setTextColor(0); y += 8;
    Object.keys(s.period.byCategory).forEach(function (k) { line('  ' + prettyCat(k), s.period.byCategory[k]); });
    y += 4; doc.line(14, y, 196, y); y += 10;
    line('Land cost', s.totals.landCost);
    doc.setFont(undefined, 'bold'); line('Profit (lifetime)  ' + Math.round(s.totals.profitRatio * 100) + '%', s.totals.profit);
    doc.save('buildkhata-report.pdf');
  }
  function emailReportFlow() {
    if (!S.features.email) { toast('Email is off — add a Resend key on backend', true); return; }
    var to = prompt('Send report to which email?', S.user ? S.user.email : ''); if (!to) return;
    var r = rangeFromDays(90);
    api('sendReportNow', { projectId: S.projectId, to: to, from: r.from, until: r.to }).then(function () { toast('Report sent ✓'); }).catch(function (e) { toast(errMsg(e), true); });
  }

  /* ---------------- sheet (modal) + file utils ---------------- */
  function openSheet(title, bodyHtml, onReady) {
    var root = $('#modal-root');
    root.innerHTML = '<div class="sheet-bg" id="sheetBg"><div class="sheet"><div class="sheet-h"><h3>' + esc(title) + '</h3><button class="icon-btn" id="sheetX" aria-label="Close">✕</button></div><div id="sheetBody">' + bodyHtml + '</div></div></div>';
    $('#sheetX').onclick = closeSheet;
    $('#sheetBg').onclick = function (e) { if (e.target.id === 'sheetBg') closeSheet(); };
    onReady && onReady(root);
  }
  function closeSheet() { $('#modal-root').innerHTML = ''; }
  function base64ToBlob(b64, mime) {
    var bin = atob(b64), len = bin.length, arr = new Uint8Array(len);
    for (var i = 0; i < len; i++) arr[i] = bin.charCodeAt(i);
    return new Blob([arr], { type: mime || 'application/octet-stream' });
  }
  function downloadBase64(b64, name, mime) {
    var url = URL.createObjectURL(base64ToBlob(b64, mime));
    var a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
  }

  /* ========================================================= START ===== */
  function start() {
    if (BK.api.isAuthed() && BK.apiBase()) {
      // verify token still valid
      api('me', {}).then(function (u) { S.user = { email: u.email, role: u.role }; boot(); })
        .catch(function (e) { renderAuth(e.code === 'UNAUTHORIZED' ? 'Please sign in.' : ''); });
    } else {
      renderAuth('');
    }
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(function () {});
  }
  start();
})();
