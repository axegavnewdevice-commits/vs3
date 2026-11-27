/* Digital rain: when a human move scores 25 or more, Arabic letters (no digits) rain down INSIDE the board. Every one of the 15 board columns holds
   thin streams (small letters, half a square wide), in EVERY graphics setting. The rain starts at the top middle and reaches the outer columns
   within about a tenth of a second, so the whole board is raining at once. 25+ one stream per half column, 40+ two, 60+ three.
   The colour follows the theme (the same hues as the score popup) and the letters use the welcome page's Arabic font (Amiri).
   Smooth by design:
   - the animation runs in a Web Worker on an OffscreenCanvas where the device supports it, so the game redrawing the board, the word blink and
     the score popup (all on the main thread) can never make the rain stutter or start late; older devices run the very same engine on the page;
   - the canvas is created once and kept (hidden between rains), the letter pictures are prepared in advance when the page is idle (and again
     after a theme change), so nothing is built or uploaded at the moment of the move;
   - every position comes from the clock, so the speed is the same at 30, 60, 90 or 120 frames per second, and is measured in board squares, so
     it is the same on a phone, tablet, desktop or TV;
   - a slow device is detected while the rain plays and the glow / extra layers are dropped (the columns always stay).
   Self-contained overlay (fixed canvas exactly over the squares, no pointer events). It only wraps window.showScorePopup, which the game
   already calls for every scored move (offline, vs computer and online). Any failure is swallowed: the game is never affected. */
