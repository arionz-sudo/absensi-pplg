'use strict';

/**
 * Server absensi siswa PPLG.
 * Tanpa dependensi: cukup Node.js 18+ (npm install tidak perlu).
 *
 * Jalankan : node server.js
 * Variabel : PORT, GURU_PASSWORD, DATA_FILE, FEED_PUBLIK (lihat README.md)
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const GURU_PASSWORD = process.env.GURU_PASSWORD || 'Masuk123';
const DATA_FILE = process.env.DATA_FILE || path.join(__dirname, 'data', 'absensi.json');
const FEED_PUBLIK = String(process.env.FEED_PUBLIK || 'true').toLowerCase() !== 'false';
const PUBLIC_DIR = path.join(__dirname, 'public');

const WIB_MS = 7 * 60 * 60 * 1000; // WIB = UTC+7, tanpa daylight saving
const TOKEN_TTL_MS = 12 * 60 * 60 * 1000;
const MAX_PER_HARI = 3000;
const STATUS = ['Hadir', 'Izin', 'Sakit'];

/* ------------------------------------------------------------------ */
/* Penyimpanan: satu file JSON { "2026-10-30": [ {...}, {...} ] }      */
/* ------------------------------------------------------------------ */

let db = {};

function loadDb() {
  let raw;
  try {
    raw = fs.readFileSync(DATA_FILE, 'utf8');
  } catch (e) {
    if (e.code !== 'ENOENT') console.error('Gagal membaca data:', e.message);
    return;
  }
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) db = parsed;
  } catch (e) {
    const cadangan = DATA_FILE + '.rusak-' + Date.now();
    fs.copyFileSync(DATA_FILE, cadangan);
    console.error('File data rusak. Disalin ke ' + cadangan + ', memulai dari data kosong.');
  }
}

function saveDb() {
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  const tmp = DATA_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db));
  fs.renameSync(tmp, DATA_FILE); // tulis atomik supaya file tidak setengah jadi
}

/* ------------------------------------------------------------------ */
/* Waktu WIB (selalu dari jam server, bukan jam HP siswa)              */
/* ------------------------------------------------------------------ */

function wib(ms) {
  const iso = new Date(ms + WIB_MS).toISOString(); // 2026-10-30T15:58:03.000Z (sudah digeser +7 jam)
  return { tanggal: iso.slice(0, 10), jam: iso.slice(11, 19) };
}

/* ------------------------------------------------------------------ */
/* Utilitas                                                            */
/* ------------------------------------------------------------------ */

/* Daftar siswa (untuk menampilkan siapa yang BELUM absen), disimpan di file terpisah */
const ROSTER_FILE = process.env.ROSTER_FILE || DATA_FILE.replace(/\.json$/i, '') + '-siswa.json';
const MAX_SISWA = 1500;
let roster = [];

function loadRoster() {
  try {
    const arr = JSON.parse(fs.readFileSync(ROSTER_FILE, 'utf8'));
    if (Array.isArray(arr)) {
      roster = arr.filter((r) => r && typeof r.nama === 'string').map((r) => ({ nama: r.nama, kelas: String(r.kelas || '') }));
    }
  } catch (e) {
    if (e.code !== 'ENOENT') console.error('Gagal membaca daftar siswa:', e.message);
  }
}

function saveRoster() {
  fs.mkdirSync(path.dirname(ROSTER_FILE), { recursive: true });
  const tmp = ROSTER_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(roster));
  fs.renameSync(tmp, ROSTER_FILE);
}

/* Batas waktu absen (disimpan di file, diubah guru dari panel) */
const SETTINGS_FILE = process.env.SETTINGS_FILE || DATA_FILE.replace(/\.json$/i, '') + '-pengaturan.json';
let pengaturan = { mode: 'buka', buka: '06:00', tutup: '08:00' };
const validJam = (s) => /^([01]\d|2[0-3]):[0-5]\d$/.test(String(s));
const detikJam = (s) => {
  const a = String(s).split(':').map(Number);
  return a[0] * 3600 + a[1] * 60 + (a[2] || 0);
};

