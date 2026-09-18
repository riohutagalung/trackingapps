# RH Habits

RH Habits adalah aplikasi tracking perjalanan, kebiasaan rute, pengeluaran, dan analisis perjalanan.

## Arsitektur

**Web / PWA**
`index.html` → `/api/rpc` → Google Apps Script → Google Sheets

**Android / iOS**
Capacitor → native GPS → `/api/native-location` → Google Apps Script → `TripPoints`

## File utama

- `index.html` — UI + Trip Engine
- `gas-bridge.js` — bridge RPC web/native ke Vercel
- `rh-native-gps.js` — native GPS Android/iOS
- `rh-native-media.js` — native Camera/Gallery
- `api/rpc.js` — proxy RPC ke Apps Script
- `api/native-location.js` — endpoint GPS native
- `code.gs` — backend Apps Script
- `vercel.json` — konfigurasi Vercel
- `manifest.json` — PWA metadata
- `capacitor.config.ts` — konfigurasi Capacitor
- `scripts/setup-native.mjs` — persiapan build native
- `package.json` — dependency/build script

## Apps Script

Vercel memakai deployment Web App:

`https://script.google.com/macros/s/AKfycbyHREf-8F0Dd8G7hXtw_cyQskLkCzmkATDmOeBBovQWe9SeRw49ZIGxIzdSNTvScfn5qg/exec`

Jangan membuat deployment URL baru untuk konfigurasi yang sudah berjalan. Update source `code.gs`, save, lalu deploy **new version** pada deployment Web App yang sama.

## Test koneksi

Buka:

`https://rhhabits.vercel.app/api/rpc?fn=ping&args=%5B%5D`

Respons normal:

`{"ok":true,...}`

## Build native

```bash
npm install
npm run native:prepare
npx cap sync
npx cap open android
```

Untuk iOS, buka project dengan Xcode dan aktifkan **Background Modes → Location updates**.

## Catatan

Browser tetap memiliki fallback GPS.

Native GPS menyimpan titik sementara di `TripPoints`, lalu mengambilnya saat trip selesai.

Perhitungan BBM mingguan adalah estimasi dari jarak trip dan data pengisian/efisiensi; GPS tidak mengukur liter bensin secara langsung.
