/* Fire border: when a human move scores 25 or more, red fire runs around the outside of the board frame.
   Self-contained overlay (fixed canvas, no pointer events). It only wraps window.showScorePopup, which the game
   already calls for every scored move (offline and online). Any failure is swallowed: the game is never affected. */
(function () {
  'use strict';
  if (window.__fireBorder) return;
  window.__fireBorder = true;

  var THRESHOLD = 25;
  var sprites = null, cv = null, raf = 0, token = 0;

  function mk(stops) {
    var c = document.createElement('canvas'); c.width = c.height = 64;
    var g = c.getContext('2d'), r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    stops.forEach(function (s) { r.addColorStop(s[0], s[1]); });
    g.fillStyle = r; g.fillRect(0, 0, 64, 64);
    return c;
  }
  function getSprites() {
    if (sprites) return sprites;
    sprites = [
      mk([[0, 'rgba(255,248,215,1)'], [.22, 'rgba(255,205,90,.92)'], [.55, 'rgba(255,115,25,.5)'], [1, 'rgba(210,25,10,0)']]),
      mk([[0, 'rgba(255,175,60,.9)'], [.4, 'rgba(240,70,15,.62)'], [1, 'rgba(165,10,10,0)']]),
      mk([[0, 'rgba(225,55,20,.7)'], [.45, 'rgba(150,12,12,.42)'], [1, 'rgba(70,0,0,0)']])
    ];
    return sprites;
  }

  function stop() {
    token++;
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    if (cv && cv.parentNode) cv.parentNode.removeChild(cv);
    cv = null;
  }

  function play(points) {
    stop();
    var my = token;
    var board = document.getElementById('game-board');
    if (!board || !document.body) return;
    var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
    var rect = board.getBoundingClientRect();
    if (!rect.width) return;

    var SP = getSprites();
    var lvl = points >= 60 ? 3 : points >= 40 ? 2 : 1;
    var dpr = Math.min(2, window.devicePixelRatio || 1);
    var M = 46;                       // room around the board for the flames
    var INFL = 4;                     // the fire runs just outside the frame
    var W = 0, S = 0, P = 0, K = 1;

    cv = document.createElement('canvas');
    cv.setAttribute('aria-hidden', 'true');
    cv.style.cssText = 'position:fixed;z-index:99980;pointer-events:none;margin:0;padding:0;';
    document.body.appendChild(cv);
    var ctx = cv.getContext('2d');
    if (!ctx) { stop(); return; }

    function layout() {
      var r = board.getBoundingClientRect();
      var w = Math.round(r.width + INFL * 2);
      if (w !== W) {
        W = w; S = W + 2 * M; P = 4 * W; K = Math.max(.75, W / 750);
        cv.style.width = S + 'px'; cv.style.height = S + 'px';
        cv.width = cv.height = Math.round(S * dpr);
      }
      cv.style.left = Math.round(r.left - INFL - M) + 'px';
      cv.style.top = Math.round(r.top - INFL - M) + 'px';
    }
    layout();

    var heads = lvl === 3 ? [{ d: 1, f: .5 }, { d: -1, f: .5 }] : [{ d: 1, f: 1 }];
    var LAP = lvl === 3 ? 1.5 : lvl === 2 ? 2.1 : 2.2;
    var rate = [150, 200, 170][lvl - 1], big = [1, 1.2, 1.35][lvl - 1], sparkRate = [22, 38, 34][lvl - 1];
    var FADE_AT = LAP * .88, FADE_LEN = .85;   // everything dissolves together, then the canvas is removed
    var parts = [], acc = [0, 0], sacc = [0, 0];
    var last = performance.now(), t0 = last;

    function pt(s, d) {
      var sd = d > 0 ? s : P - s;
      sd = ((sd % P) + P) % P;
      var n = Math.floor(sd / W), t = sd - n * W;
      n = n % 4;
      return n === 0 ? { x: W - t, y: 0, nx: 0, ny: -1 }
        : n === 1 ? { x: 0, y: t, nx: -1, ny: 0 }
        : n === 2 ? { x: t, y: W, nx: 0, ny: 1 }
        : { x: W, y: W - t, nx: 1, ny: 0 };
    }
    // gentle start, almost no slow-down at the end (a long crawl made the embers pile up where the flames meet)
    function ease(u) { return .75 * u + .25 * (.5 - .5 * Math.cos(Math.PI * u)); }

    // emission follows the distance travelled (not the clock) and fades out over the last stretch of the lap,
    // so the flames thin out smoothly instead of clumping at the point where they finish
    function emit(h, i, s0, s1, tp) {
      var ds = (s1 - s0) / (P * h.f);   // fraction of this head's path covered this frame
      acc[i] += rate * LAP * ds * tp; sacc[i] += sparkRate * LAP * ds * tp;
      var guard = 0;
      while (acc[i] >= 1 && guard++ < 40) {
        acc[i]--;
        var s = s0 + (s1 - s0) * Math.random(), p = pt(s, h.d), q = pt(s + 1, h.d);
        var tx = q.x - p.x, ty = q.y - p.y, L = Math.hypot(tx, ty) || 1; tx /= L; ty /= L;
        var o = 2 + Math.random() * 3, spd = (35 + Math.random() * 75) * K;
        parts.push({ k: 0, x: p.x + p.nx * o, y: p.y + p.ny * o, vx: p.nx * spd - tx * spd * .7, vy: p.ny * spd - ty * spd * .7 - 28 * K,
          tx: -ty, ty: tx, life: .5 + Math.random() * .5, age: 0, sz: (16 + Math.random() * 16) * K * big, sd: Math.random() * 6.28 });
        if (Math.random() < .6) parts.push({ k: 1, x: p.x + p.nx * 1.5, y: p.y + p.ny * 1.5, vx: 0, vy: 0, tx: 0, ty: 0,
          life: .9 + Math.random() * .5, age: .15, sz: (9 + Math.random() * 6) * K * big, sd: 0 });
      }
      guard = 0;
      while (sacc[i] >= 1 && guard++ < 20) {
        sacc[i]--;
        var s2 = s0 + (s1 - s0) * Math.random(), p2 = pt(s2, h.d), v = (110 + Math.random() * 170) * K, a = (Math.random() - .5) * 1.1;
        parts.push({ k: 2, x: p2.x + p2.nx * 3, y: p2.y + p2.ny * 3,
          vx: (p2.nx * Math.cos(a) - p2.ny * Math.sin(a)) * v, vy: (p2.ny * Math.cos(a) + p2.nx * Math.sin(a)) * v - 40 * K,
          tx: 0, ty: 0, life: .7 + Math.random() * .7, age: 0, sz: (5 + Math.random() * 4) * K, sd: 0 });
      }
      if (parts.length > 900) parts.splice(0, parts.length - 900);
    }

    function heat(h, s, al) {
      ctx.save();
      ctx.globalAlpha = al; ctx.lineJoin = 'round';
      ctx.beginPath(); ctx.moveTo(W, 0);
      if (h.d > 0) { ctx.lineTo(0, 0); ctx.lineTo(0, W); ctx.lineTo(W, W); }
      else { ctx.lineTo(W, W); ctx.lineTo(0, W); ctx.lineTo(0, 0); }
      ctx.lineTo(W, 0);
      ctx.setLineDash([Math.max(.01, s), P * 4]);
      ctx.shadowColor = 'rgba(255,60,15,.9)'; ctx.shadowBlur = 18 * K;
      ctx.strokeStyle = 'rgba(215,35,12,.55)'; ctx.lineWidth = 5 * K; ctx.stroke();
      ctx.shadowBlur = 6 * K; ctx.strokeStyle = 'rgba(255,185,105,.9)'; ctx.lineWidth = 1.6 * K; ctx.stroke();
      ctx.restore();
    }

    function frame(now) {
      if (my !== token) return;
      try {
        var dt = Math.min(.033, (now - last) / 1000); last = now;
        var t = (now - t0) / 1000;
        layout();
        ctx.setTransform(dpr, 0, 0, dpr, M * dpr, M * dpr);
        ctx.clearRect(-M, -M, S, S);

        if (reduce) {
          // calm alternative: the frame warms up and cools down, nothing moves
          var tt = t / 1.8, al = tt < .25 ? tt / .25 : Math.max(0, 1 - (tt - .25) / .75);
          if (al > 0) {
            ctx.save(); ctx.globalAlpha = al; ctx.lineJoin = 'round';
            ctx.beginPath(); ctx.rect(0, 0, W, W);
            ctx.shadowColor = 'rgba(255,60,15,.9)'; ctx.shadowBlur = 20 * K;
            ctx.strokeStyle = 'rgba(215,35,12,.6)'; ctx.lineWidth = 5 * K; ctx.stroke();
            ctx.shadowBlur = 6 * K; ctx.strokeStyle = 'rgba(255,185,105,.9)'; ctx.lineWidth = 1.6 * K; ctx.stroke();
            ctx.restore();
          }
          if (t < 1.9) raf = requestAnimationFrame(frame); else stop();
          return;
        }

        var mm = t < FADE_AT ? 1 : Math.max(0, 1 - (t - FADE_AT) / FADE_LEN), master = mm * mm * (3 - 2 * mm);   // smooth master fade
        var u = Math.min(1, t / LAP), e = ease(u), ep = ease(Math.max(0, Math.min(1, (t - dt) / LAP)));
        heads.forEach(function (h, i) {
          var len = P * h.f, s = len * e;
          var tp = u < .75 ? 1 : Math.pow(Math.max(0, 1 - (u - .75) / .25), 1.5);
          if (u < 1 && tp > 0) emit(h, i, len * ep, s, tp);
          if (master > 0) heat(h, s, master);
        });

        parts = parts.filter(function (p) { return p.age < p.life; });
        parts.forEach(function (p) {
          p.age += dt;
          if (p.k === 2) p.vy += 260 * K * dt;
          else if (p.k === 0) {
            p.vx *= 1 - 1.6 * dt; p.vy *= 1 - 1.2 * dt;
            var w = Math.sin(p.age * 13 + p.sd) * 22 * K * dt;
            p.x += w * p.tx; p.y += w * p.ty;
          }
          p.x += p.vx * dt; p.y += p.vy * dt;
        });

        ctx.globalCompositeOperation = 'source-over';
        parts.forEach(function (p) {
          if (p.k === 2) return;
          var a = p.age / p.life;
          var env = (a < .12 ? a / .12 : 1) * Math.pow(1 - a, 1.2) * (p.k === 1 ? .5 : .9);
          var f = Math.min(a * 2, 1.999), i = Math.floor(f), w = f - i;
          var sz = p.sz * (p.k === 1 ? 1 : (.7 + .5 * Math.sin(Math.PI * Math.min(1, a * 1.4))) * (1 - a * .35));
          ctx.globalAlpha = master * env * (1 - w); ctx.drawImage(SP[i], p.x - sz / 2, p.y - sz / 2, sz, sz);
          ctx.globalAlpha = master * env * w; ctx.drawImage(SP[Math.min(2, i + 1)], p.x - sz / 2, p.y - sz / 2, sz, sz);
        });
        ctx.globalCompositeOperation = 'lighter';
        parts.forEach(function (p) {
          var a = p.age / p.life;
          if (p.k === 0 && a < .4) { var sz = p.sz * .5; ctx.globalAlpha = master * (1 - a / .4) * .55; ctx.drawImage(SP[0], p.x - sz / 2, p.y - sz / 2, sz, sz); }
          if (p.k === 2) { var s2 = p.sz * (1 - a * .6); ctx.globalAlpha = master * (1 - a) * .95; ctx.drawImage(SP[0], p.x - s2 / 2, p.y - s2 / 2, s2, s2); }
        });
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