(function () {
  'use strict';
  if (window.__fireBorder) return;      // (name kept from the earlier effects so nothing else changes)
  window.__fireBorder = true;

  var THRESHOLD = 25;
  var B = null, lite = false, cache = {}, lastBox = null;
  var CH = 'ابتثجحخدذرزسشصضطظعغفقكلمنهوي'.split('');                                                   // Arabic letters only, no digits
  var FONT = '700 23px "Amiri","Scheherazade New","Noto Naskh Arabic","Traditional Arabic",serif';   // the welcome page's Arabic font

  /* ===================== the animation engine =====================
     Self-contained on purpose (no outside names): the very same source runs inside a worker or, when that is not possible, on the page. */
  function rainEngine(post) {
    var G = self, curId = 0, cv = null, ctx = null, atlases = {}, raf = 0, token = 0, W = 0, H = 0, dpr = 1;
    var rq = G.requestAnimationFrame ? function (f) { return G.requestAnimationFrame(f); } : function (f) { return setTimeout(function () { f(performance.now()); }, 16); };
    var cq = G.cancelAnimationFrame ? function (i) { G.cancelAnimationFrame(i); } : function (i) { clearTimeout(i); };
    function size(w, h, d) { if (!cv) return; if (w !== W || h !== H || d !== dpr) { W = w; H = h; dpr = d; cv.width = Math.max(1, Math.round(w * d)); cv.height = Math.max(1, Math.round(h * d)); } }
    function clear() { try { if (ctx) { ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, cv.width, cv.height); } } catch (_) {} }
    function stop(silent) { token++; if (raf) cq(raf); raf = 0; clear(); if (!silent) post({ t: 'done', id: curId }); }

    // draw every picture once, invisibly, on the real canvas size: the canvas surface and the picture textures are created now (when the page is idle),
    // not at the moment of the move
    function warm(m) {
      var atl = atlases[m.key]; if (!cv || !ctx || !atl || raf) return;
      size(m.w, m.h, m.dpr); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = .02;
      for (var i = 0; i < 3; i++) ctx.drawImage(atl.a[i], 0, 0, 32, 32, 0, 0, 8, 8);
      ctx.drawImage(atl.g, 0, 0, 8, 8); ctx.globalAlpha = 1; ctx.clearRect(0, 0, cv.width, cv.height);
    }

    function play(m) {
      stop(true); var my = token; curId = m.id;
      var atl = atlases[m.key]; if (!cv || !ctx || !atl) { post({ t: 'done', id: curId }); return; }
      var AT = atl.a, GL = atl.g, NC = atl.n, lite = m.lite, reduce = m.reduce, bright = m.bright;
      size(m.w, m.h, m.dpr);
      var C = W / 15, R = H / 15, cw = C / 2, ch = R / 2, hh = ch * 1.1, NS = [1, 2, 3][m.lvl - 1];
      // Streams: two thin ones per board column (light graphics: one per column), more of them at higher scores. Every column takes part in every
      // setting. They all start at the top; the middle columns go first and the outer ones follow a heartbeat later (0.12 s at most), then each
      // extra layer follows its predecessor closely, so the whole board is raining straight away and the rain is over in about two seconds.
      var streams = [], col, h, j, i, n, g, st, vy, per = lite ? 1 : 2;
      for (col = 0; col < 15; col++) for (h = 0; h < per; h++) for (j = 0; j < NS; j++) {
        n = 10 + Math.floor(Math.random() * 9); g = [];
        for (i = 0; i < n; i++) g.push(Math.floor(Math.random() * NC));
        vy = R * (13 + Math.random() * 5);                                              // squares per second, the same on every screen
        st = Math.abs(col - 7) / 7 * .12 + j * .3 + Math.random() * .07;
        streams.push({ x: lite ? col * C + C / 4 : col * C + h * cw, j: j, start: st, vy: vy, n: n, g: g, fl: 0, hy: 0, hf: 0 });
      }
      var SN = streams.length, t0 = 0, last = 0, slow = 0, nf = 0, degraded = false, told = false;

      function frame(now) {
        if (my !== token) return;
        try {
          if (!t0) { t0 = last = now; }
          var rawdt = (now - last) / 1000, dt = Math.min(.033, rawdt); last = now; var t = (now - t0) / 1000 + .05;   // 50 ms head start: the very first picture already shows the rain entering at the top
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
          if (reduce) {   // calm alternative: the board takes a faint wash of the theme colour and releases it, nothing moves
            var tt = t / 1.8, al = tt < .25 ? tt / .25 : Math.max(0, 1 - (tt - .25) / .75);
            if (al > 0) { ctx.globalAlpha = al * .22; ctx.fillStyle = 'rgb(' + bright + ')'; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1; }
            if (t < 1.9) raf = rq(frame); else stop(); return; }
          // slow device? (a long run of frames above ~26 ms): drop the glow and the extra layers; the columns always stay
          if (nf++ > 4 && !degraded) { slow = rawdt > .026 ? slow + 1 : Math.max(0, slow - 1); if (slow >= 8) degraded = true; }
          var live = 0, heads = 0, s, y, fin, gy, a, k, tail;
          for (k = 0; k < SN; k++) {
            s = streams[k];
            if (degraded && s.j > 0) continue;
            if (t < s.start) { live++; continue; }
            y = (t - s.start) * s.vy - ch * .5; if (y - s.n * ch > H) continue; live++;
            s.fl -= dt; if (s.fl <= 0) { s.fl = .07; s.g[(Math.random() * s.n) | 0] = (Math.random() * NC) | 0; }   // letters keep changing
            fin = Math.min(1, (t - s.start) / .06);
            for (i = 0; i < s.n; i++) { gy = y - i * ch; if (gy < -ch || gy > H + ch) continue;
              a = fin * (i === 0 ? 1 : Math.pow(1 - i / s.n, 1.2)); if (a < .03) continue;
              ctx.globalAlpha = a; ctx.drawImage(AT[i === 0 ? 0 : i < 5 ? 1 : 2], s.g[i] * 32, 0, 32, 32, s.x, gy - ch / 2, cw, ch); }   // one image copy per letter
            if (y > 0 && y < H) { s.hy = y; s.hf = fin; heads++; } else s.hf = 0;
          }
          if (!lite && !degraded && heads) {   // the bright heads, all in one pass
            ctx.globalCompositeOperation = 'lighter';
            for (k = 0; k < SN; k++) { s = streams[k]; if (s.hf > 0) { ctx.globalAlpha = .6 * s.hf; ctx.drawImage(GL, s.x - cw * .6, s.hy - hh, cw * 2.2, ch * 2.2); } }
            ctx.globalCompositeOperation = 'source-over';
          }
          ctx.globalAlpha = 1;
          if (!told) { told = true; post({ t: 'first', id: curId, at: Date.now() }); }
          if (live) raf = rq(frame); else stop();
        } catch (_) { stop(); }
      }
      raf = rq(frame);
    }

    return function handle(m) {
      try {
        if (m.t === 'canvas') { cv = m.canvas; ctx = cv.getContext('2d'); W = H = 0; }
        else if (m.t === 'atlas') { atlases[m.key] = { a: m.a, g: m.g, n: m.n }; }
        else if (m.t === 'size') { size(m.w, m.h, m.dpr); }
        else if (m.t === 'play') { play(m); }
        else if (m.t === 'warm') { warm(m); }
        else if (m.t === 'stop') { stop(true); }
        else if (m.t === 'ping') { post({ t: 'pong' }); }
      } catch (_) { post({ t: 'done', id: curId }); }
    };
  }

  /* ===================== page side ===================== */
  // the 15 x 15 squares themselves (not the board's outer border), so every rain column sits exactly over a board column.
  // The board also holds other layers (the last-word outline is added after every move), so the corners are found by their
  // row/column, never by "first child / last child". If the board is being rebuilt, the last good measurement is kept.
  function gridBox() {
    if (!B) return lastBox;
    var a = B.querySelector(':scope > .square[data-r="0"][data-c="0"]'), z = B.querySelector(':scope > .square[data-r="14"][data-c="14"]');
    if (!a || !z) return lastBox;
    var p = a.getBoundingClientRect(), q = z.getBoundingClientRect();
    // the page can be right-to-left (first square at the top RIGHT), so take the outer edges of both squares, whichever way round they are
    var left = Math.min(p.left, q.left), top = Math.min(p.top, q.top), w = Math.max(p.right, q.right) - left, h = Math.max(p.bottom, q.bottom) - top;
    if (!(w > 0) || !(h > 0)) return lastBox;
    return (lastBox = { left: left, top: top, width: w, height: h });
  }
  function themeKey() {
    var c = document.body.classList;
    return c.contains('girly-mode') ? 'girly' : c.contains('horror-mode') ? 'horror' : c.contains('academic-mode') ? 'academic' : c.contains('dark-mode') ? 'dark' : 'default';
  }

  // one colour family per theme (the same hues the score popup already uses): head = near-white tint, bright, dim tail, dark cell behind the letters
  var THEMES = {
    default:  { head: '238,255,216', bright: '168,232,108', dim: '88,156,52',  dk: '12,20,6' },    // army: light army green
    girly:    { head: '255,244,248', bright: '255,176,212', dim: '226,84,146', dk: '62,8,32' },    // rose pink
    horror:   { head: '255,222,208', bright: '255,106,74',  dim: '196,34,34',  dk: '22,2,2' },     // blood orange-red
    academic: { head: '240,247,255', bright: '124,180,242', dim: '62,112,192',  dk: '6,14,36' },    // scholar blue
    dark:     { head: '255,247,218', bright: '236,208,124', dim: '166,132,52',  dk: '12,11,4' }     // gold
  };
  function rgba(c, a) { return 'rgba(' + c + ',' + a + ')'; }
  function fontReady() { try { return !document.fonts || document.fonts.check('700 23px Amiri'); } catch (_) { return true; } }

  // every letter pre-drawn once per tint, with its dark cell already behind it: drawing a letter later is ONE cheap image copy
  function buildAtlas(key) {
    var T = THEMES[key];
    var a = [T.head, T.bright, T.dim].map(function (col) { var c = document.createElement('canvas'); c.width = CH.length * 32; c.height = 32; var g = c.getContext('2d');
      g.font = FONT; g.textAlign = 'center'; g.textBaseline = 'middle';
      CH.forEach(function (ch, i) { g.fillStyle = rgba(T.dk, .5); g.fillRect(i * 32, 0, 32, 32); g.fillStyle = rgba(col, 1); g.fillText(ch, i * 32 + 16, 17); }); return c; });
    var gl = document.createElement('canvas'); gl.width = gl.height = 64; var g2 = gl.getContext('2d'), rg = g2.createRadialGradient(32,32,0,32,32,32);
    rg.addColorStop(0, rgba(T.head, .95)); rg.addColorStop(.3, rgba(T.bright, .5)); rg.addColorStop(1, rgba(T.dim, 0)); g2.fillStyle = rg; g2.fillRect(0,0,64,64);
    return { a: a, g: gl, ok: fontReady(), sent: false };
  }
  function getAtlas(key) { return cache[key] || (cache[key] = buildAtlas(key)); }   // an atlas drawn before the font arrived is replaced by prewarm() once it has

  // ---- the worker (best case) ----
  var playId = 0, wk = null, wkState = 0;   // 0 = not tried, 1 = starting, 2 = alive, -1 = not available
  function canWorker() {
    try { return !!(window.Worker && window.OffscreenCanvas && window.Blob && window.URL && URL.createObjectURL && window.createImageBitmap && HTMLCanvasElement.prototype.transferControlToOffscreen); } catch (_) { return false; }
  }
  function killWorker() { wkState = -1; try { if (wk && wk.w) wk.w.terminate(); } catch (_) {} wk = null; }
  function startWorker() {
    if (wkState !== 0) return; wkState = 1;
    try {
      if (!canWorker() || !document.body) { wkState = -1; return; }
      var src = '(function(){var E=(' + rainEngine.toString() + ')(function(m){self.postMessage(m)});self.onmessage=function(e){E(e.data)};})();';
      var url = URL.createObjectURL(new Blob([src], { type: 'application/javascript' }));
      var w = new Worker(url); try { URL.revokeObjectURL(url); } catch (_) {}
      var el = makeCanvas(); document.body.appendChild(el);
      var off = el.transferControlToOffscreen();
      wk = { w: w, el: el, W: 0, H: 0, D: 0, atlas: {} };
      w.onmessage = function (e) { var d = e.data || {}; if (d.t === 'pong') wkState = 2; else if (d.t === 'done' && d.id === playId) hide(wk && wk.el); else if (d.t === 'first') trace(d); };
      w.onerror = w.onmessageerror = function () { var el2 = wk && wk.el; killWorker(); if (el2 && el2.parentNode) el2.parentNode.removeChild(el2); };
      w.postMessage({ t: 'canvas', canvas: off }, [off]);
      w.postMessage({ t: 'ping' });
      setTimeout(function () { if (wkState === 1) { var el3 = wk && wk.el; killWorker(); if (el3 && el3.parentNode) el3.parentNode.removeChild(el3); } }, 4000);
    } catch (_) { var el4 = wk && wk.el; killWorker(); if (el4 && el4.parentNode) el4.parentNode.removeChild(el4); }
  }
  function sendAtlas(key, at) {   // pictures -> the worker (ImageBitmaps are moved, not copied; the page keeps its own canvases)
    if (!wk || wkState < 1 || at.sent === wk) return; at.sent = wk; var me = wk;
    try {
      Promise.all(at.a.concat([at.g]).map(function (c) { return createImageBitmap(c); })).then(function (b) {
        if (wk !== me) return; var g = b.pop();
        me.w.postMessage({ t: 'atlas', key: key, a: b, g: g, n: CH.length }, b.concat([g]));
        me.atlas[key] = at; warmNow(key, at);
      }, function () { at.sent = false; });
    } catch (_) { at.sent = false; }
  }

  // ---- the page engine (same code, used when there is no worker, or its pictures are not there yet) ----
  var pageEngine = null, pageEl = null, pageDone = null;
  function makeCanvas() {
    var c = document.createElement('canvas'); c.setAttribute('aria-hidden', 'true');
    c.style.cssText = 'position:fixed;z-index:99980;pointer-events:none;margin:0;padding:0;left:0;top:0;width:1px;height:1px;visibility:hidden;contain:strict;'; return c;
  }
  function hide(el) { try { if (el) el.style.visibility = 'hidden'; } catch (_) {} }

  // prepare the pictures (and the resting canvas) for the current theme while the page is idle, so the first rain never builds anything
  function prewarm() {
    try {
      startWorker();
      var key = themeKey(); var at = cache[key];
      if (at && at.ok) { sendAtlas(key, at); warmNow(key, at); return; }
      var go = function () { try { var cur = cache[key]; if (!cur || !cur.ok) { delete cache[key]; cur = getAtlas(key); } sendAtlas(key, cur); warmNow(key, cur); } catch (_) {} };
      if (document.fonts && document.fonts.load) {
        var done = false, fin = function () { if (!done) { done = true; go(); } };
        document.fonts.load('700 23px Amiri', CH.join('')).then(fin, fin); setTimeout(fin, 2500);
      } else go();
    } catch (_) {}
  }
  function later(fn) { try { if (window.requestIdleCallback) requestIdleCallback(fn, { timeout: 1500 }); else setTimeout(fn, 250); } catch (_) { setTimeout(fn, 250); } }

  // canvas size for the board as it is now (the same numbers play() uses)
  function dimsNow() {
    try {
      var bd = document.getElementById('game-board'); if (!bd) return null; B = bd;
      var bx = gridBox(); if (!bx) return null;
      var lt = !!(document.body.classList && document.body.classList.contains('gfx-lite')), md = lt ? 1 : Math.min(2, window.devicePixelRatio || 1), w = Math.round(bx.width), h = Math.round(bx.height);
      return { w: w, h: h, dpr: Math.max(1, Math.min(md, 1100 / Math.max(w, h))) };
    } catch (_) { return null; }
  }
  function warmNow(key, at) {
    try {
      var d = dimsNow(); if (!d) return; var m = { t: 'warm', key: key, w: d.w, h: d.h, dpr: d.dpr };
      if (wk && wkState >= 1 && wk.atlas[key] === at) wk.w.postMessage(m);
      else if (wkState === -1) {   // no worker on this device: warm the page canvas instead
        if (!pageEl || !pageEl.parentNode) { pageEl = makeCanvas(); document.body.appendChild(pageEl); pageEngine = null; }
        if (!pageEngine) { pageEngine = rainEngine(pageReply); pageEngine({ t: 'canvas', canvas: pageEl }); }
        pageEngine({ t: 'atlas', key: key, a: at.a, g: at.g, n: CH.length }); pageEngine(m);
      }
    } catch (_) {}
  }
  function pageReply(m) { if (m.t === 'done' && m.id === playId) hide(pageEl); else if (m.t === 'first') trace(m); }
  function trace(m) { try { if (typeof window.__rainTrace === 'function') window.__rainTrace(m); } catch (_) {} }

  var lastUse = null;
  function stop() {
    try { if (wk && wkState >= 1) { wk.w.postMessage({ t: 'stop' }); hide(wk.el); } } catch (_) {}
    try { if (pageEngine) pageEngine({ t: 'stop' }); hide(pageEl); } catch (_) {}
    if (measureTimer) { clearInterval(measureTimer); measureTimer = 0; }
  }
  var measureTimer = 0;

  function play(points) {
    stop();
    B = document.getElementById('game-board'); if (!B || !document.body) return;
    lastBox = null;
    var reduce = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
    lite = !!(document.body.classList && document.body.classList.contains('gfx-lite'));   // light graphics: one stream per column, no glow, a smaller canvas
    var box = gridBox(); if (!box) return;
    var key = themeKey(), T = THEMES[key], at = getAtlas(key);
    var lvl = points >= 60 ? 3 : points >= 40 ? 2 : 1, maxDpr = lite ? 1 : Math.min(2, window.devicePixelRatio || 1);
    var w = Math.round(box.width), h = Math.round(box.height);
    var dpr = Math.max(1, Math.min(maxDpr, 1100 / Math.max(w, h)));   // never an oversized canvas on a big screen
    var msg = { t: 'play', id: ++playId, key: key, w: w, h: h, dpr: dpr, lvl: lvl, lite: lite, reduce: reduce, bright: T.bright };

    var useWorker = wkState === 2 && wk && wk.atlas[key] === at;
    var el;
    if (useWorker) { el = wk.el; }
    else {
      if (!pageEl || !pageEl.parentNode) { pageEl = makeCanvas(); document.body.appendChild(pageEl); pageEngine = null; }
      if (!pageEngine) { pageEngine = rainEngine(pageReply); pageEngine({ t: 'canvas', canvas: pageEl }); }
      pageEngine({ t: 'atlas', key: key, a: at.a, g: at.g, n: CH.length });
      el = pageEl;
    }
    el.style.width = w + 'px'; el.style.height = h + 'px'; el.style.left = Math.round(box.left) + 'px'; el.style.top = Math.round(box.top) + 'px';
    el.style.visibility = 'visible';
    if (useWorker) wk.w.postMessage(msg); else pageEngine(msg);
    lastUse = { el: el, w: w, h: h, dpr: dpr, worker: useWorker };
    // the board is measured a few times a second (not on every frame); the canvas follows it if the window is resized or rotated mid-rain
    measureTimer = setInterval(function () {
      try { var b = gridBox(); if (!b || !lastUse) return; var nw = Math.round(b.width), nh = Math.round(b.height), u = lastUse;
        u.el.style.left = Math.round(b.left) + 'px'; u.el.style.top = Math.round(b.top) + 'px';
        if (nw !== u.w || nh !== u.h) { u.w = nw; u.h = nh; u.el.style.width = nw + 'px'; u.el.style.height = nh + 'px';
          var m = { t: 'size', w: nw, h: nh, dpr: Math.max(1, Math.min(maxDpr, 1100 / Math.max(nw, nh))) };
          if (u.worker && wk) wk.w.postMessage(m); else if (pageEngine) pageEngine(m); }
      } catch (_) {}
    }, 250);
    // safety net: whatever happens, the overlay is gone after 6 seconds
    var mine = measureTimer; setTimeout(function () { if (measureTimer === mine) stop(); }, 6000);
  }

  function hook() {
    var orig = window.showScorePopup;
    if (typeof orig !== 'function' || orig.__fire) return !!(orig && orig.__fire);
    var wrapped = function (seat, points) {
      try {
        var p = Math.round(Number(points));
        // only human moves: the computer opponent drives the game with CPU.acting set
        if (p >= THRESHOLD && !document.hidden && !(window.CPU && window.CPU.acting) && !document.body.classList.contains('circle-mode')) play(p);   // the hidden circle theme has no 25+ effect
      } catch (_) {}
      return orig.apply(this, arguments);
    };
    wrapped.__fire = true;
    window.showScorePopup = wrapped;
    return true;
  }

  // the game defines showScorePopup in its own script: hook as soon as it exists
  if (!hook()) {
    var tries = 0, iv = setInterval(function () { if (hook() || ++tries > 100) clearInterval(iv); }, 100);
    window.addEventListener('load', function () { hook(); });
  }
  window.addEventListener('pagehide', stop);

  // pictures ready before the first rain: once the page has loaded, and again whenever the theme changes
  var warm = function () { later(prewarm); };
  if (document.readyState === 'complete') warm(); else window.addEventListener('load', warm);
  try { if (window.MutationObserver && document.body) new MutationObserver(warm).observe(document.body, { attributes: true, attributeFilter: ['class'] }); } catch (_) {}
})();
