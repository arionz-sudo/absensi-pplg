# Absensi Siswa PPLG

Web absensi sekolah bertema biru-abu khas jurusan PPLG. Server Node.js **tanpa dependensi** (tidak perlu `npm install`).

## Fitur

- **Siswa**: isi nama, ceklis Hadir / Izin / Sakit, pilih tempat absen, kirim.
- **Jam & tanggal WIB otomatis** dari jam server (bukan jam HP siswa), ganti hari tepat pukul 00:00 WIB.
- Tiap absen tercatat **jam, menit, dan detik** pengiriman + keterangan **"sudah berapa lama"** yang berdetak langsung
  (*Baru saja* < 5 menit, *Belum lama* < 1 jam, *Sudah lama* ≥ 1 jam).
- **Panel guru** di `/guru` (pakai password): daftar yang hadir per tanggal, filter status, cari nama, rekap tempat,
  hapus data salah, unduh CSV (bisa dibuka di Excel / Google Sheets).
- Satu nama + kelas hanya bisa absen satu kali per hari.
- **Daftar siswa & "Belum absen"**: guru mengisi daftar siswa (satu per baris, format `Nama, Kelas`) di panel guru.
  Panel lalu menampilkan siapa yang **belum** mengisi absen hari itu (Izin dan Sakit dihitung sudah mengisi).
  Nama dari daftar juga muncul sebagai pilihan di form siswa, supaya ejaan nama selalu cocok.

## Tampilan

Layar loading saat halaman dibuka, kartu kaca, latar biru-abu yang bergerak, dan efek cair saat tombol ditekan.
Semua efek ada di `public/fx.js` dan bagian bawah `public/style.css`. Latar bergerak memakai canvas beresolusi rendah
dan hanya animasi transform/opacity, jadi ringan. Kalau perangkat terasa berat, kualitas turun sendiri
(resolusi latar dikurangi, partikel dimatikan, lalu efek kaca dimatikan). Pengguna yang mengaktifkan
"kurangi gerakan" di sistemnya mendapat latar diam tanpa animasi.

## Cara tercepat: database di komputer guru

Data absen tersimpan di folder `data` di komputer yang menjalankan server. Murid hanya bisa membuka absensi
selama komputer guru menyala dan jendela absensi masih terbuka. Kalau dimatikan, absensi tidak bisa dibuka.

1. Pasang Node.js (LTS) dari https://nodejs.org kalau belum ada.
2. Windows: klik dua kali **`Mulai-Absensi.bat`**. Mac/Linux: `bash mulai.sh`.
3. Murid membuka `http://localhost:3000` di komputer itu. Panel guru ada di `/guru`, password bawaan `Masuk123`.

### Link untuk murid (dibuka dari HP masing-masing)

`localhost` hanya bisa dibuka di komputer guru. Supaya murid bisa membuka dari HP, pasang **cloudflared**
(gratis, tanpa daftar akun): unduh di https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/
dan letakkan agar bisa dipanggil dari terminal (`cloudflared --version` harus jalan).
Setelah itu `Mulai-Absensi.bat` otomatis membuka jendela kedua yang menampilkan alamat
`https://....trycloudflare.com`. **Bagikan alamat itu ke murid.** Alamat ini **berubah setiap kali dinyalakan**,
jadi bagikan lagi tiap kali absensi dibuka. Untuk alamat tetap perlu domain sendiri dan tunnel bernama (lihat dokumentasi Cloudflare).

### Batas waktu absen

Di panel guru, bagian **Batas Waktu Absen**, ada tiga mode:
- **Buka terus**: tanpa batas waktu (bawaan).
- **Ikuti jam buka dan tutup**: misalnya buka 06:00, tutup 08:00 WIB. Di luar jam itu form murid terkunci otomatis,
  dan murid melihat hitung mundur sampai ditutup atau dibuka.
- **Tutup sekarang**: mengunci seketika, sampai guru membukanya lagi.

Penguncian dicek di server, jadi tidak bisa dilewati dengan mengubah jam HP.

## Menjalankan di komputer (cara manual)

```bash
# butuh Node.js 18 ke atas
GURU_PASSWORD=passwordkamu node server.js
```

Windows (PowerShell):

```powershell
$env:GURU_PASSWORD="passwordkamu"; node server.js
```

Buka `http://localhost:3000` (siswa) dan `http://localhost:3000/guru` (guru).

## Pengaturan (environment variable)

| Variabel | Bawaan | Keterangan |
|---|---|---|
| `GURU_PASSWORD` | `Masuk123` | **Ganti** sebelum dipakai online (password ini terlihat di kode) |
| `ROSTER_FILE` | `./data/absensi-siswa.json` | Lokasi file daftar siswa |
| `SETTINGS_FILE` | `./data/absensi-pengaturan.json` | Lokasi file pengaturan batas waktu |
| `PORT` | `3000` | Port server (hosting biasanya mengisinya otomatis) |
| `DATA_FILE` | `./data/absensi.json` | Lokasi file data absensi |
| `FEED_PUBLIK` | `true` | `false` = daftar "Absen Terbaru" di halaman siswa disembunyikan (hanya guru yang melihat nama) |

## Agar online dan bisa diakses terus

Server ini harus berjalan di mesin yang menyala terus. Pilih salah satu:

1. **Cepat & gratis (selama komputer menyala)** — jalankan server di komputer sekolah/lab, lalu buka terowongan publik, misalnya
   `cloudflared tunnel --url http://localhost:3000`. Alamat `https://...trycloudflare.com` bisa dibagikan ke siswa.
2. **VPS murah** (Niagahoster, IDCloudHost, DigitalOcean, dll.) — salin folder ini, jalankan dengan `pm2 start server.js`
   atau systemd, lalu pasang domain + HTTPS (Caddy/Nginx).
3. **PaaS (Railway, Fly.io, Render, dll.)** — deploy dari repo GitHub / `Dockerfile` yang sudah disediakan.

> **Penting soal data:** data disimpan di file `DATA_FILE`. Di hosting gratis yang disk-nya sementara
> (misalnya paket gratis Render), file itu **hilang saat server restart/tidur**. Pasang *persistent volume/disk*
> (mis. di `/app/data`) atau pakai VPS supaya data aman. Unduh CSV rutin sebagai cadangan.

## Struktur

```
server.js        server + API + penyimpanan JSON
public/
  index.html     halaman siswa
  guru.html      panel guru
  style.css      tema biru-abu
  common.js      jam WIB, format "x menit yang lalu", helper API
  app.js         logika halaman siswa
  guru.js        logika panel guru
Dockerfile       untuk deploy container
```

## API singkat

| Metode | Endpoint | Keterangan |
|---|---|---|
| GET | `/api/waktu` | waktu server (WIB) |
| GET | `/api/hari-ini` | rekap + absen terbaru hari ini |
| POST | `/api/absen` | `{nama, kelas, status, tempat}` |
| POST | `/api/guru/login` | `{password}` → token |
| GET | `/api/guru/absensi?tanggal=YYYY-MM-DD` | daftar absen (butuh token) |
| DELETE | `/api/guru/absensi/:id?tanggal=...` | hapus satu absen |
| GET | `/api/guru/export?tanggal=...` | unduh CSV |
| GET / PUT | `/api/guru/pengaturan` | baca / ubah batas waktu absen (`mode`, `buka`, `tutup`) |
