/* Fungsi bersama untuk halaman siswa & guru: jam WIB, format tanggal, "x menit yang lalu", API */
(function () {
  'use strict';

  const HARI = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
  const BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
  const WIB_MS = 7 * 3600 * 1000;
  const DAY_MS = 86400000;

  let offset = 0; // selisih jam server dengan jam perangkat

  const pad = (n) => (n < 10 ? '0' + n : String(n));
  const now = () => Date.now() + offset;

  function parts(ms) {
    const d = new Date(ms + WIB_MS);
    return { y: d.getUTCFullYear(), m: d.getUTCMonth(), d: d.getUTCDate(), w: d.getUTCDay(), h: d.getUTCHours(), i: d.getUTCMinutes(), s: d.getUTCSeconds() };
  }

  function key(ms) {
    const p = parts(ms);
    return p.y + '-' + pad(p.m + 1) + '-' + pad(p.d);
  }

  function jam(ms, detik) {
    const p = parts(ms);
    return pad(p.h) + ':' + pad(p.i) + (detik === false ? '' : ':' + pad(p.s));
  }

  function tanggalPanjang(ms) {
    const p = parts(ms);
    return HARI[p.w] + ', ' + p.d + ' ' + BULAN[p.m] + ' ' + p.y;
  }

  function tanggalDariKunci(k) {
    const a = k.split('-').map(Number);
    const d = new Date(Date.UTC(a[0], a[1] - 1, a[2]));
    return HARI[d.getUTCDay()] + ', ' + a[2] + ' ' + BULAN[a[1] - 1] + ' ' + a[0];
  }

  function geserKunci(k, delta) {
    const a = k.split('-').map(Number);
    const d = new Date(Date.UTC(a[0], a[1] - 1, a[2] + delta));
    return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate());
  }

  async function sync() {
    const t0 = Date.now();
    const r = await fetch('/api/waktu', { cache: 'no-store' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const j = await r.json();
    const t1 = Date.now();
    offset = j.now - (t0 + t1) / 2;
  }

  /* Jam digital yang berdetak, tanggal otomatis, hitung mundur ke 00:00 WIB */
  function bindJam(o) {
    let lastKey = null;

    function tick() {
      const n = now();
      const p = parts(n);
      // tulis ulang teks hanya kalau berubah, supaya kartu kaca tidak digambar ulang sia-sia
      const teksJam = pad(p.h) + ':' + pad(p.i) + ':' + pad(p.s);
      if (o.jam && o.jam.textContent !== teksJam) o.jam.textContent = teksJam;

      const k = key(n);
      if (k !== lastKey) {
        const pertama = lastKey === null;
        lastKey = k;
        if (o.tanggal) {
          const teksTgl = tanggalPanjang(n);
          if (o.tanggal.textContent !== teksTgl) o.tanggal.textContent = teksTgl;
        }
        if (!pertama && o.onGantiHari) o.onGantiHari(k);
      }

      if (o.countdown) {
        const sisa = Math.floor((DAY_MS - ((n + WIB_MS) % DAY_MS)) / 1000);
        const teksCd = pad(Math.floor(sisa / 3600)) + ':' + pad(Math.floor((sisa % 3600) / 60)) + ':' + pad(sisa % 60);
        if (o.countdown.textContent !== teksCd) o.countdown.textContent = teksCd;
      }
    }

    function status(ok) {
      if (!o.status) return;
      o.status.textContent = ok ? 'terhubung ke server' : 'server tidak terjangkau';
      const box = o.status.closest('.live');
      if (box) box.classList.toggle('off', !ok);
    }

    async function singkron() {
      try {
        await sync();
        status(true);
      } catch (e) {
        status(false);
      }
      tick();
    }

    tick();
    setInterval(tick, 250);
    singkron();
    setInterval(singkron, 60000);
  }

  /* "Barusan", "45 detik yang lalu", "3 menit 12 detik yang lalu", "1 jam 5 menit 9 detik yang lalu" */
  function lalu(ts) {
    const s = Math.max(0, Math.floor((now() - ts) / 1000));
    const j = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const d = s % 60;
    let teks;
    if (s < 3) teks = 'barusan';
    else if (j > 0) teks = j + ' jam ' + m + ' menit ' + d + ' detik yang lalu';
    else if (m > 0) teks = m + ' menit ' + d + ' detik yang lalu';
    else teks = d + ' detik yang lalu';

    let level = 'lama';
    let label = 'Sudah lama';
    if (s < 300) { level = 'baru'; label = 'Baru saja'; }
    else if (s < 3600) { level = 'belum-lama'; label = 'Belum lama'; }
    return { teks, level, label, detik: s };
  }

  function tickLalu(root) {
    (root || document).querySelectorAll('[data-ts]').forEach((el) => {
      const info = lalu(Number(el.dataset.ts));
      if (el.classList.contains('js-lalu')) el.textContent = info.teks;
      if (el.classList.contains('js-fresh')) {
        el.textContent = info.label;
        el.dataset.level = info.level;
      }
    });
  }
  setInterval(() => tickLalu(document), 1000);

  /* ---------- Helper UI ---------- */
  function h(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  function hue(str) {
    let x = 0;
    for (const c of String(str)) x = (x * 31 + c.codePointAt(0)) >>> 0;
    return 195 + (x % 70); // rentang biru - cyan - indigo
  }

  function inisial(nama) {
    const p = String(nama).trim().split(/\s+/);
    const a = Array.from(p[0] || '?')[0];
    const b = p[1] ? Array.from(p[1])[0] : '';
    return (a + b).toUpperCase();
  }

  function chip(status) {
    return h('span', 'chip ' + String(status).toLowerCase(), status);
  }

  async function api(path, opt) {
    opt = opt || {};
    const headers = Object.assign({}, opt.headers || {});
    let body = opt.body;
    if (body && typeof body === 'object') {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(body);
    }
    const r = await fetch(path, { method: opt.method || 'GET', headers, body, cache: 'no-store' });
    let data = null;
    try { data = await r.json(); } catch (e) { /* bukan JSON */ }
    if (!r.ok) {
      const err = new Error((data && data.error) || 'Terjadi kesalahan (' + r.status + ').');
      err.status = r.status;
      err.data = data;
      throw err;
    }
    return data;
  }

  window.Waktu = { now, parts, key, jam, tanggalPanjang, tanggalDariKunci, geserKunci, bindJam, lalu, tickLalu };
  window.UI = { h, hue, inisial, chip, api };
})();
