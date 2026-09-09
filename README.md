# RH Habits

Frontend PWA RH Habits hosted on Vercel, dengan Google Apps Script sebagai API/RPC dan Google Sheets sebagai database.

## Arsitektur Web

Browser/HP -> `/api/rpc` -> Vercel rewrite -> Google Apps Script `/exec` -> Google Sheets

## Arsitektur Native GPS

Android/iOS -> native background GPS -> `/api/native-location` -> Apps Script `TripPoints` -> saat Trip selesai -> `Trips`

Build native memakai Capacitor + `@capgo/background-geolocation`. Native location updates dapat tetap dikirim ketika WebView berada di background; Android memakai foreground tracking notification. iOS tetap tunduk pada lifecycle/permission OS.

## File utama

- `index.html` - UI aplikasi + Trip Engine
- `gas-bridge.js` - bridge `google.script.run` -> `/api/rpc`
- `rh-native-gps.js` - bridge native GPS Android/iOS
- `api/native-location.js` - Vercel endpoint penerima GPS native
- `mobile-responsive.css` - responsive mobile/touch
- `sw.js` - service worker/PWA cache
- `manifest.json` - PWA metadata
- `vercel.json` - rewrite `/api/rpc` + cache headers
- `code.gs` - backend Apps Script utama + native `TripPoints`
- `maps-helpers.gs` - helper Google Maps jika project Apps Script kamu masih memisahkannya
- `capacitor.config.ts` - konfigurasi native wrapper
- `scripts/setup-native.mjs` - patch permission scaffolding Android/iOS setelah `cap add`
- `package.json` - Capacitor + background geolocation dependencies

## Apps Script deployment

Pastikan backend yang dipakai Vercel adalah deployment terbaru:

`https://script.google.com/macros/s/AKfycbyi6yqLiKwjpoy9TclZycH6KOPi0GXlPHc7iHGAA5srKCV6TVWOlSyTr-1V-JOiwlr2MQ/exec`

Bila project Apps Script kamu masih memakai `maps-helpers.gs` terpisah, file itu harus tetap berada dalam project yang sama dengan `code.gs`.

## Test koneksi

Buka:

`https://rhhabits.vercel.app/api/rpc?fn=ping&args=%5B%5D`

Hasil yang benar adalah JSON dengan `ok: true`.

## Build native

```bash
npm install
npx cap add android
npx cap add ios
npm run native:prepare
npx cap sync
```

Android: buka dengan Android Studio.

```bash
npx cap open android
```

iOS: buka dengan Xcode pada macOS, aktifkan Background Modes > Location updates sebelum release.

```bash
npx cap open ios
```

## Tracking & fuel

Web/PWA tetap punya fallback `navigator.geolocation`.

Native mode menyimpan titik dengan timestamp, latitude, longitude, accuracy, speed, bearing, altitude, dan source. Jarak dihitung dari titik GPS yang lolos filter. Kecepatan menggunakan GPS speed dan fallback delta distance/time.

Trip points native sementara disimpan di sheet `TripPoints`, lalu digabung ke `addTrip()` ketika perjalanan selesai.

Perhitungan BBM mingguan tetap menggunakan data jarak trip + pengisian BBM/efisiensi yang tersedia. GPS tidak dianggap bisa mengukur liter BBM terbakar secara langsung.
