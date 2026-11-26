/* Water border: when a human move scores 25 or more, a wave of water runs once around the outside of the board frame,
   splashes at every corner and where it lands, then dissolves. (25+ one wave, 40+ bigger, 60+ two waves that meet.)
   Self-contained overlay (fixed canvas, no pointer events). It only wraps window.showScorePopup, which the game
   already calls for every scored move (offline, vs computer and online). Any failure is swallowed: the game is never affected. */
(function () {
  'use strict';
  if (window.__fireBorder) return;      // (name kept from the old effect so nothing else changes)
  window.__fireBorder = true;

  var THRESHOLD = 25;
  var B = null, reduce = false, lite = false, cv = null, raf = 0, token = 0, sprites = null;

  function mk(stops) { var c = document.createElement('canvas'); c.width = c.height = 64; var g = c.getContext('2d'), r = g.createRadialGradient(32,32,0,32,32,32);
    stops.forEach(function (s) { r.addColorStop(s[0], s[1]); }); g.fillStyle = r; g.fillRect(0,0,64,64); return c; }
  function bubble() { var c = document.createElement('canvas'); c.width = c.height = 64; var g = c.getContext('2d');
    g.fillStyle = 'rgba(160,225,255,.14)'; g.beginPath(); g.arc(32,32,26,0,6.283); g.fill();
    g.strokeStyle = 'rgba(225,248,255,.9)'; g.lineWidth = 4; g.stroke();
    g.fillStyle = 'rgba(255,255,255,.95)'; g.beginPath(); g.arc(23,22,6,0,6.283); g.fill(); return c; }
  function getSprites() { return sprites || (sprites = {
    drop: mk([[0,'rgba(240,253,255,1)'],[.28,'rgba(125,218,255,.92)'],[.62,'rgba(35,135,230,.45)'],[1,'rgba(10,70,190,0)']]),
    mist: mk([[0,'rgba(165,230,255,.5)'],[.5,'rgba(70,170,240,.2)'],[1,'rgba(20,100,210,0)']]),
    bub: bubble() }); }

  function stop() { token++; if (raf) cancelAnimationFrame(raf); raf = 0; if (cv && cv.parentNode) cv.parentNode.removeChild(cv); cv = null; }

  function play(points) {
    stop(); var my = token, SP = getSprites();
    B = document.getElementById('game-board'); if (!B || !document.body) return;
    reduce = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
    lite = !!(document.body.classList && document.body.classList.contains('gfx-lite'));   // light graphics: no blur, fewer drops
    var rect = B.getBoundingClientRect(); if (!rect.width) { return; }
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
    var LAP = lvl === 3 ? 3.2 : 4.4, rate = [260, 340, 300][lvl - 1] * (lite ? .4 : 1), big = [1.1, 1.3, 1.45][lvl - 1];
    var FADE_AT = LAP + .6, FADE_LEN = 1.2, parts = [], acc = [0, 0], burst = false, last = performance.now(), t0 = last;

    function pt(s, d) { var sd = d > 0 ? s : P - s; sd = ((sd % P) + P) % P; var n = Math.floor(sd / W), t = sd - n * W; n %= 4;
      return n === 0 ? { x: W - t, y: 0, nx: 0, ny: -1 } : n === 1 ? { x: 0, y: t, nx: -1, ny: 0 } : n === 2 ? { x: t, y: W, nx: 0, ny: 1 } : { x: W, y: W - t, nx: 1, ny: 0 }; }
    function ease(u) { return .7 * u + .3 * (.5 - .5 * Math.cos(Math.PI * u)); }

    function drop(p, spread, up) { var a = (Math.random() - .5) * spread, v = (80 + Math.random() * 190) * K;
      parts.push({ k: 0, x: p.x + p.nx * 3, y: p.y + p.ny * 3, vx: (p.nx * Math.cos(a) - p.ny * Math.sin(a)) * v, vy: (p.ny * Math.cos(a) + p.nx * Math.sin(a)) * v - up * K,
        life: .6 + Math.random() * .7, age: 0, sz: (7 + Math.random() * 9) * K * big, sd: 0 }); }
    // a splash crown: a burst of droplets and mist thrown outward (corners and where the water arrives)
    function crown(p, n) { n = Math.round(n * (lite ? .4 : 1)); var q = { x: p.x, y: p.y, nx: p.nx, ny: p.ny };
      if (p.x <= 1) q.nx = -1; else if (p.x >= W - 1) q.nx = 1; if (p.y <= 1) q.ny = -1; else if (p.y >= W - 1) q.ny = 1;
      var L = Math.hypot(q.nx, q.ny) || 1; q.nx /= L; q.ny /= L;
      for (var i = 0; i < n; i++) drop(q, 2.2, 170);
      parts.push({ k: 1, x: q.x, y: q.y, vx: q.nx * 20 * K, vy: q.ny * 20 * K - 10 * K, life: 1.1, age: 0, sz: 70 * K * big, sd: 0 });
      if (!lite) for (var j = 0; j < 4; j++) parts.push({ k: 2, x: q.x + q.nx * 6, y: q.y + q.ny * 6, vx: q.nx * 25 * K, vy: -20 * K - Math.random() * 30 * K, life: 1.2 + Math.random() * .8, age: 0, sz: (6 + Math.random() * 6) * K, sd: Math.random() * 6.28 }); }

    function emit(hd, i, s0, s1, tp) {
      acc[i] += rate * LAP * ((s1 - s0) / (P * hd.f)) * tp; var g = 0;
      var c0 = Math.floor(s0 / W), c1 = Math.floor(s1 / W); if (c1 > c0 && c1 * W < P * hd.f - 1) crown(pt(c1 * W, hd.d), 40);   // splash on every corner it rounds
      while (acc[i] >= 1 && g++ < 40) { acc[i]--;
        var p = pt(s0 + (s1 - s0) * Math.random(), hd.d); drop(p, 1.3, 40);
        if (Math.random() < .55) parts.push({ k: 1, x: p.x + p.nx * 4, y: p.y + p.ny * 4, vx: p.nx * 12 * K, vy: p.ny * 12 * K - 8 * K, life: .8 + Math.random() * .5, age: 0, sz: (22 + Math.random() * 18) * K * big, sd: 0 });
        if (!lite && Math.random() < .3) parts.push({ k: 2, x: p.x + p.nx * 6, y: p.y + p.ny * 6, vx: p.nx * 10 * K, vy: -22 * K - Math.random() * 28 * K, life: 1.1 + Math.random() * .8, age: 0, sz: (5 + Math.random() * 6) * K, sd: Math.random() * 6.28 });
      }
      parts.length > (lite ? 300 : 1200) && parts.splice(0, parts.length - (lite ? 300 : 1200));
    }

    // the water itself: a wavy ribbon laid along the frame behind the head, with a bright foam line on the outer edge
    function ribbon(hd, s, t, al) {
      var step = lite ? 12 : 6, a = 4.2 * K, pts = [];
      for (var q = 0; q <= s; q += step) { var p = pt(q, hd.d), o = a * (Math.sin(q * .08 / K - t * 5) + .4 * Math.sin(q * .21 / K + t * 7)) * Math.min(1, (s - q) / 40 + .35) + 3 * K;
        pts.push([p.x + p.nx * o, p.y + p.ny * o]); }
      var e = pt(s, hd.d); pts.push([e.x + e.nx * 2 * K, e.y + e.ny * 2 * K]);
      function line(col, w, blur) { ctx.beginPath(); pts.forEach(function (v, n) { n ? ctx.lineTo(v[0], v[1]) : ctx.moveTo(v[0], v[1]); });
        ctx.strokeStyle = col; ctx.lineWidth = w; ctx.shadowBlur = blur; ctx.shadowColor = 'rgba(70,190,255,.95)'; ctx.stroke(); }
      ctx.save(); ctx.globalAlpha = al; ctx.lineJoin = ctx.lineCap = 'round';
      line('rgba(8,60,165,.6)', 12 * K, lite ? 0 : 20 * K);      // deep water
      line('rgba(35,140,232,.78)', 8 * K, 0);                       // body
      line('rgba(130,218,255,.75)', 3.6 * K, 0);                    // light through the water
      ctx.setLineDash([9 * K, 16 * K]); ctx.lineDashOffset = -t * 60 * K;
      line('rgba(250,254,255,.95)', 1.8 * K, 0);                    // foam
      ctx.setLineDash([3 * K, 22 * K]); ctx.lineDashOffset = t * 40 * K;
      line('rgba(255,255,255,.85)', 2.6 * K, 0);                    // glints
      ctx.restore();
      // the crest: a bright head with a soft ripple ring running ahead of it
      ctx.save(); ctx.globalAlpha = al; var hz = 30 * K * big; ctx.drawImage(SP.mist, e.x - hz, e.y - hz, hz * 2, hz * 2); ctx.drawImage(SP.drop, e.x - hz * .55, e.y - hz * .55, hz * 1.1, hz * 1.1);
      var rr = ((t * 2.4) % 1); ctx.globalAlpha = al * (1 - rr) * .6; ctx.strokeStyle = 'rgba(200,240,255,.9)'; ctx.lineWidth = 1.5 * K;
      ctx.beginPath(); ctx.arc(e.x, e.y, (6 + rr * 20) * K, 0, 6.283); ctx.stroke(); ctx.restore();
    }

    function frame(now) {
      if (my !== token) return;
      try {
        var dt = Math.min(.033, (now - last) / 1000); last = now; var t = (now - t0) / 1000;
        layout(); ctx.setTransform(dpr, 0, 0, dpr, M * dpr, M * dpr); ctx.clearRect(-M, -M, S, S);
        if (reduce) {   // calm alternative: the frame fills with a soft blue sheen and drains, nothing moves
          var tt = t / 1.8, al = tt < .25 ? tt / .25 : Math.max(0, 1 - (tt - .25) / .75);
          if (al > 0) { ctx.save(); ctx.globalAlpha = al; ctx.strokeStyle = 'rgba(60,170,245,.65)'; ctx.lineWidth = 6 * K; ctx.shadowColor = 'rgba(70,190,255,.9)'; ctx.shadowBlur = 16 * K; ctx.strokeRect(0, 0, W, W);
            ctx.shadowBlur = 0; ctx.strokeStyle = 'rgba(240,253,255,.9)'; ctx.lineWidth = 1.6 * K; ctx.strokeRect(0, 0, W, W); ctx.restore(); }
          if (t < 1.9) raf = requestAnimationFrame(frame); else stop(); return; }

        var mm = t < FADE_AT ? 1 : Math.max(0, 1 - (t - FADE_AT) / FADE_LEN), master = mm * mm * (3 - 2 * mm);
        var u = Math.min(1, t / LAP), e = ease(u), ep = ease(Math.max(0, Math.min(1, (t - dt) / LAP)));
        heads.forEach(function (hd, i) { var len = P * hd.f, s = len * e, tp = 1;
          if (u < 1 && tp > 0) emit(hd, i, len * ep, s, tp); if (master > 0) ribbon(hd, Math.max(1, s), t, master); });
        // level 3: the two waves meet and burst
        if (u >= 1 && !burst) { burst = true; crown(lvl === 3 ? pt(P * .5, 1) : pt(0, 1), lvl === 3 ? 120 : 70); }   // arrival: the water lands in the corner and splashes

        parts = parts.filter(function (p) { return p.age < p.life; });
        parts.forEach(function (p) { p.age += dt;
          if (p.k === 0) p.vy += 540 * K * dt;                                   // droplets fall back
          else if (p.k === 1) { p.vx *= 1 - 1.4 * dt; p.vy *= 1 - 1.4 * dt; }   // mist drifts and slows
          else { p.vy -= 10 * K * dt; p.x += Math.sin(p.age * 5 + p.sd) * 14 * K * dt; }   // bubbles float up and wobble
          p.x += p.vx * dt; p.y += p.vy * dt; });

        ctx.globalCompositeOperation = 'source-over';
        parts.forEach(function (p) { var a = p.age / p.life, env = (a < .1 ? a / .1 : 1) * (1 - a);
          if (p.k === 1) { ctx.globalAlpha = master * env * .7; var z = p.sz * (.7 + a * .7); ctx.drawImage(SP.mist, p.x - z / 2, p.y - z / 2, z, z); }
          else if (p.k === 2) { ctx.globalAlpha = master * env * .85; ctx.drawImage(SP.bub, p.x - p.sz / 2, p.y - p.sz / 2, p.sz, p.sz); } });
        ctx.globalCompositeOperation = 'lighter';
        parts.forEach(function (p) { if (p.k !== 0) return; var a = p.age / p.life; ctx.globalAlpha = master * (1 - a) * .95;
          var z = p.sz * (1 - a * .4); ctx.drawImage(SP.drop, p.x - z / 2, p.y - z / 2, z, z);
          if (!lite) for (var tr = 1; tr <= 2; tr++) { ctx.globalAlpha = master * (1 - a) * .38 / tr; var zz = z * (1 - tr * .22);   // motion streak behind each droplet
            ctx.drawImage(SP.drop, p.x - p.vx * .02 * tr - zz / 2, p.y - p.vy * .02 * tr - zz / 2, zz, zz); } });
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
