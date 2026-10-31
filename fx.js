/* Efek visual: loader, latar bergerak (aurora + partikel), efek tekan cair, sorot kartu.
   Semua animasi memakai transform/opacity dan canvas beresolusi rendah supaya tetap 60 fps.
   Kalau perangkat terasa berat, kualitas turun sendiri. */
(function () {
  'use strict';

  var root = document.documentElement;
  var reduce = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  var lowEnd = !!((navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 2) || (navigator.deviceMemory && navigator.deviceMemory <= 2));
  if (lowEnd) root.classList.add('lite');

  window.__fx = { level: 0, fps: 0 };

  /* ---------------------------------------------------------------- */
  /* Latar bergerak                                                   */
  /* ---------------------------------------------------------------- */
  var ca = document.getElementById('fxAurora');
  var cd = document.getElementById('fxDots');

  if (ca && cd && ca.getContext) {
    var xa = ca.getContext('2d');
    var xd = cd.getContext('2d');
    var scale = lowEnd ? 0.24 : 0.4;
    var W = 2, H = 2, DW = 2, DH = 2, dpr = 1;
    var dotsOn = true;
    var level = 0;

    // warna biru dan abu khas PPLG: [rgb], opasitas, posisi, jangkauan gerak, kecepatan, fase, jari-jari
    var blobs = [
      { c: '47,123,255', a: 0.55, x: 0.18, y: 0.16, ax: 0.22, ay: 0.16, fx: 0.11, fy: 0.08, p: 0.0, r: 0.62 },
      { c: '34,211,238', a: 0.30, x: 0.86, y: 0.28, ax: 0.18, ay: 0.22, fx: 0.07, fy: 0.12, p: 1.7, r: 0.50 },
      { c: '100,116,139', a: 0.50, x: 0.50, y: 0.92, ax: 0.30, ay: 0.12, fx: 0.06, fy: 0.09, p: 3.1, r: 0.66 },
      { c: '99,102,241', a: 0.32, x: 0.72, y: 0.74, ax: 0.20, ay: 0.18, fx: 0.09, fy: 0.07, p: 4.4, r: 0.48 },
      { c: '56,189,248', a: 0.24, x: 0.30, y: 0.55, ax: 0.24, ay: 0.20, fx: 0.05, fy: 0.10, p: 5.6, r: 0.44 }
    ];

    var dots = [];
    function buatTitik(n) {
      dots = [];
      for (var i = 0; i < n; i++) {
        dots.push({ x: Math.random(), y: Math.random(), r: 0.6 + Math.random() * 1.6, s: 0.01 + Math.random() * 0.03, ph: Math.random() * 6.283, tw: 0.6 + Math.random() * 1.6 });
      }
    }
    buatTitik(lowEnd ? 28 : 64);

    var mx = 0, my = 0, tx = 0, ty = 0;

    var ukuran = function () {
      var w = window.innerWidth, h = window.innerHeight;
      dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      W = Math.max(2, Math.round(w * scale));
      H = Math.max(2, Math.round(h * scale));
      ca.width = W; ca.height = H;
      DW = Math.max(2, Math.round(w * dpr));
      DH = Math.max(2, Math.round(h * dpr));
      cd.width = DW; cd.height = DH;
    };

    var gambarAurora = function (t) {
      xa.clearRect(0, 0, W, H);
      xa.globalCompositeOperation = 'lighter';
      var m = Math.max(W, H);
      for (var i = 0; i < blobs.length; i++) {
        var b = blobs[i];
        var cx = (b.x + b.ax * Math.sin(t * b.fx + b.p) + mx * 0.05) * W;
        var cy = (b.y + b.ay * Math.cos(t * b.fy + b.p * 1.3) + my * 0.05) * H;
        var r = b.r * m * (1 + 0.08 * Math.sin(t * b.fx * 2 + b.p));
        var g = xa.createRadialGradient(cx, cy, 0, cx, cy, r);
        g.addColorStop(0, 'rgba(' + b.c + ',' + b.a + ')');
        g.addColorStop(1, 'rgba(' + b.c + ',0)');
        xa.fillStyle = g;
        xa.fillRect(0, 0, W, H);
      }
    };

    var gambarTitik = function (t, dt) {
      xd.clearRect(0, 0, DW, DH);
      xd.fillStyle = '#c3dcff';
      for (var i = 0; i < dots.length; i++) {
        var d = dots[i];
        d.y -= d.s * dt;
        if (d.y < -0.02) { d.y = 1.02; d.x = Math.random(); }
        xd.globalAlpha = 0.16 + 0.34 * (0.5 + 0.5 * Math.sin(t * d.tw + d.ph));
        xd.beginPath();
        xd.arc(d.x * DW + Math.sin(t * 0.3 + d.ph) * 12 * dpr, d.y * DH, d.r * dpr, 0, 6.283);
        xd.fill();
      }
      xd.globalAlpha = 1;
    };

    /* kualitas adaptif: kalau rata-rata frame lambat, turunkan beban */
    var frames = 0, total = 0, warm = 0;
    var pantau = function (ms) {
      if (warm < 40) { warm++; return; }
      frames++; total += ms;
      if (frames < 90) return;
      var avg = total / frames;
      window.__fx.fps = Math.round(1000 / avg);
      frames = 0; total = 0;
      if (avg > 22 && level < 2) {
        level++;
        window.__fx.level = level;
        if (level === 1) {
          scale = Math.max(0.16, scale * 0.6);
          buatTitik(Math.round(dots.length / 2));
          ukuran();
        } else {
          root.classList.add('lite');
          dotsOn = false;
          xd.clearRect(0, 0, DW, DH);
        }
        warm = 20;
      }
    };

    var last = 0;
    var raf = 0;
    var loop = function (now) {
      raf = requestAnimationFrame(loop);
      var dt = last ? Math.min(0.1, (now - last) / 1000) : 0.016;
      last = now;
      mx += (tx - mx) * 0.04;
      my += (ty - my) * 0.04;
      gambarAurora(now / 1000);
      if (dotsOn) gambarTitik(now / 1000, dt);
      pantau(dt * 1000);
    };

    ukuran();
    if (reduce) {
      gambarAurora(2);
      gambarTitik(2, 0);
    } else {
      raf = requestAnimationFrame(loop);
    }

    var tunda = 0;
    window.addEventListener('resize', function () {
      clearTimeout(tunda);
      tunda = setTimeout(function () { ukuran(); if (reduce) { gambarAurora(2); gambarTitik(2, 0); } }, 150);
    });
    window.addEventListener('pointermove', function (e) {
      tx = e.clientX / window.innerWidth - 0.5;
      ty = e.clientY / window.innerHeight - 0.5;
    }, { passive: true });
  }

  /* ---------------------------------------------------------------- */
  /* Efek tekan cair + sorot kartu                                    */
  /* ---------------------------------------------------------------- */
  var TARGET = '.btn, .opt, .tab, .pill-link, .nav button';

  document.addEventListener('pointerdown', function (e) {
    if (reduce || !e.target.closest) return;
    var el = e.target.closest(TARGET);
    if (!el || el.disabled) return;
    var host = (el.classList.contains('opt') && el.querySelector('.box')) || el;
    var r = host.getBoundingClientRect();
    var d = Math.hypot(r.width, r.height) * 1.3;
    var s = document.createElement('span');
    s.className = 'liquid';
    s.style.width = s.style.height = d + 'px';
    s.style.left = (e.clientX - r.left - d / 2) + 'px';
    s.style.top = (e.clientY - r.top - d / 2) + 'px';
    host.classList.add('has-liquid');
    host.appendChild(s);
    s.addEventListener('animationend', function () { s.remove(); });
  }, { passive: true });

  var spotPending = false, spotEvent = null;
  document.addEventListener('pointermove', function (e) {
    spotEvent = e;
    if (spotPending) return;
    spotPending = true;
    requestAnimationFrame(function () {
      spotPending = false;
      var ev = spotEvent;
      if (!ev || !ev.target || !ev.target.closest) return;
      var c = ev.target.closest('.card');
      if (!c) return;
      var r = c.getBoundingClientRect();
      c.style.setProperty('--mx', (ev.clientX - r.left) + 'px');
      c.style.setProperty('--my', (ev.clientY - r.top) + 'px');
    });
  }, { passive: true });

  /* angka statistik "memantul" saat berubah */
  function awasiAngka() {
    if (!window.MutationObserver) return;
    var mo = new MutationObserver(function (list) {
      list.forEach(function (m) {
        var el = m.target.nodeType === 1 ? m.target : m.target.parentElement;
        if (!el || !el.classList) return;
        el.classList.remove('bump');
        void el.offsetWidth;
        el.classList.add('bump');
      });
    });
    document.querySelectorAll('.stat b').forEach(function (b) {
      mo.observe(b, { childList: true, characterData: true, subtree: true });
    });
  }
  awasiAngka();

  /* ---------------------------------------------------------------- */
  /* Loader saat halaman dibuka                                       */
  /* ---------------------------------------------------------------- */
  var loader = document.getElementById('loader');
  var txt = document.getElementById('ldTxt');
  var t0 = performance.now();

  function urutkanMasuk() {
    var i = 0;
    document.querySelectorAll('.top, .card, .stats').forEach(function (el) {
      if (el.offsetParent !== null) { el.style.setProperty('--i', String(i)); i++; }
    });
  }

  function tutupLoader() {
    if (!loader || loader.dataset.out) return;
    loader.dataset.out = '1';
    loader.classList.add('done');
    setTimeout(function () {
      urutkanMasuk();
      loader.classList.add('out');
      document.body.classList.add('ready');
      setTimeout(function () { if (loader) loader.remove(); }, 900);
    }, 280);
  }

  if (loader) {
    var dimuat = new Promise(function (ok) {
      if (document.readyState === 'complete') ok(); else window.addEventListener('load', ok);
    });
    var font = (document.fonts && document.fonts.ready)
      ? Promise.race([document.fonts.ready, new Promise(function (ok) { setTimeout(ok, 1800); })])
      : Promise.resolve();
    var ping = fetch('/api/waktu', { cache: 'no-store' }).then(function (r) {
      if (!r.ok) throw new Error('x');
      if (txt) txt.textContent = 'Terhubung ke server';
    }).catch(function () {
      if (txt) txt.textContent = 'Server belum terjangkau';
    });

    Promise.all([dimuat, font, ping]).then(function () {
      var sisa = Math.max(0, (reduce ? 200 : 1100) - (performance.now() - t0));
      setTimeout(tutupLoader, sisa);
    });
    setTimeout(tutupLoader, 5000); // pengaman supaya loader tidak pernah tersangkut
  } else {
    document.body.classList.add('ready');
  }
})();
