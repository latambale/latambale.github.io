/* site.js — marketing page: nav, scroll reveal, FAQ, icon rendering, interactive demo. */
(function () {
  var nav = document.getElementById('nav');
  var toggle = document.getElementById('navToggle');
  var yr = document.getElementById('yr'); if (yr) yr.textContent = new Date().getFullYear();

  // render custom SVG icons into [data-ic] placeholders (no emoji in the brand)
  if (window.BK && BK.icon) {
    Array.prototype.forEach.call(document.querySelectorAll('[data-ic]'), function (el) {
      el.innerHTML = BK.icon(el.getAttribute('data-ic'), { size: 22 });
    });
  }

  // sticky nav on scroll
  function onScroll() { nav.classList.toggle('scrolled', window.scrollY > 10); }
  window.addEventListener('scroll', onScroll, { passive: true }); onScroll();

  // mobile menu
  toggle.addEventListener('click', function () { nav.classList.toggle('open'); });
  document.getElementById('navLinks').addEventListener('click', function (e) {
    if (e.target.tagName === 'A') nav.classList.remove('open');
  });

  // scroll reveal
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (en) { if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); } });
  }, { threshold: 0.12 });
  document.querySelectorAll('.reveal:not(.in)').forEach(function (el) { io.observe(el); });

  // FAQ
  var faqs = [
    ['Do I need to know accounting?', 'No. You speak or type plain sentences like "paid 20 thousand to the cement vendor" and BuildKhata figures out the rest. You just confirm.'],
    ['Is it really powered by GPT?', 'Yes. Your sentence is sent to OpenAI GPT through a secure backend to extract the amount, vendor, category and date. It even corrects misheard names and handles several entries in one sentence.'],
    ['Where is my data stored?', 'In your own Google Sheet. BuildKhata reads and writes it through a secure Google Apps Script backend, with no third-party database.'],
    ['Can I track more than one project?', 'Yes. Add as many projects as you like; each has its own cashflow, land cost and reports.'],
    ['Is my data and keys safe?', 'API keys never touch the browser or the app. They live only in your server settings. Your sign-in uses a short-lived signed token.']
  ];
  var list = document.getElementById('faqList');
  if (list) faqs.forEach(function (f) {
    var d = document.createElement('div');
    d.className = 'reveal';
    d.style.cssText = 'border-bottom:1px solid var(--line);padding:18px 0;cursor:pointer';
    d.innerHTML = '<div style="display:flex;justify-content:space-between;align-items:center;gap:16px">' +
      '<strong style="font-size:16.5px">' + f[0] + '</strong>' +
      '<span class="faqp" style="color:var(--muted);transition:transform .25s">+</span></div>' +
      '<p class="faqa" style="margin:0;max-height:0;overflow:hidden;color:var(--muted);transition:max-height .3s ease,margin .3s ease">' + f[1] + '</p>';
    d.addEventListener('click', function () {
      var a = d.querySelector('.faqa'), p = d.querySelector('.faqp');
      var open = a.style.maxHeight && a.style.maxHeight !== '0px';
      a.style.maxHeight = open ? '0px' : a.scrollHeight + 'px';
      a.style.marginTop = open ? '0' : '10px';
      p.style.transform = open ? 'none' : 'rotate(45deg)';
    });
    list.appendChild(d); io.observe(d);
  });

  /* ---------------- interactive "try it" demo (local heuristic preview) ---------------- */
  var input = document.getElementById('tryInput');
  var tryBtn = document.getElementById('tryBtn');
  var result = document.getElementById('tryResult');
  var samples = document.getElementById('trySamples');

  function money(n) { try { return '₹' + Math.round(n).toLocaleString('en-IN'); } catch (e) { return '₹' + Math.round(n); } }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]; }); }
  function titleCase(s) { return s.replace(/\s+/g, ' ').trim().replace(/\b\w/g, function (c) { return c.toUpperCase(); }); }

  var MATERIALS = [
    [/steel|sariya|tmt/, 'Steel'], [/cement/, 'Cement'], [/brick|bricks/, 'Bricks'],
    [/tiles?/, 'Tiles - Material'], [/plumb/, 'Plumbing - Material'], [/electric/, 'Electrical - Material'],
    [/lift/, 'Lifts'], [/door/, 'Doors - Material'], [/window/, 'Windows - Material'], [/fabricat/, 'Fabrication'],
    [/sand|aggregate|gravel/, 'Misc'], [/paint/, 'Misc']
  ];
  var ROLES = [[/watchman|guard|chowkidar/, 'Watchmen'], [/consultant/, 'Consultants'], [/\bca\b|chartered/, 'CA'], [/tally/, 'Tally Guys'], [/labour|labor|mazdoor|mistri/, 'Labour']];

  function demoParse(raw) {
    var text = String(raw || '').trim(); if (!text) return null;
    var low = text.toLowerCase();

    // amount + scale
    var amount = 0;
    var re = /(\d+(?:[.,]\d+)?)\s*(crore|cr|lakhs?|lac|thousand|hazaar|k)?/g, m, best = null;
    while ((m = re.exec(low)) !== null) {
      if (!m[1]) continue;
      var base = parseFloat(m[1].replace(/,/g, '')); if (!isFinite(base)) continue;
      var scale = m[2] || '';
      var mult = /crore|cr/.test(scale) ? 1e7 : /lakh|lac/.test(scale) ? 1e5 : /thousand|hazaar|k/.test(scale) ? 1e3 : 1;
      var val = base * mult;
      if (!best || (scale && !best.scale) || val > best.val) best = { val: val, scale: scale };
    }
    if (best) amount = best.val;

    // in / out
    var income = /receiv|booking|sold|sale|got|advance|collect|payment from/.test(low);
    var expense = /paid|gave|bought|spent|purchase|salary|wage|give/.test(low);
    var type = income && !expense ? 'INCOME' : 'EXPENSE';

    // category + subCategory
    var category = type === 'INCOME' ? 'Booking' : 'Vendor', sub = '';
    var bhk = low.match(/(\d)\s*bhk/);
    if (type === 'INCOME' || /booking|flat|unit|bhk/.test(low)) { category = 'Booking'; sub = bhk ? (bhk[1] + 'BHK') : (/flat|unit/.test(low) ? 'Unit' : '2BHK'); type = 'INCOME'; }
    else if (/challan|sanction|government|govt/.test(low)) { category = 'Challan / Sanction'; sub = ''; }
    else {
      var role = ROLES.find(function (r) { return r[0].test(low); });
      if (role || /salary|wage/.test(low)) { category = 'Salary'; sub = role ? role[1] : 'Staff'; }
      else {
        var mat = MATERIALS.find(function (r) { return r[0].test(low); });
        if (mat) { category = 'Vendor'; sub = mat[1]; }
        else { category = /misc|other/.test(low) ? 'Miscellaneous' : 'Vendor'; sub = ''; }
      }
    }

    // vendor / party name: after "to" or "from"
    var vendor = '';
    var vm = text.match(/\b(?:to|from)\s+([A-Za-z][A-Za-z0-9 .&'-]*?)(?=\s+\d|\s+today|\s+yesterday|\s+tomorrow|[.,]|$)/i);
    if (vm) vendor = titleCase(vm[1]);
    if (!vendor && sub && category === 'Salary') vendor = sub;

    // date
    var dateLabel = 'Today';
    if (/yesterday/.test(low)) dateLabel = 'Yesterday';
    else if (/tomorrow/.test(low)) dateLabel = 'Tomorrow';

    return { type: type, category: category, sub: sub, vendor: vendor, amount: amount, dateLabel: dateLabel };
  }

  function renderParsed(p) {
    if (!p) return;
    var out = p.type === 'EXPENSE';
    var title = p.vendor || p.sub || p.category;
    var chips = [];
    chips.push('<span class="chip ' + (out ? 'exp' : '') + '">' + (out ? 'Expense' : 'Income') + '</span>');
    if (p.sub) chips.push('<span class="chip">' + esc(p.sub) + '</span>');
    else chips.push('<span class="chip">' + esc(p.category) + '</span>');
    if (p.vendor) chips.push('<span class="chip">' + esc(p.vendor) + '</span>');
    chips.push('<span class="chip">' + esc(p.dateLabel) + '</span>');
    if (p.amount > 0) chips.push('<span class="chip amt">' + money(p.amount) + '</span>');
    result.innerHTML =
      '<div class="pcard"><div class="prow"><div><div class="pt">' + esc(title) + '</div>' +
      '<div class="psub">' + esc(p.category) + (p.amount > 0 ? '' : ' &middot; add an amount to log') + '</div></div>' +
      (p.amount > 0 ? '<div class="pamt ' + (out ? 'out' : 'in') + '">' + (out ? '− ' : '+ ') + money(p.amount) + '</div>' : '') +
      '</div><div class="pchips">' + chips.join('') + '</div></div>';
  }

  function run() { var p = demoParse(input.value); if (!p) { input.focus(); return; } renderParsed(p); }

  if (input && tryBtn && result) {
    tryBtn.addEventListener('click', run);
    input.addEventListener('keydown', function (e) { if (e.key === 'Enter') run(); });
    if (samples) samples.addEventListener('click', function (e) {
      var b = e.target.closest('.sample'); if (!b) return;
      input.value = b.textContent; run(); input.scrollIntoView({ block: 'nearest' });
    });
    // seed with the first sample so the section never looks empty
    input.value = 'Paid 45 thousand to Sharma Steel today'; run();
  }
})();
