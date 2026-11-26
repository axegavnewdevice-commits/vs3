/* Digital rain: when a human move scores 25 or more, Arabic letters (no digits) rain down INSIDE the board. Every board column holds two
   thin streams side by side (small letters, half a square wide). The rain always starts at the top middle of the board and spreads
   outwards to both sides. 25+ one stream per half column, 40+ two, 60+ three.
   The colour follows the theme (the same hues as the score popup) and the letters use the welcome page's Arabic font (Amiri).
   Self-contained overlay (fixed canvas exactly over the squares, no pointer events). It only wraps window.showScorePopup, which the game
   already calls for every scored move (offline, vs computer and online). Any failure is swallowed: the game is never affected. */
(function () {
  'use strict';
  if (window.__fireBorder) return;      // (name kept from the earlier effects so nothing else changes)
  window.__fireBorder = true;

  var THRESHOLD = 25;
  var B = null, reduce = false, lite = false, cv = null, raf = 0, token = 0, cache = {};
  // the 15 x 15 squares themselves (not the board's outer border), so every rain column sits exactly over a board column.
  // The board also holds other layers (the last-word outline is added after every move), so the corners are found by their
  // row/column, never by "first child / last child". If the board is being rebuilt, the last good measurement is kept.
  var lastBox = null;
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
  var FONT = '700 25px "Amiri","Scheherazade New","Noto Naskh Arabic","Traditional Arabic",serif';   // the welcome page's Arabic font
  var CH = 'ابتثجحخدذرزسشصضطظعغفقكلمنهوي'.split('');                                                   // Arabic letters only, no digits
  function rgba(c, a) { return 'rgba(' + c + ',' + a + ')'; }

  function getAtlas(key) {   // every letter pre-drawn once per tint: drawing a letter later is a cheap image copy
    if (cache[key]) return cache[key]; var T = THEMES[key];
    var a = [T.head, T.bright, T.dim].map(function (col) { var c = document.createElement('canvas'); c.width = CH.length * 32; c.height = 32; var g = c.getContext('2d');
      g.font = FONT; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = rgba(col, 1);
      CH.forEach(function (ch, i) { g.fillText(ch, i * 32 + 16, 17); }); return c; });
    var gl = document.createElement('canvas'); gl.width = gl.height = 64; var g2 = gl.getContext('2d'), rg = g2.createRadialGradient(32,32,0,32,32,32);
    rg.addColorStop(0, rgba(T.head, .95)); rg.addColorStop(.3, rgba(T.bright, .5)); rg.addColorStop(1, rgba(T.dim, 0)); g2.fillStyle = rg; g2.fillRect(0,0,64,64);
    var r = { a: a, g: gl };
    try { if (!document.fonts || document.fonts.check('700 25px Amiri')) cache[key] = r; } catch (_) { cache[key] = r; }   // if the font was not ready yet, draw again next time
    return r;
  }

  function stop() { token++; if (raf) cancelAnimationFrame(raf); raf = 0; if (cv && cv.parentNode) cv.parentNode.removeChild(cv); cv = null; }

  function play(points) {
    stop(); var my = token;
    B = document.getElementById('game-board'); if (!B || !document.body) return;
    lastBox = null;
    reduce = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
    lite = !!(document.body.classList && document.body.classList.contains('gfx-lite'));   // light graphics: every other column, no glow
    if (!gridBox()) return;
    var TK = themeKey(), T = THEMES[TK], AT = getAtlas(TK).a, GL = getAtlas(TK).g;
    var lvl = points >= 60 ? 3 : points >= 40 ? 2 : 1, dpr = lite ? 1 : Math.min(2, window.devicePixelRatio || 1), W = 0, H = 0, C = 20, R = 20, cw = 10, ch = 10;
    cv = document.createElement('canvas'); cv.setAttribute('aria-hidden', 'true');
    cv.style.cssText = 'position:fixed;z-index:99980;pointer-events:none;margin:0;padding:0;'; document.body.appendChild(cv);
    var ctx = cv.getContext('2d'); if (!ctx) { stop(); return; }
    function layout() { var r = gridBox() || { left: 0, top: 0, width: W, height: H }, w = Math.round(r.width), h = Math.round(r.height);
      if (w !== W || h !== H) { W = w; H = h; C = W / 15; R = H / 15; cw = C / 2; ch = R / 2; cv.style.width = W + 'px'; cv.style.height = H + 'px'; cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }   // the canvas is exactly the board: nothing is drawn outside it
      cv.style.left = Math.round(r.left) + 'px'; cv.style.top = Math.round(r.top) + 'px'; }
    layout();

    // two thin streams per board column (30 in all, more of them at higher scores). All of them start at the top; the first ones fall in the
    // middle of the board and the rest follow outwards to the left and right, in every score level
    var NS = [1, 2, 3][lvl - 1], SW = lvl === 3 ? 1.1 : 1.4, streams = [], end = 0;
    for (var sc = 0; sc < 30; sc++) { if (lite && Math.floor(sc / 2) % 2) continue;
      for (var j = 0; j < NS; j++) { var n = 10 + Math.floor(Math.random() * 9), vy = R * (8 + Math.random() * 4), g = [];
        for (var i = 0; i < n; i++) g.push(Math.floor(Math.random() * CH.length));
        var base = Math.abs((sc + .5) / 2 - 7.5) / 7.5 * SW, st = base + j * .65 + Math.random() * .35;
        streams.push({ sc: sc, start: st, vy: vy, n: n, g: g, fl: 0 }); end = Math.max(end, st + (H + n * ch + ch) / vy); } }
    var last = performance.now(), t0 = last;

    function frame(now) {
      if (my !== token) return;
      try {
        var dt = Math.min(.033, (now - last) / 1000); last = now; var t = (now - t0) / 1000;
        layout(); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
        if (reduce) {   // calm alternative: the board takes a faint green wash and releases it, nothing moves
          var tt = t / 1.8, al = tt < .25 ? tt / .25 : Math.max(0, 1 - (tt - .25) / .75);
          if (al > 0) { ctx.globalAlpha = al * .22; ctx.fillStyle = rgba(T.bright, 1); ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1; }
          if (t < 1.9) raf = requestAnimationFrame(frame); else stop(); return; }
        var live = 0;
        streams.forEach(function (s) {
          if (t < s.start) { live++; return; }
          var y = (t - s.start) * s.vy - ch * .5; if (y - s.n * ch > H) return; live++;
          s.fl -= dt; if (s.fl <= 0) { s.fl = .07; s.g[Math.floor(Math.random() * s.n)] = Math.floor(Math.random() * CH.length); }   // letters keep changing
          var x = s.sc * cw, fin = Math.min(1, (t - s.start) / .1);
          for (var i = 0; i < s.n; i++) { var gy = y - i * ch; if (gy < -ch || gy > H + ch) continue;
            var a = fin * (i === 0 ? 1 : Math.pow(1 - i / s.n, 1.2));
            ctx.globalAlpha = a * .5; ctx.fillStyle = 'rgb(' + T.dk + ')'; ctx.fillRect(x, gy - ch / 2, cw, ch);                  // a dark cell behind each letter keeps it readable on tiles and squares alike
            ctx.globalAlpha = a; ctx.drawImage(AT[i === 0 ? 0 : i < 5 ? 1 : 2], s.g[i] * 32, 0, 32, 32, x + cw * .04, gy - ch * .46, cw * .92, ch * .92); }
          if (!lite && y > 0 && y < H) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = .6 * fin; ctx.drawImage(GL, x - cw * .6, y - ch * 1.1, cw * 2.2, ch * 2.2); ctx.restore(); }   // the bright head of each stream
        });
        ctx.globalAlpha = 1;
        if (live) raf = requestAnimationFrame(frame); else stop();
      } catch (_) { stop(); }
    }
    raf = requestAnimationFrame(frame);
  }

  function hook() {
    var orig = window.showScorePopup;
    if (typeof orig !== 'function' || orig.__fire) return !!(orig && orig.__fire);
    var wrapped = function (seat, points) {
      try {
        var p = Math.round(Number(points));
        // only human moves: the computer opponent drives the game with CPU.acting set
        if (p >= THRESHOLD && !document.hidden && !(window.CPU && window.CPU.acting)) play(p);
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
})();