function loadPengaturan() {
  try {
    const o = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'));
    if (o && ['jadwal', 'buka', 'tutup'].includes(o.mode)) pengaturan.mode = o.mode;
    if (o && validJam(o.buka)) pengaturan.buka = o.buka;
    if (o && validJam(o.tutup)) pengaturan.tutup = o.tutup;
  } catch (e) {
    if (e.code !== 'ENOENT') console.error('Gagal membaca pengaturan:', e.message);
  }
}

function savePengaturan() {
  fs.mkdirSync(path.dirname(SETTINGS_FILE), { recursive: true });
  const tmp = SETTINGS_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(pengaturan));
  fs.renameSync(tmp, SETTINGS_FILE);
}

/* Status absen pada waktu ms (WIB): terbuka atau terkunci, plus hitung mundur */
function statusAbsen(ms) {
  const sekarang = detikJam(wib(ms).jam);
  const { mode, buka, tutup } = pengaturan;
  const dasar = { mode, buka, tutup };
  if (mode === 'buka') return Object.assign(dasar, { terbuka: true, alasan: null, sisaDetik: null });
  if (mode === 'tutup') return Object.assign(dasar, { terbuka: false, alasan: 'manual' });
  const b = detikJam(buka);
  const t = detikJam(tutup);
  if (sekarang < b) return Object.assign(dasar, { terbuka: false, alasan: 'belum-buka', mulaiDalamDetik: b - sekarang });
  if (sekarang >= t) return Object.assign(dasar, { terbuka: false, alasan: 'sudah-tutup' });
  return Object.assign(dasar, { terbuka: true, alasan: null, sisaDetik: t - sekarang });
}

function pesanTutup(st) {
  if (st.alasan === 'belum-buka') return 'Absen belum dibuka. Dibuka pukul ' + st.buka + ' WIB.';
  if (st.alasan === 'sudah-tutup') return 'Waktu absen sudah habis (ditutup pukul ' + st.tutup + ' WIB). Hubungi guru.';
  return 'Absen sedang ditutup oleh guru.';
}

function norm(s) {
  return String(s == null ? '' : s).toLowerCase().replace(/\s+/g, ' ').trim();
}

/* "Budi Santoso, XI PPLG 1" per baris -> [{nama, kelas}] */
function parseDaftar(teks) {
  const seen = new Set();
  const hasil = [];
  for (const baris of String(teks || '').split(/\r?\n/)) {
    const [n, ...sisa] = baris.split(/[,;\t]/);
    const nama = clean(n, 60);
    const kelas = clean(sisa.join(' '), 20);
    if (nama.length < 2 || !/\p{L}/u.test(nama)) continue;
    const k = norm(nama) + '|' + norm(kelas);
    if (seen.has(k)) continue;
    seen.add(k);
    hasil.push({ nama, kelas });
  }
  return hasil;
}

function belumAbsen(list) {
  const sudah = new Set(list.map((r) => norm(r.nama)));
  return roster.filter((s) => !sudah.has(norm(s.nama)));
}

function clean(v, max) {
  return String(v == null ? '' : v)
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function clientIp(req) {
  const xff = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return xff || req.socket.remoteAddress || 'unknown';
}

const hits = new Map();
function limited(key, max, windowMs) {
  const now = Date.now();
  const arr = (hits.get(key) || []).filter((t) => now - t < windowMs);
  if (arr.length >= max) {
    hits.set(key, arr);
    return true;
  }
  arr.push(now);
  hits.set(key, arr);
  return false;
}
setInterval(() => {
  const now = Date.now();
  for (const [k, arr] of hits) {
    const sisa = arr.filter((t) => now - t < 60 * 60 * 1000);
    if (sisa.length) hits.set(k, sisa);
    else hits.delete(k);
  }
}, 10 * 60 * 1000).unref();

function setSecurityHeaders(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
      "font-src https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; " +
      "frame-ancestors 'none'; base-uri 'none'; form-action 'self'"
  );
}

function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

function sendText(res, status, text) {
  res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end(text);
}

