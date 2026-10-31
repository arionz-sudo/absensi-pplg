@echo off
chcp 65001 >nul
title Absensi PPLG - jangan ditutup selama absensi dipakai
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 goto tanpa_node

if "%GURU_PASSWORD%"=="" set "GURU_PASSWORD=Masuk123"
set PORT=3000

where cloudflared >nul 2>nul
if errorlevel 1 goto tanpa_tunnel
start "Link publik - jangan ditutup" cmd /k cloudflared tunnel --url http://localhost:%PORT%
echo Link untuk murid akan muncul di jendela baru: cari alamat https://....trycloudflare.com
goto jalan

:tanpa_tunnel
echo cloudflared belum terpasang, jadi absensi hanya bisa dibuka dari komputer ini.
echo Lihat README.md bagian "Link untuk murid" untuk cara memasangnya.

:jalan
echo.
echo Halaman murid : http://localhost:%PORT%
echo Panel guru    : http://localhost:%PORT%/guru   (password: %GURU_PASSWORD%)
echo Data absen    : folder "data" di dalam folder ini
echo Tutup jendela ini untuk mematikan absensi.
echo.
node server.js
pause
exit /b

:tanpa_node
echo Node.js belum terpasang.
echo Unduh di https://nodejs.org (pilih versi LTS), pasang, lalu jalankan file ini lagi.
pause
