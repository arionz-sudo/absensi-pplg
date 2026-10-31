/* Halaman siswa */
(function () {
  'use strict';

  const { h, hue, inisial, chip, api } = window.UI;
  const W = window.Waktu;
  const $ = (id) => document.getElementById(id);
  const LS_KEY = 'absen-pplg-terakhir';
  const LABEL_KIRIM = 'Kirim Absen';

  W.bindJam({
    jam: $('jam'),
    tanggal: $('tanggal'),
    countdown: $('countdown'),
    status: $('syncText'),
    onGantiHari() {
      // lewat 00:00 WIB: form dibuka lagi dan data hari baru dimuat
      hapusLokal();
      tampilForm();
      muatHariIni();
    },
  });

  /* ---------- penyimpanan lokal (hanya untuk menampilkan kartu "sudah absen") ---------- */
  function simpanLokal(r, tanggal) {
    try { localStorage.setItem(LS_KEY, JSON.stringify(Object.assign({ tanggal }, r))); } catch (e) { /* abaikan */ }
  }
  function bacaLokal() {
    try { return JSON.parse(localStorage.getItem(LS_KEY) || 'null'); } catch (e) { return null; }
  }
  function hapusLokal() {
    try { localStorage.removeItem(LS_KEY); } catch (e) { /* abaikan */ }
  }

  /* ---------- tampilan ---------- */
  function pesan(teks, jenis) {
    const p = $('pesan');
    p.textContent = teks || '';
    p.className = 'msg ' + (jenis || '');
  }

  function tampilForm() {
    $('areaSukses').hidden = true;
    perbaruiKunci();
  }

  /* ---------- batas waktu absen: form terkunci di luar jam ---------- */
  let absen = { terbuka: true };

  function fmtHitung(s) {
    const x = Math.max(0, s);
    const p = (n) => (n < 10 ? '0' + n : String(n));
    return p(Math.floor(x / 3600)) + ':' + p(Math.floor((x % 3600) / 60)) + ':' + p(x % 60);
  }

  function terapkanStatus(st) {
    const n = W.now();
    absen = {
      terbuka: st.terbuka,
      alasan: st.alasan,
      buka: st.buka,
      tutup: st.tutup,
      tutupAt: st.terbuka && st.sisaDetik != null ? n + st.sisaDetik * 1000 : null,
      bukaAt: !st.terbuka && st.alasan === 'belum-buka' ? n + st.mulaiDalamDetik * 1000 : null,
    };
    perbaruiKunci();
  }

  function perbaruiKunci() {
    const sukses = !$('areaSukses').hidden;
    const kunci = !absen.terbuka;
    $('areaForm').hidden = sukses || kunci;
    $('areaTutup').hidden = sukses || !kunci;
    const adaBatas = absen.terbuka && !!absen.tutupAt;
    $('batas').hidden = sukses || !adaBatas;
    if (adaBatas) $('batasJam').textContent = absen.tutup;
    if (kunci) {
      if (absen.alasan === 'belum-buka') {
        $('tutupJudul').textContent = 'Absen belum dibuka';
        $('tutupPesan').textContent = 'Absen dibuka pukul ' + absen.buka + ' WIB. Halaman ini akan terbuka sendiri.';
      } else if (absen.alasan === 'sudah-tutup') {
        $('tutupJudul').textContent = 'Waktu absen sudah habis';
        $('tutupPesan').textContent = 'Absen ditutup pukul ' + absen.tutup + ' WIB. Hubungi guru jika kamu belum sempat absen.';
      } else {
        $('tutupJudul').textContent = 'Absen sedang ditutup';
        $('tutupPesan').textContent = 'Guru menutup absen untuk sementara. Coba lagi nanti atau hubungi guru.';
      }
      $('tutupHitung').hidden = !absen.bukaAt;
    }
    hitungMundur();
  }

  function hitungMundur() {
    const n = W.now();
    if (absen.terbuka && absen.tutupAt) {
      $('batasSisa').textContent = fmtHitung(Math.floor((absen.tutupAt - n) / 1000));
      if (n >= absen.tutupAt) {
        absen.terbuka = false;
        absen.alasan = 'sudah-tutup';
        absen.tutupAt = null;
        perbaruiKunci();
        muatHariIni();
      }
    } else if (!absen.terbuka && absen.bukaAt) {
      $('tutupSisa').textContent = fmtHitung(Math.floor((absen.bukaAt - n) / 1000));
      if (n >= absen.bukaAt) {
        absen.terbuka = true;
        absen.bukaAt = null;
        perbaruiKunci();
        muatHariIni();
      }
    }
  }
  setInterval(hitungMundur, 1000);

  function tampilSukses(r, tanggal, judul) {
    $('sNama').textContent = r.nama;
    $('sJudul').textContent = judul || 'Absenmu sudah tercatat. Terima kasih!';
    $('sStatus').replaceChildren(chip(r.status));
    $('sTempat').textContent = r.tempat;
    $('sWaktu').textContent = r.jam + ' WIB';
    $('sTanggal').textContent = W.tanggalDariKunci(tanggal);
    $('sLalu').dataset.ts = r.ts;
    $('sFresh').dataset.ts = r.ts;
    W.tickLalu($('areaSukses'));
    $('areaForm').hidden = true;
    $('areaTutup').hidden = true;
    $('batas').hidden = true;
    $('areaSukses').hidden = false;
  }

  function confetti() {
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const warna = ['#2f7bff', '#22d3ee', '#34d399', '#fbbf24', '#e8eefc', '#94a3b8'];
    const box = h('div', 'confetti');
    box.setAttribute('aria-hidden', 'true');
    for (let i = 0; i < 60; i++) {
      const s = h('span');
      s.style.setProperty('--x', Math.random() * 100 + 'vw');
      s.style.setProperty('--c', warna[i % warna.length]);
      s.style.setProperty('--d', 2 + Math.random() * 2 + 's');
      s.style.setProperty('--r', Math.random() * 360 + 'deg');
      s.style.setProperty('--delay', Math.random() * 0.5 + 's');
      box.append(s);
    }
    document.body.append(box);
    setTimeout(() => box.remove(), 4800);
  }

  /* ---------- rekap & absen terbaru ---------- */
  const feedTerlihat = new Set();
  let feedAwal = true;

  function gambarFeed(feed) {
    const ul = $('feed');
    ul.replaceChildren();
    $('feedKosong').hidden = feed.length > 0;
    feed.forEach((r) => {
      const idItem = r.ts + '|' + r.nama;
      // hanya absen yang baru masuk yang beranimasi, bukan semuanya setiap kali data dimuat ulang
      const li = h('li', 'feed-item' + (!feedAwal && !feedTerlihat.has(idItem) ? ' masuk' : ''));
      feedTerlihat.add(idItem);

      const av = h('span', 'avatar', inisial(r.nama));
      av.style.setProperty('--h', hue(r.nama));

      const tengah = h('div', 'feed-main');
      const meta = h('div', 'meta');
      meta.append(chip(r.status), h('span', null, '· ' + r.tempat + ' · ' + r.jam.slice(0, 5) + ' WIB'));
      tengah.append(h('strong', null, r.nama), meta);

      const kanan = h('div', 'feed-right');
      const fresh = h('span', 'fresh js-fresh');
      fresh.dataset.ts = r.ts;
      const teks = h('span', 'js-lalu');
      teks.dataset.ts = r.ts;
      kanan.append(fresh, teks);

      li.append(av, tengah, kanan);
      ul.append(li);
    });
    W.tickLalu(ul);
    feedAwal = false;
  }

  async function muatHariIni() {
    try {
      const d = await api('/api/hari-ini');
      $('nTotal').textContent = d.ringkasan.total;
      $('nHadir').textContent = d.ringkasan.Hadir;
      $('nIzin').textContent = d.ringkasan.Izin;
      $('nSakit').textContent = d.ringkasan.Sakit;
      if (d.absen) terapkanStatus(d.absen);
      $('kartuFeed').hidden = !d.feedPublik;
      if (d.feedPublik) gambarFeed(d.feed);
    } catch (e) {
      /* koneksi putus sesaat: biarkan data lama, coba lagi di putaran berikutnya */
    }
  }

  /* ---------- form ---------- */
  $('tempat').addEventListener('change', () => {
    const lain = $('tempat').value === 'Lainnya';
    $('tempatLainBox').hidden = !lain;
    if (lain) $('tempatLain').focus();
  });

  $('form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const nama = $('nama').value.trim().replace(/\s+/g, ' ');
    const kelas = $('kelas').value.trim();
    const pilihan = document.querySelector('input[name="status"]:checked');
    let tempat = $('tempat').value;
    if (tempat === 'Lainnya') tempat = $('tempatLain').value.trim();

    if (nama.length < 2) {
      pesan('Isi nama lengkapmu dulu ya.', 'err');
      $('nama').focus();
      return;
    }
    if (!pilihan) {
      pesan('Ceklis dulu status kehadiranmu (Hadir / Izin / Sakit).', 'err');
      return;
    }
    if (!tempat) {
      pesan('Pilih tempat absenmu dulu.', 'err');
      return;
    }

    const btn = $('kirim');
    btn.disabled = true;
    btn.textContent = 'Mengirim…';
    pesan('');

    try {
      const d = await api('/api/absen', { method: 'POST', body: { nama, kelas, status: pilihan.value, tempat } });
      simpanLokal(d.data, d.tanggal);
      tampilSukses(d.data, d.tanggal);
      if (d.data.status === 'Hadir') confetti();
      $('form').reset();
      $('tempatLainBox').hidden = true;
      muatHariIni();
    } catch (err) {
      if (err.status === 409 && err.data && err.data.data) {
        simpanLokal(err.data.data, err.data.tanggal);
        tampilSukses(err.data.data, err.data.tanggal, err.message);
        muatHariIni();
      } else if (err.status === 403 && err.data && err.data.absen) {
        terapkanStatus(err.data.absen);
      } else {
        pesan(err.status ? err.message : 'Tidak bisa terhubung ke server. Periksa internet lalu coba lagi.', 'err');
      }
    } finally {
      btn.disabled = false;
      btn.textContent = LABEL_KIRIM;
    }
  });

  $('btnLain').addEventListener('click', () => {
    hapusLokal();
    $('form').reset();
    $('tempatLainBox').hidden = true;
    pesan('');
    tampilForm();
    $('nama').focus();
  });

  /* ---------- daftar siswa (pilihan nama) ---------- */
  const kelasDariNama = new Map();

  async function muatDaftarSiswa() {
    try {
      const d = await api('/api/siswa');
      const dl = $('daftarSiswa');
      dl.replaceChildren();
      kelasDariNama.clear();
      d.daftar.forEach((s) => {
        const o = document.createElement('option');
        o.value = s.nama;
        if (s.kelas) o.label = s.kelas;
        dl.append(o);
        kelasDariNama.set(s.nama.toLowerCase(), s.kelas || '');
      });
    } catch (e) { /* abaikan */ }
  }

  $('nama').addEventListener('input', () => {
    const k = kelasDariNama.get($('nama').value.trim().toLowerCase());
    if (k && !$('kelas').value.trim()) $('kelas').value = k;
  });

  muatDaftarSiswa();

  /* ---------- mulai ---------- */
  const lokal = bacaLokal();
  if (lokal && lokal.tanggal === W.key(W.now())) tampilSukses(lokal, lokal.tanggal);

  muatHariIni();
  setInterval(muatHariIni, 10000);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') muatHariIni();
  });
})();