function readJson(req, limit = 10 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    let tooBig = false;
    const chunks = [];
    req.on('data', (c) => {
      if (tooBig) return;
      size += c.length;
      if (size > limit) {
        tooBig = true;
        reject(Object.assign(new Error('Data yang dikirim terlalu besar.'), { status: 413 }));
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      if (tooBig) return;
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'));
      } catch (e) {
        reject(Object.assign(new Error('Format data tidak valid.'), { status: 400 }));
      }
    });
    req.on('error', reject);
  });
}

function hitung(list) {
  const r = { total: list.length, Hadir: 0, Izin: 0, Sakit: 0 };
  for (const x of list) if (STATUS.includes(x.status)) r[x.status]++;
  return r;
}

function publicRow(r) {
  return { nama: r.nama, status: r.status, tempat: r.tempat, ts: r.ts, jam: r.jam };
}

function tanggalDariQuery(url, hariIni) {
  const t = url.searchParams.get('tanggal');
  if (!t) return hariIni;
  return /^\d{4}-\d{2}-\d{2}$/.test(t) ? t : null;
}

function tanggalTersedia() {
  return Object.keys(db)
    .filter((k) => Array.isArray(db[k]) && db[k].length)
    .sort()
    .reverse()
    .slice(0, 90);
}

/* ------------------------------------------------------------------ */
/* Autentikasi guru (token di memori, berlaku 12 jam)                  */
/* ------------------------------------------------------------------ */

const tokens = new Map();

function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function authed(req) {
  const h = req.headers.authorization || '';
  const t = h.startsWith('Bearer ') ? h.slice(7) : '';
  const exp = tokens.get(t);
  if (!exp) return false;
  if (exp < Date.now()) {
    tokens.delete(t);
    return false;
  }
  return true;
}

/* ------------------------------------------------------------------ */
/* Handler API                                                         */
/* ------------------------------------------------------------------ */

async function handleAbsen(req, res) {
  if (limited('absen:' + clientIp(req), 120, 60 * 1000)) {
    return sendJson(res, 429, { error: 'Terlalu banyak permintaan. Coba lagi sebentar.' });
  }
  const body = await readJson(req);
  const stAbsen = statusAbsen(Date.now());
  if (!stAbsen.terbuka) {
    return sendJson(res, 403, { error: pesanTutup(stAbsen), absen: stAbsen });
  }
  const nama = clean(body.nama, 60);
  const kelas = clean(body.kelas, 20);
  const tempat = clean(body.tempat, 40);
  const status = STATUS.includes(body.status) ? body.status : null;

  if (nama.length < 2 || !/\p{L}/u.test(nama)) {
    return sendJson(res, 400, { error: 'Isi nama lengkap dengan benar (minimal 2 huruf).' });
  }
  if (!status) return sendJson(res, 400, { error: 'Ceklis dulu status kehadiranmu.' });
  if (!tempat) return sendJson(res, 400, { error: 'Pilih atau isi tempat absen.' });

  const now = Date.now();
  const { tanggal, jam } = wib(now);
  const list = db[tanggal] || (db[tanggal] = []);

  const kunci = nama.toLowerCase() + '|' + kelas.toLowerCase();
  const dobel = list.find((r) => r.nama.toLowerCase() + '|' + r.kelas.toLowerCase() === kunci);
  if (dobel) {
    return sendJson(res, 409, {
      error: dobel.nama + ' sudah absen hari ini pukul ' + dobel.jam.slice(0, 5) + ' WIB.',
      tanggal,
      data: publicRow(dobel),
    });
  }
  if (list.length >= MAX_PER_HARI) {
    return sendJson(res, 503, { error: 'Absensi hari ini penuh. Hubungi guru.' });
  }

  const row = { id: crypto.randomBytes(6).toString('hex'), nama, kelas, status, tempat, ts: now, jam };
  list.push(row);
  saveDb();
  sendJson(res, 201, { tanggal, data: publicRow(row) });
}

