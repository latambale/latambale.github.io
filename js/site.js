/* site.js — marketing page interactions: nav, scroll reveal, FAQ, demo player. */
(function () {
  var nav = document.getElementById('nav');
  var toggle = document.getElementById('navToggle');
  document.getElementById('yr').textContent = new Date().getFullYear();

  // sticky nav style on scroll
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

  // FAQ (built from data; keeps HTML lean)
  var faqs = [
    ['Do I need to know accounting?', 'No. You speak or type plain sentences like “paid 20 thousand to the cement vendor”. BuildKhata figures out the rest and you just confirm.'],
    ['Where is my data stored?', 'In your own Google Sheet. BuildKhata reads and writes it through a secure Google Apps Script backend — no third-party database.'],
    ['Does voice work offline?', 'Voice uses your device + an AI service, so it needs internet. You can always type an entry instead.'],
    ['Can I track more than one project?', 'Yes. Add as many projects as you like; each has its own cashflow, land cost and reports.'],
    ['Is my OpenAI/email key safe?', 'Keys never touch the browser or the app. They live only in your Apps Script settings on the server side.']
  ];
  var list = document.getElementById('faqList');
  faqs.forEach(function (f, i) {
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
    list.appendChild(d);
    io.observe(d);
  });

  // demo player — scripted sentences typing + chips
  var script = [
    { text: 'Paid 45 thousand to Sharma Steel today.', chips: [['Expense', 'exp'], ['Steel'], ['Sharma Steel'], ['₹45,000', 'amt']] },
    { text: 'Gave 18 thousand to the watchman as salary.', chips: [['Expense', 'exp'], ['Salary · Watchmen'], ['₹18,000', 'amt']] },
    { text: 'Received 5 lakh booking for a 2BHK from Mr. Patil.', chips: [['Income'], ['Booking · 2BHK'], ['Mr. Patil'], ['₹5,00,000', 'amt']] },
    { text: 'Spent 12 thousand on tiles labour.', chips: [['Expense', 'exp'], ['Tiles - Labour'], ['₹12,000', 'amt']] }
  ];
  var said = document.getElementById('demoSaid'), chipsEl = document.getElementById('demoChips');
  var btn = document.getElementById('demoPlay'), playing = false;

  function type(str, done) {
    said.textContent = ''; var i = 0;
    (function tick() {
      if (i <= str.length) { said.textContent = '“' + str.slice(0, i) + '”'; i++; setTimeout(tick, 26); }
      else done();
    })();
  }
  function showChips(chips) {
    chipsEl.innerHTML = '';
    chips.forEach(function (c, k) {
      var s = document.createElement('span');
      s.className = 'chip ' + (c[1] || '');
      s.textContent = c[0];
      s.style.cssText = 'opacity:0;transform:translateY(6px);transition:.3s ' + (k * 0.08) + 's';
      chipsEl.appendChild(s);
      requestAnimationFrame(function () { s.style.opacity = 1; s.style.transform = 'none'; });
    });
  }
  function play() {
    if (playing) return; playing = true; btn.textContent = '▶ Playing…'; btn.disabled = true;
    var idx = 0;
    (function next() {
      if (idx >= script.length) { playing = false; btn.textContent = '▶ Play again'; btn.disabled = false; return; }
      var step = script[idx++];
      chipsEl.innerHTML = '';
      type(step.text, function () { showChips(step.chips); setTimeout(next, 1500); });
    })();
  }
  btn.addEventListener('click', play);
})();
