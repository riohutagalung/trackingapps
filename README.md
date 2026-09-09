# RH Habits

Frontend PWA RH Habits hosted on Vercel, dengan Google Apps Script sebagai API/RPC dan Google Sheets sebagai database.

## Arsitektur

Browser/HP -> `/api/rpc` -> Vercel rewrite -> Google Apps Script `/exec` -> Google Sheets

## File utama

- `index.html` - UI aplikasi
- `gas-bridge.js` - bridge `google.script.run` -> `/api/rpc`
- `mobile-responsive.css` - responsive mobile/touch
- `sw.js` - service worker/PWA cache
- `manifest.json` - PWA metadata
- `vercel.json` - rewrite `/api/rpc` ke Apps Script
- `code.gs` - backend Apps Script utama
- `maps-helpers.gs` - helper Google Maps yang dipanggil backend

## Apps Script deployment

Pastikan `code.gs` dan `maps-helpers.gs` berada di project Apps Script yang sama, lalu deploy ulang Web App setelah perubahan backend.

Deployment URL yang digunakan Vercel:

`https://script.google.com/macros/s/AKfycbyi6yqLiKwjpoy9TclZycH6KOPi0GXlPHc7iHGAA5srKCV6TVWOlSyTr-1V-JOiwlr2MQ/exec`

## Test koneksi

Buka:

`https://rhhabits.vercel.app/api/rpc?fn=ping&args=%5B%5D`

Hasil yang benar adalah JSON dengan `ok: true`. Jika muncul `ReferenceError: getTripMapsUrl is not defined`, berarti file `maps-helpers.gs` belum masuk ke project Apps Script yang dipakai deployment, atau deployment belum di-update.

## Deploy Vercel

Root directory Vercel harus folder yang berisi `index.html` dan `vercel.json`. Untuk static frontend ini tidak perlu Serverless Function `/api/rpc.js` dan tidak perlu runtime Node khusus.