async function handleLogin(req, res) {
  const ip = clientIp(req);
  if (limited('login:' + ip, 8, 10 * 60 * 1000) || limited('login:semua', 40, 10 * 60 * 1000)) {
    return sendJson(res, 429, { error: 'Terlalu banyak percobaan. Tunggu beberapa menit.' });
  }
  const body = await readJson(req);
  if (!safeEqual(body.password || '', GURU_PASSWORD)) {
    return sendJson(res, 401, { error: 'Password salah.' });
  }
  const token = crypto.randomBytes(24).toString('hex');
  tokens.set(token, Date.now() + TOKEN_TTL_MS);
  sendJson(res, 200, { token });
}

function csvCell(v) {
  let s = String(v == null ? '' : v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; // cegah formula injection di Excel/Sheets
  return /[";\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

async function handleApi(req, res, url) {
  const p = url.pathname;
  const m = req.method;

  if (p === '/api/waktu' && m === 'GET') {
    const now = Date.now();
    return sendJson(res, 200, Object.assign({ now }, wib(now)));
  }

  if (p === '/api/hari-ini' && m === 'GET') {
    const now = Date.now();
    const { tanggal } = wib(now);
    const list = db[tanggal] || [];
    return sendJson(res, 200, {
      now,
      tanggal,
      ringkasan: hitung(list),
      absen: statusAbsen(now),
      feedPublik: FEED_PUBLIK,
      feed: FEED_PUBLIK ? list.slice(-10).reverse().map(publicRow) : [],
    });
  }

  if (p === '/api/siswa' && m === 'GET') {
    return sendJson(res, 200, { daftar: FEED_PUBLIK ? roster : [] });
  }

  if (p === '/api/absen' && m === 'POST') return handleAbsen(req, res);
  if (p === '/api/guru/login' && m === 'POST') return handleLogin(req, res);

  if (p.startsWith('/api/guru/')) {
    if (!authed(req)) return sendJson(res, 401, { error: 'Belum masuk atau sesi sudah habis.' });

    const now = Date.now();
    const hariIni = wib(now).tanggal;

    if (p === '/api/guru/absensi' && m === 'GET') {
      const tanggal = tanggalDariQuery(url, hariIni);
      if (!tanggal) return sendJson(res, 400, { error: 'Format tanggal harus YYYY-MM-DD.' });
      const data = (db[tanggal] || []).slice().sort((a, b) => a.ts - b.ts);
      return sendJson(res, 200, {
        now,
        hariIni,
        tanggal,
        ringkasan: hitung(data),
        data,
        jumlahSiswa: roster.length,
        belumAbsen: belumAbsen(data),
        tanggalTersedia: tanggalTersedia(),
      });
    }

    if (p === '/api/guru/export' && m === 'GET') {
      const tanggal = tanggalDariQuery(url, hariIni);
      if (!tanggal) return sendJson(res, 400, { error: 'Format tanggal harus YYYY-MM-DD.' });
      const data = (db[tanggal] || []).slice().sort((a, b) => a.ts - b.ts);
      const baris = [['No', 'Tanggal', 'Nama', 'Kelas', 'Status', 'Tempat', 'Jam (WIB)']];
      data.forEach((r, i) => baris.push([i + 1, tanggal, r.nama, r.kelas, r.status, r.tempat, r.jam]));
      const csv = '﻿' + baris.map((b) => b.map(csvCell).join(';')).join('\r\n') + '\r\n';
      res.writeHead(200, {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="absensi-' + tanggal + '.csv"',
        'Cache-Control': 'no-store',
      });
      return res.end(csv);
    }

    if (p === '/api/guru/pengaturan' && m === 'GET') {
      return sendJson(res, 200, { pengaturan, status: statusAbsen(now) });
    }

    if (p === '/api/guru/pengaturan' && m === 'PUT') {
      const body = await readJson(req);
      const mode = ['jadwal', 'buka', 'tutup'].includes(body.mode) ? body.mode : null;
      if (!mode) return sendJson(res, 400, { error: 'Mode tidak dikenal.' });
      const buka = String(body.buka || pengaturan.buka);
      const tutup = String(body.tutup || pengaturan.tutup);
      if (!validJam(buka) || !validJam(tutup)) return sendJson(res, 400, { error: 'Format jam harus HH:MM, misalnya 07:00.' });
      if (mode === 'jadwal' && detikJam(tutup) <= detikJam(buka)) {
        return sendJson(res, 400, { error: 'Jam tutup harus setelah jam buka.' });
      }
      pengaturan = { mode, buka, tutup };
      savePengaturan();
      return sendJson(res, 200, { pengaturan, status: statusAbsen(Date.now()) });
    }

    if (p === '/api/guru/siswa' && m === 'GET') return sendJson(res, 200, { daftar: roster });

    if (p === '/api/guru/siswa' && m === 'PUT') {
      const body = await readJson(req, 200 * 1024);
      const daftar = parseDaftar(body.teks);
      if (daftar.length > MAX_SISWA) {
        return sendJson(res, 400, { error: 'Maksimal ' + MAX_SISWA + ' siswa.' });
      }
      roster = daftar;
      saveRoster();
      return sendJson(res, 200, { daftar: roster });
    }

    const hapus = p.match(/^\/api\/guru\/absensi\/([0-9a-f]{12})$/);
    if (hapus && m === 'DELETE') {
      const tanggal = tanggalDariQuery(url, hariIni);
      if (!tanggal) return sendJson(res, 400, { error: 'Format tanggal harus YYYY-MM-DD.' });
      const list = db[tanggal] || [];
      const idx = list.findIndex((r) => r.id === hapus[1]);
      if (idx === -1) return sendJson(res, 404, { error: 'Data absen tidak ditemukan.' });
      list.splice(idx, 1);
      if (!list.length) delete db[tanggal];
      saveDb();
      return sendJson(res, 200, { ok: true });
    }
  }

  return sendJson(res, 404, { error: 'Endpoint tidak ditemukan.' });
}

/* ------------------------------------------------------------------ */
/* File statis (folder public/)                                        */
/* ------------------------------------------------------------------ */

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

function serveStatic(req, res, pathname) {
  let rel;
  try {
    rel = decodeURIComponent(pathname);
  } catch (e) {
    return sendText(res, 400, 'Permintaan tidak valid');
  }
  if (rel.includes('\0')) return sendText(res, 400, 'Permintaan tidak valid');
  if (rel === '/') rel = '/index.html';
  else if (rel === '/guru') rel = '/guru.html';

  const file = path.join(PUBLIC_DIR, path.normalize(rel));
  if (!file.startsWith(PUBLIC_DIR + path.sep)) return sendText(res, 403, 'Dilarang');

  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) return sendText(res, 404, 'Halaman tidak ditemukan');
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'Content-Length': st.size,
      'Cache-Control': 'no-cache',
    });
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(file).on('error', () => res.destroy()).pipe(res);
  });
}

