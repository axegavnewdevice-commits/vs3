/* Gold light border: when a human move scores 25 or more, a fine line of gold light is drawn once around the outside of the
   board frame, glints twinkle in its wake, and the corners (and the place where it lands) bloom softly before it fades.
   (25+ one line, 40+ brighter, 60+ two lines that meet.)
   Self-contained overlay (fixed canvas, no pointer events). It only wraps window.showScorePopup, which the game
   already calls for every scored move (offline, vs computer and online). Any failure is swallowed: the game is never affected. */
(function () {
  'use strict';
  if (window.__fireBorder) return;      // (name kept from the earlier effects so nothing else changes)
  window.__fireBorder = true;

  var THRESHOLD = 25;
  var B = null, reduce = false, lite = false, cv = null, raf = 0, token = 0, sprites = null;
  var PAL = { base: '226,184,92', light: '255,246,212', deep: '160,112,36' };   // the gold of the tile backs

  function rgba(c, a) { return 'rgba(' + c + ',' + a + ')'; }

  function glowSprite(p) { var c = document.createElement('canvas'); c.width = c.height = 64; var g = c.getContext('2d'), r = g.createRadialGradient(32,32,0,32,32,32);
    r.addColorStop(0, rgba(p.light, .95)); r.addColorStop(.25, rgba(p.base, .5)); r.addColorStop(1, rgba(p.deep, 0)); g.fillStyle = r; g.fillRect(0,0,64,64); return c; }

  function stop() { token++; if (raf) cancelAnimationFrame(raf); raf = 0; if (cv && cv.parentNode) cv.parentNode.removeChild(cv); cv = null; }

  function play(points) {
    stop(); var my = token, P0 = PAL, GL;
    B = document.getElementById('game-board'); if (!B || !document.body) return;
    reduce = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
    lite = !!(document.body.classList && document.body.classList.contains('gfx-lite'));   // light graphics: no blur, fewer glints
    if (!B.getBoundingClientRect().width) return;
    if (!sprites) sprites = glowSprite(P0); GL = sprites;
    var lvl = points >= 60 ? 3 : points >= 40 ? 2 : 1;
    var dpr = lite ? 1 : Math.min(2, window.devicePixelRatio || 1), M = 46, INFL = 4, W = 0, S = 0, P = 0, K = 1;
    cv = document.createElement('canvas'); cv.setAttribute('aria-hidden', 'true');
    cv.style.cssText = 'position:fixed;z-index:99980;pointer-events:none;margin:0;padding:0;'; document.body.appendChild(cv);
    var ctx = cv.getContext('2d'); if (!ctx) { stop(); return; }
    function layout() { var r = B.getBoundingClientRect(), w = Math.round(r.width + INFL * 2);
      if (w !== W) { W = w; S = W + 2 * M; P = 4 * W; K = Math.max(.75, W / 750); cv.style.width = cv.style.height = S + 'px'; cv.width = cv.height = Math.round(S * dpr); }
      cv.style.left = Math.round(r.left - INFL - M) + 'px'; cv.style.top = Math.round(r.top - INFL - M) + 'px'; }
    layout();

    var heads = lvl === 3 ? [{ d: 1, f: .5 }, { d: -1, f: .5 }] : [{ d: 1, f: 1 }];
    var LAP = lvl === 3 ? 3.2 : 4.4, rate = [60, 90, 80][lvl - 1] * (lite ? .45 : 1), big = [1, 1.15, 1.3][lvl - 1];
    var FADE_AT = LAP + .6, FADE_LEN = 1.3, parts = [], acc = [0, 0], burst = false, last = performance.now(), t0 = last;

    function pt(s, d) { var sd = d > 0 ? s : P - s; sd = ((sd % P) + P) % P; var n = Math.floor(sd / W), t = sd - n * W; n %= 4;
      return n === 0 ? { x: W - t, y: 0, nx: 0, ny: -1 } : n === 1 ? { x: 0, y: t, nx: -1, ny: 0 } : n === 2 ? { x: t, y: W, nx: 0, ny: 1 } : { x: W, y: W - t, nx: 1, ny: 0 }; }
    function ease(u) { return .7 * u + .3 * (.5 - .5 * Math.cos(Math.PI * u)); }

    // a glint (4-point star) or a speck of dust, drifting slowly and twinkling
    function glint(x, y, vx, vy, sz, life, kind) { parts.push({ k: kind || 0, x: x, y: y, vx: vx, vy: vy, life: life, age: 0, sz: sz, sd: Math.random() * 6.28 }); }
    function bloom(p, size, life) { parts.push({ k: 2, x: p.x, y: p.y, vx: 0, vy: 0, life: life, age: 0, sz: size * K * big, sd: Math.random() * 1.5 }); }
    function crown(p, n, size) {   // a soft bloom of light with a ring and fine rays, and a few glints thrown outward
      var q = { x: p.x, y: p.y, nx: p.nx, ny: p.ny };
      if (p.x <= 1) q.nx = -1; else if (p.x >= W - 1) q.nx = 1; if (p.y <= 1) q.ny = -1; else if (p.y >= W - 1) q.ny = 1;
      var L = Math.hypot(q.nx, q.ny) || 1; q.nx /= L; q.ny /= L; bloom(q, size, 1.5);
      n = Math.round(n * (lite ? .4 : 1));
      for (var i = 0; i < n; i++) { var a = (Math.random() - .5) * 2.4, v = (30 + Math.random() * 80) * K, c = Math.cos(a), s = Math.sin(a);
        glint(q.x + q.nx * 3, q.y + q.ny * 3, (q.nx * c - q.ny * s) * v, (q.ny * c + q.nx * s) * v - 10 * K, (4 + Math.random() * 6) * K, 1 + Math.random() * .9, i % 4 ? 1 : 0); }
    }

    function emit(hd, i, s0, s1) {
      var c0 = Math.floor(s0 / W), c1 = Math.floor(s1 / W); if (c1 > c0 && c1 * W < P * hd.f - 1) crown(pt(c1 * W, hd.d), 10, 62);   // a bloom on every corner it rounds
      acc[i] += rate * LAP * ((s1 - s0) / (P * hd.f)); var g = 0;
      while (acc[i] >= 1 && g++ < 20) { acc[i]--;
        var p = pt(s0 + (s1 - s0) * Math.random() - Math.random() * 50 * K, hd.d), o = 2 + Math.random() * 16 * K;
        glint(p.x + p.nx * o, p.y + p.ny * o, p.nx * 6 * K, -9 * K - Math.random() * 10 * K, (4 + Math.random() * 6) * K * big, 1 + Math.random() * .9, Math.random() < .3 ? 0 : 1); }
    }

    function star(x, y, r, a, col) { var w = r * .13; ctx.globalAlpha = a; ctx.fillStyle = col; ctx.beginPath();
      ctx.moveTo(x, y - r); ctx.lineTo(x + w, y - w); ctx.lineTo(x + r, y); ctx.lineTo(x + w, y + w); ctx.lineTo(x, y + r); ctx.lineTo(x - w, y + w); ctx.lineTo(x - r, y); ctx.lineTo(x - w, y - w); ctx.closePath(); ctx.fill(); }

    // the line of light: drawn along the frame as the head travels; a gloss slides along it
    function ribbon(hd, s, t, al) {
      var pts = [], q = 0, c; var e = pt(s, hd.d); pts.push(pt(0, hd.d));
      for (c = 1; c * W < s; c++) pts.push(pt(c * W, hd.d)); pts.push(e);
      function line(col, w, blur) { ctx.beginPath(); pts.forEach(function (v, n) { n ? ctx.lineTo(v.x, v.y) : ctx.moveTo(v.x, v.y); });
        ctx.strokeStyle = col; ctx.lineWidth = w; ctx.shadowBlur = blur; ctx.shadowColor = rgba(P0.base, .9); ctx.stroke(); }
      ctx.save(); ctx.globalAlpha = al; ctx.lineJoin = ctx.lineCap = 'round';
      line(rgba(P0.base, .2), 7 * K, lite ? 0 : 14 * K);       // soft halo
      line(rgba(P0.base, .75), 2.2 * K, 0);                     // the gilded line
      line(rgba(P0.light, .95), .9 * K, 0);                     // bright hairline
      var gp = ((t * .55) % 1) * s; ctx.setLineDash([70 * K, P * 4]); ctx.lineDashOffset = -(gp - 35 * K);
      line(rgba(P0.light, .95), 3 * K, 0);                      // the gloss that slides along it
      ctx.restore();
      // head: a soft light with a fine cross flare
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; var hz = 26 * K * big; ctx.globalAlpha = al; ctx.drawImage(GL, e.x - hz, e.y - hz, hz * 2, hz * 2);
      star(e.x, e.y, 15 * K * big * (.85 + .15 * Math.sin(t * 9)), al * .95, rgba(P0.light, 1)); ctx.restore();
    }

    function frame(now) {
      if (my !== token) return;
      try {
        var dt = Math.min(.033, (now - last) / 1000); last = now; var t = (now - t0) / 1000;
        layout(); ctx.setTransform(dpr, 0, 0, dpr, M * dpr, M * dpr); ctx.clearRect(-M, -M, S, S);
        if (reduce) {   // calm alternative: the frame glows softly and fades, nothing moves
          var tt = t / 1.8, al = tt < .25 ? tt / .25 : Math.max(0, 1 - (tt - .25) / .75);
          if (al > 0) { ctx.save(); ctx.globalAlpha = al; ctx.strokeStyle = rgba(P0.base, .75); ctx.lineWidth = 2.4 * K; ctx.shadowColor = rgba(P0.base, .9); ctx.shadowBlur = 14 * K; ctx.strokeRect(0, 0, W, W);
            ctx.shadowBlur = 0; ctx.strokeStyle = rgba(P0.light, .95); ctx.lineWidth = .9 * K; ctx.strokeRect(0, 0, W, W); ctx.restore(); }
          if (t < 1.9) raf = requestAnimationFrame(frame); else stop(); return; }

        var mm = t < FADE_AT ? 1 : Math.max(0, 1 - (t - FADE_AT) / FADE_LEN), master = mm * mm * (3 - 2 * mm);
        var u = Math.min(1, t / LAP), e = ease(u), ep = ease(Math.max(0, Math.min(1, (t - dt) / LAP)));
        heads.forEach(function (hd, i) { var len = P * hd.f, s = len * e; if (u < 1) emit(hd, i, len * ep, s); if (master > 0) ribbon(hd, Math.max(1, s), t, master); });
        if (u >= 1 && !burst) { burst = true; if (lvl === 3) { var m = pt(P * .5, 1); crown(m, 34, 120); bloom(m, 70, 1.1); } else crown(pt(0, 1), lvl === 2 ? 22 : 16, 90); }   // arrival: the light settles in the corner and blooms

        parts = parts.filter(function (p) { return p.age < p.life; }); if (parts.length > (lite ? 120 : 320)) parts.splice(0, parts.length - (lite ? 120 : 320));
        parts.forEach(function (p) { p.age += dt; p.vx *= 1 - .9 * dt; p.vy *= 1 - .9 * dt; p.x += p.vx * dt + Math.sin(p.age * 4 + p.sd) * 4 * K * dt; p.y += p.vy * dt; });

        ctx.globalCompositeOperation = 'lighter';
        parts.forEach(function (p) { var a = p.age / p.life, env = Math.pow(Math.sin(Math.PI * Math.min(1, a)), 1.4);
          if (p.k === 2) {   // bloom: soft light, a thin ring and fine rays
            var g = Math.pow(1 - a, 1.4), sz = p.sz * (.35 + a * .9);
            ctx.globalAlpha = master * g * .75; ctx.drawImage(GL, p.x - sz, p.y - sz, sz * 2, sz * 2);
            ctx.strokeStyle = rgba(P0.light, .8); ctx.lineWidth = 1.1 * K; ctx.globalAlpha = master * g * .7;
            ctx.beginPath(); ctx.arc(p.x, p.y, p.sz * (.15 + a * .6), 0, 6.283); ctx.stroke();
            if (!lite) { ctx.lineWidth = .8 * K; ctx.globalAlpha = master * g * .6; ctx.beginPath();
              for (var n = 0; n < 8; n++) { var an = p.sd + n * .7854, r0 = p.sz * .12, r1 = p.sz * (.2 + a * .5); ctx.moveTo(p.x + Math.cos(an) * r0, p.y + Math.sin(an) * r0); ctx.lineTo(p.x + Math.cos(an) * r1, p.y + Math.sin(an) * r1); } ctx.stroke(); }
            return; }
          var tw = .65 + .35 * Math.sin(p.age * 15 + p.sd);   // twinkle
          if (p.k === 0) star(p.x, p.y, p.sz * (.5 + env * .7), master * env * tw, rgba(P0.light, 1));
          else { ctx.globalAlpha = master * env * tw * .9; var z = p.sz * .55; ctx.drawImage(GL, p.x - z, p.y - z, z * 2, z * 2); } });
        ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
        if (master > 0) raf = requestAnimationFrame(frame); else stop();
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
