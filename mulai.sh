#!/usr/bin/env bash
# Peluncur absensi untuk Mac / Linux: bash mulai.sh
cd "$(dirname "$0")" || exit 1

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js belum terpasang. Unduh di https://nodejs.org (pilih LTS), lalu jalankan lagi."
  exit 1
fi

export GURU_PASSWORD="${GURU_PASSWORD:-Masuk123}"
export PORT="${PORT:-3000}"

if command -v cloudflared >/dev/null 2>&1; then
  cloudflared tunnel --url "http://localhost:$PORT" &
  echo "Link untuk murid muncul di bawah: cari alamat https://....trycloudflare.com"
else
  echo "cloudflared belum terpasang, jadi absensi hanya bisa dibuka dari komputer ini."
fi

echo
echo "Halaman murid : http://localhost:$PORT"
echo "Panel guru    : http://localhost:$PORT/guru   (password: $GURU_PASSWORD)"
echo "Tekan Ctrl+C untuk mematikan absensi."
echo
node server.js