/* ------------------------------------------------------------------ */
/* Server                                                              */
/* ------------------------------------------------------------------ */

const server = http.createServer(async (req, res) => {
  setSecurityHeaders(res);
  try {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/healthz') return sendJson(res, 200, { ok: true });
    if (url.pathname.startsWith('/api/')) return await handleApi(req, res, url);
    if (req.method !== 'GET' && req.method !== 'HEAD') return sendText(res, 405, 'Metode tidak diizinkan');
    return serveStatic(req, res, url.pathname);
  } catch (err) {
    const status = err.status || 500;
    if (status === 500) console.error(err);
    if (!res.headersSent) {
      sendJson(res, status, { error: status === 500 ? 'Terjadi kesalahan di server.' : err.message });
    } else {
      res.end();
    }
  }
});

loadDb();
loadRoster();
loadPengaturan();
server.listen(PORT, HOST, () => {
  console.log('Absensi PPLG berjalan di http://localhost:' + PORT);
  console.log('Panel guru : http://localhost:' + PORT + '/guru');
  console.log('Data disimpan di: ' + DATA_FILE);
  if (!process.env.GURU_PASSWORD) {
    console.warn('PERINGATAN: memakai password guru bawaan "Masuk123". Ganti lewat variabel GURU_PASSWORD sebelum dipakai online!');
  }
});

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 3000).unref();
  });
}
