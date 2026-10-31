/* Panel guru */
(function () {
  'use strict';

  const { h, hue, inisial, chip, api } = window.UI;
  const W = window.Waktu;
  const $ = (id) => document.getElementById(id);
  const TOKEN_KEY = 'absen-pplg-guru-token';

  let token = '';
  try { token = sessionStorage.getItem(TOKEN_KEY) || ''; } catch (e) { /* abaikan */ }

  let tanggal = '';
  let hariIni = '';
  let data = [];
  let filterStatus = 'Semua';
  let belum = [];
  let jumlahSiswa = 0;

  W.bindJam({
    jam: $('jam'),
    tanggal: $('tanggal'),
    countdown: $('countdown'),
    status: $('syncText'),
    onGantiHari(k) {
      const sedangLihatHariIni = tanggal === hariIni;
      hariIni = k;
      if (sedangLihatHariIni) tanggal = k; // ikut pindah ke hari baru otomatis
      if (token) muat(true);
    },
  });

  const authHeader = () => ({ Authorization: 'Bearer ' + token });

  function toast(teks) {
    const t = h('div', 'toast', teks);
    document.body.append(t);
    setTimeout(() => t.remove(), 3500);
  }

  /* ---------- login / logout ---------- */
  function tampilLogin(teks) {
    $('login').hidden = false;
    $('dash').hidden = true;
    const p = $('pesanLogin');
    p.textContent = teks || '';
    p.className = 'msg ' + (teks ? 'err' : '');
  }

  function tampilDash() {
    $('login').hidden = true;
    $('dash').hidden = false;
  }

  function keluar(pesan) {
    token = '';
    try { sessionStorage.removeItem(TOKEN_KEY); } catch (e) { /* abaikan */ }
    data = [];
    tampilLogin(pesan);
  }

  $('formLogin').addEventListener('submit', async (e) => {
    e.preventDefault();
    const pw = $('password').value;
    if (!pw) return;
    const btn = $('btnMasuk');
    btn.disabled = true;
    try {
      const d = await api('/api/guru/login', { method: 'POST', body: { password: pw } });
      token = d.token;
      try { sessionStorage.setItem(TOKEN_KEY, token); } catch (err) { /* abaikan */ }
      $('password').value = '';
      tampilDash();
      muatSiswa();
      muatJadwal(true);
      await muat();
    } catch (err) {
      tampilLogin(err.status ? err.message : 'Tidak bisa terhubung ke server.');
    } finally {
      btn.disabled = false;
    }
  });

  $('btnKeluar').addEventListener('click', () => keluar(''));

  /* ---------- muat data ---------- */
  async function muat(diam) {
    try {
      const q = tanggal ? '?tanggal=' + encodeURIComponent(tanggal) : '';
      const d = await api('/api/guru/absensi' + q, { headers: authHeader() });
      hariIni = d.hariIni;
      tanggal = d.tanggal;
      data = d.data;
      belum = d.belumAbsen || [];
      jumlahSiswa = d.jumlahSiswa || 0;
      $('tgl').value = tanggal;
      $('tgl').max = hariIni;
      $('btnBesok').disabled = tanggal >= hariIni;
      $('judulTanggal').textContent = W.tanggalDariKunci(tanggal) + (tanggal === hariIni ? ' (hari ini)' : '');
      $('diperbarui').textContent = 'Diperbarui ' + W.jam(W.now()) + ' WIB';
      gambar();
    } catch (err) {
      if (err.status === 401) return keluar('Sesi habis, silakan masuk lagi.');
      if (!diam) toast(err.message || 'Gagal memuat data.');
    }
  }

  /* ---------- tampilan ---------- */
  function baris(r, i) {
    const tr = h('tr');
    const td = (label, isi, kelas) => {
      const c = h('td', kelas);
      c.dataset.label = label;
      if (typeof isi === 'string') c.textContent = isi;
      else if (isi) c.append(isi);
      tr.append(c);
    };

    td('No', String(i + 1), 'mono');

    const nm = h('div', 'cell-nama');
    const av = h('span', 'avatar sm', inisial(r.nama));
    av.style.setProperty('--h', hue(r.nama));
    nm.append(av, h('strong', null, r.nama));
    td('Nama', nm);

    td('Kelas', r.kelas || '—');
    td('Status', chip(r.status));
    td('Tempat', r.tempat);
    td('Jam', r.jam + ' WIB', 'mono');

    const ago = h('div', 'ago-cell');
    const fresh = h('span', 'fresh js-fresh');
    fresh.dataset.ts = r.ts;
    const teks = h('span', 'js-lalu');
    teks.dataset.ts = r.ts;
    ago.append(fresh, teks);
    td('Sudah', ago);

    const del = h('button', 'btn danger small', 'Hapus');
    del.type = 'button';
    del.addEventListener('click', () => hapus(r));
    td('', del);

    return tr;
  }

  function gambar() {
    const hit = { Hadir: 0, Izin: 0, Sakit: 0 };
    const perTempat = new Map();
    data.forEach((r) => {
      if (r.status in hit) hit[r.status]++;
      perTempat.set(r.tempat, (perTempat.get(r.tempat) || 0) + 1);
    });
    $('nTotal').textContent = data.length;
    $('nHadir').textContent = hit.Hadir;
    $('nIzin').textContent = hit.Izin;
    $('nSakit').textContent = hit.Sakit;
    gambarBelum();

    const rekap = $('rekap');
    rekap.replaceChildren();
    [...perTempat.entries()].sort((a, b) => b[1] - a[1]).forEach(([t, n]) => {
      rekap.append(h('span', 'chip plain', t + ' · ' + n));
    });

    const cari = $('cari').value.trim().toLowerCase();
    const list = data.filter((r) =>
      (filterStatus === 'Semua' || r.status === filterStatus) &&
      (!cari || (r.nama + ' ' + r.kelas + ' ' + r.tempat).toLowerCase().includes(cari))
    );

    const urut = $('urut').value;
    if (urut === 'terbaru') list.sort((a, b) => b.ts - a.ts);
    else if (urut === 'terlama') list.sort((a, b) => a.ts - b.ts);
    else list.sort((a, b) => a.nama.localeCompare(b.nama, 'id'));

    $('isi').replaceChildren(...list.map(baris));
    $('tabel').hidden = list.length === 0;
    $('kosong').hidden = list.length > 0;
    $('kosongTeks').textContent = data.length ? 'Tidak ada hasil untuk filter ini.' : 'Belum ada siswa yang absen pada tanggal ini.';
    W.tickLalu($('isi'));
  }

  /* ---------- belum absen & daftar siswa ---------- */
  function gambarBelum() {
    const box = $('daftarBelum');
    box.replaceChildren();
    $('nBelum').textContent = jumlahSiswa ? belum.length : '–';
    $('nBelumChip').textContent = jumlahSiswa ? belum.length : 0;

    if (!jumlahSiswa) {
      $('belumKet').textContent = 'Daftar siswa belum diisi. Isi di bagian "Daftar Siswa Kelas" di bawah, lalu siapa yang belum absen akan muncul di sini.';
      return;
    }
    if (!belum.length) {
      $('belumKet').textContent = 'Semua siswa di daftar sudah mengisi absen pada tanggal ini.';
      return;
    }
    $('belumKet').textContent = belum.length + ' dari ' + jumlahSiswa + ' siswa belum mengisi absen (Izin dan Sakit dihitung sudah mengisi).';
    belum.forEach((s) => {
      const pill = h('span', 'name-pill');
      const av = h('span', 'avatar', inisial(s.nama));
      av.style.setProperty('--h', hue(s.nama));
      pill.append(av, h('span', null, s.nama));
      if (s.kelas) pill.append(h('small', null, s.kelas));
      box.append(pill);
    });
  }

  async function muatSiswa() {
    try {
      const d = await api('/api/guru/siswa', { headers: authHeader() });
      $('teksSiswa').value = d.daftar.map((s) => (s.kelas ? s.nama + ', ' + s.kelas : s.nama)).join('\n');
    } catch (err) {
      if (err.status === 401) keluar('Sesi habis, silakan masuk lagi.');
    }
  }

  $('btnSimpanSiswa').addEventListener('click', async () => {
    const btn = $('btnSimpanSiswa');
    const p = $('pesanSiswa');
    btn.disabled = true;
    try {
      const d = await api('/api/guru/siswa', { method: 'PUT', headers: authHeader(), body: { teks: $('teksSiswa').value } });
      p.textContent = 'Tersimpan: ' + d.daftar.length + ' siswa.';
      p.className = 'msg ok';
      await muat(true);
    } catch (err) {
      if (err.status === 401) return keluar('Sesi habis, silakan masuk lagi.');
      p.textContent = err.message || 'Gagal menyimpan.';
      p.className = 'msg err';
    } finally {
      btn.disabled = false;
    }
  });

  /* ---------- batas waktu absen ---------- */
  function teksStatus(st) {
    if (st.terbuka) {
      return st.mode === 'buka'
        ? 'Sekarang: TERBUKA tanpa batas waktu.'
        : 'Sekarang: TERBUKA, ditutup otomatis pukul ' + st.tutup + ' WIB.';
    }
    if (st.alasan === 'belum-buka') return 'Sekarang: TERKUNCI, dibuka otomatis pukul ' + st.buka + ' WIB.';
    if (st.alasan === 'sudah-tutup') return 'Sekarang: TERKUNCI, waktu absen sudah habis (tutup pukul ' + st.tutup + ' WIB).';
    return 'Sekarang: TERKUNCI (ditutup oleh guru).';
  }

  function isiJadwal(d, isiForm) {
    $('statusJadwal').textContent = teksStatus(d.status);
    if (isiForm) {
      $('pMode').value = d.pengaturan.mode;
      $('pBuka').value = d.pengaturan.buka;
      $('pTutup').value = d.pengaturan.tutup;
    }
  }

  async function muatJadwal(isiForm) {
    try {
      isiJadwal(await api('/api/guru/pengaturan', { headers: authHeader() }), isiForm);
    } catch (err) {
      if (err.status === 401) keluar('Sesi habis, silakan masuk lagi.');
    }
  }

  $('btnSimpanJadwal').addEventListener('click', async () => {
    const btn = $('btnSimpanJadwal');
    const p = $('pesanJadwal');
    btn.disabled = true;
    try {
      const d = await api('/api/guru/pengaturan', {
        method: 'PUT',
        headers: authHeader(),
        body: { mode: $('pMode').value, buka: $('pBuka').value, tutup: $('pTutup').value },
      });
      isiJadwal(d, false);
      p.textContent = 'Pengaturan tersimpan.';
      p.className = 'msg ok';
    } catch (err) {
      if (err.status === 401) return keluar('Sesi habis, silakan masuk lagi.');
      p.textContent = err.message || 'Gagal menyimpan.';
      p.className = 'msg err';
    } finally {
      btn.disabled = false;
    }
  });

  setInterval(() => {
    if (token && !$('dash').hidden && document.visibilityState === 'visible') muatJadwal(false);
  }, 15000);

  /* ---------- aksi ---------- */
  async function hapus(r) {
    if (!confirm('Hapus absen "' + r.nama + '" pada ' + W.tanggalDariKunci(tanggal) + '?')) return;
    try {
      await api('/api/guru/absensi/' + r.id + '?tanggal=' + encodeURIComponent(tanggal), { method: 'DELETE', headers: authHeader() });
      toast('Absen ' + r.nama + ' dihapus.');
      muat(true);
    } catch (err) {
      if (err.status === 401) return keluar('Sesi habis, silakan masuk lagi.');
      toast(err.message || 'Gagal menghapus.');
    }
  }

  async function ekspor() {
    try {
      const r = await fetch('/api/guru/export?tanggal=' + encodeURIComponent(tanggal), { headers: authHeader() });
      if (r.status === 401) return keluar('Sesi habis, silakan masuk lagi.');
      if (!r.ok) throw new Error('Gagal mengunduh file.');
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'absensi-' + tanggal + '.csv';
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    } catch (err) {
      toast(err.message || 'Gagal mengunduh file.');
    }
  }

  $('btnExport').addEventListener('click', ekspor);
  $('btnRefresh').addEventListener('click', () => muat());
  $('btnHariIni').addEventListener('click', () => { tanggal = hariIni; muat(); });
  $('btnKemarin').addEventListener('click', () => { tanggal = W.geserKunci(tanggal, -1); muat(); });
  $('btnBesok').addEventListener('click', () => {
    const next = W.geserKunci(tanggal, 1);
    if (next <= hariIni) { tanggal = next; muat(); }
  });
  $('tgl').addEventListener('change', () => {
    if ($('tgl').value) { tanggal = $('tgl').value; muat(); }
  });
  $('cari').addEventListener('input', gambar);
  $('urut').addEventListener('change', gambar);
  document.querySelectorAll('.tab').forEach((b) => {
    b.addEventListener('click', () => {
      filterStatus = b.dataset.f;
      document.querySelectorAll('.tab').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      gambar();
    });
  });

  /* muat otomatis tiap 10 detik selama melihat hari ini */
  setInterval(() => {
    if (token && !$('dash').hidden && document.visibilityState === 'visible' && tanggal === hariIni) muat(true);
  }, 10000);

  /* ---------- mulai ---------- */
  if (token) {
    tampilDash();
    muatSiswa();
    muatJadwal(true);
    muat();
  } else {
    tampilLogin('');
  }
})();
