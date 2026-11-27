/* Warcats site script: header, mode tabs, and the hero "fog of war". No libraries, no tracking. */
(function () {
  'use strict';

  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---- header: solid after scrolling, menu on phones ---- */
  var header = document.querySelector('.site-header');
  var menuBtn = document.querySelector('.menu-btn');
  function onScroll() { header.classList.toggle('is-solid', window.scrollY > 40); }
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });
  if (menuBtn) {
    menuBtn.addEventListener('click', function () {
      var open = header.classList.toggle('is-open');
      menuBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    document.querySelectorAll('.nav a').forEach(function (a) {
      a.addEventListener('click', function () { header.classList.remove('is-open'); menuBtn.setAttribute('aria-expanded', 'false'); });
    });
  }

  /* ---- mode tabs ---- */
  var tabs = Array.prototype.slice.call(document.querySelectorAll('.mode-tab'));
  var modeText = document.getElementById('mode-text');
  function selectTab(tab, focus) {
    tabs.forEach(function (t) {
      var on = t === tab;
      t.setAttribute('aria-selected', on ? 'true' : 'false');
      t.tabIndex = on ? 0 : -1;
      var img = document.getElementById(t.dataset.img);
      if (img) img.classList.toggle('is-on', on);
    });
    modeText.textContent = tab.dataset.text;
    if (focus) tab.focus();
  }
  tabs.forEach(function (tab, i) {
    tab.addEventListener('click', function () { selectTab(tab, false); });
    tab.addEventListener('keydown', function (e) {
      var n = null;
      if (e.key === 'ArrowDown' || e.key === 'ArrowRight') n = tabs[(i + 1) % tabs.length];
      else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') n = tabs[(i - 1 + tabs.length) % tabs.length];
      else if (e.key === 'Home') n = tabs[0];
      else if (e.key === 'End') n = tabs[tabs.length - 1];
      if (n) { e.preventDefault(); selectTab(n, true); }
    });
  });

  /* ---- hero: the map is dark; only the cat's view cone and a small circle around it are lit ---- */
  var hero = document.getElementById('hero');
  var canvas = document.getElementById('fog');
  var img = hero && hero.querySelector('.hero__img');
  if (!hero || !canvas || !canvas.getContext || !img) return;

  var ctx = canvas.getContext('2d');
  var SOFT = 'filter' in ctx;
  var FEET = { x: 0.735, y: 0.56 };    // where the cat's feet are inside hero.jpg (0..1)
  var CAT_H = 0.16;                    // cat height as a share of the picture height
  var catH = 120, feetX = 0, feetY = 0, lastT = 0;
  var live = window.CatAim ? window.CatAim.create('/img/cat/') : null;
  var catCanvas = document.getElementById('livecat');
  var cctx = catCanvas && catCanvas.getContext ? catCanvas.getContext('2d') : null;
  var POS_X = 0.745, POS_Y = 0.5;      // must match object-position in the CSS
  var W = 0, H = 0, dpr = 1, catX = 0, catY = 0;

  var CONE_HALF = 34 * Math.PI / 180;  // half angle of the view cone
  var angle = Math.PI;                 // pointing left, toward the text and the map
  var targetAngle = Math.PI;
  var lastMove = -1e9;
  var startT = 0;
  var running = false;
  var hint = document.getElementById('hint');

  function layout() {
    var r = canvas.getBoundingClientRect(), ir = img.getBoundingClientRect();
    W = r.width; H = r.height;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    if (catCanvas) { catCanvas.width = canvas.width; catCanvas.height = canvas.height; }
    var iw = img.naturalWidth || 2040, ih = img.naturalHeight || 1181;
    var s = Math.max(ir.width / iw, ir.height / ih);
    var dw = iw * s, dh = ih * s;
    var offX = ir.left - r.left + (ir.width - dw) * POS_X, offY = ir.top - r.top + (ir.height - dh) * POS_Y;
    feetX = offX + FEET.x * dw;
    feetY = offY + FEET.y * dh;
    catH = CAT_H * dh;
    catX = feetX;
    catY = feetY - catH * 0.53;      // chest height: where the view cone starts
  }

  function shortest(from, to) {
    var d = (to - from) % (Math.PI * 2);
    if (d > Math.PI) d -= Math.PI * 2;
    if (d < -Math.PI) d += Math.PI * 2;
    return d;
  }

  function draw(t) {
    if (!running) return;
    var el = Math.max(0, (t - startT) / 1000);
    var grow = reduce ? 1 : 1 - Math.pow(1 - Math.min(el / 1.6, 1), 3);   // opens up once, on load

    // aim: follow the pointer, or scan slowly when nobody is moving it
    var idle = (t - lastMove) > 3000;
    if (idle) targetAngle = Math.PI + 0.5 + (reduce ? 0 : Math.sin(el * 0.5) * 0.42 + Math.sin(el * 0.21) * 0.12); // left and up, away from the text
    var dt = Math.min(0.05, Math.max(0, (t - lastT) / 1000)); lastT = t;
    var aimed = null;
    if (live && cctx) {
      cctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      cctx.clearRect(0, 0, W, H);
      aimed = live.render(cctx, { fx: feetX, fy: feetY, h: catH, tx: catX + Math.cos(targetAngle) * 600, ty: catY + Math.sin(targetAngle) * 600, dt: reduce ? 1 : dt });
    }
    if (aimed === null) angle += shortest(angle, targetAngle) * (reduce ? 1 : 0.12);
    else angle = aimed;

    var len = Math.max(W, H) * 0.62 * grow;
    var ring = Math.max(70, Math.min(W, H) * 0.085) * grow;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(5, 14, 22, 0.9)';
    ctx.fillRect(0, 0, W, H);

    ctx.globalCompositeOperation = 'destination-out';
    if (SOFT) ctx.filter = 'blur(' + Math.round(14 * dpr) + 'px)';
    // the cone: soft towards its far end
    var g = ctx.createRadialGradient(catX, catY, ring * 0.4, catX, catY, len);
    g.addColorStop(0, 'rgba(0,0,0,1)');
    g.addColorStop(0.7, 'rgba(0,0,0,0.85)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(catX, catY);
    ctx.arc(catX, catY, len, angle - CONE_HALF, angle + CONE_HALF);
    ctx.closePath();
    ctx.fill();
    // awareness circle: you always sense what is right next to you
    var c = ctx.createRadialGradient(catX, catY, 0, catX, catY, ring);
    c.addColorStop(0, 'rgba(0,0,0,1)');
    c.addColorStop(0.65, 'rgba(0,0,0,0.9)');
    c.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = c;
    ctx.beginPath();
    ctx.arc(catX, catY, ring, 0, Math.PI * 2);
    ctx.fill();

    ctx.filter = 'none';
    requestAnimationFrame(draw);
  }

  function start() {
    if (running) return;
    running = true;
    startT = performance.now();
    requestAnimationFrame(draw);
  }
  function stop() { running = false; }

  function aimAt(x, y) {
    var r = hero.getBoundingClientRect();
    targetAngle = Math.atan2(y - r.top - catY, x - r.left - catX);
    lastMove = performance.now();
  }
  hero.addEventListener('pointermove', function (e) { aimAt(e.clientX, e.clientY); });
  hero.addEventListener('pointerdown', function (e) { aimAt(e.clientX, e.clientY); });

  if (hint && window.matchMedia('(hover: none)').matches) hint.textContent = 'Drag to turn the cat. The dark is what it can’t see.';

  window.addEventListener('resize', layout);
  if (img.complete) layout(); else img.addEventListener('load', layout);
  layout();

  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (entries) {
      entries[0].isIntersecting ? (running || (running = true, requestAnimationFrame(draw))) : stop();
    }, { threshold: 0.05 }).observe(hero);
  }
  start();
})();
