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
- `Code.gs` — backend Apps Script (source maintained in the Apps Script project)
- `vercel.json` — konfigurasi Vercel
- `manifest.json` — PWA metadata
- `capacitor.config.ts` — konfigurasi Capacitor
- `scripts/setup-native.mjs` — persiapan build native
- `package.json` — dependency/build script
- `scripts/patch-capgo-ios.mjs` — reproducible iOS background-location patch for pinned Capgo 8.4.5

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

### Android

```bash
npm ci
npm run native:prepare
npx cap sync android
```

### iOS (Mac + Xcode)

**Codespaces/Linux dapat menyiapkan source, tetapi tidak dapat membangun atau memasang aplikasi native ke iPhone.** Untuk iOS native diperlukan Mac dengan Xcode yang sesuai dengan Capacitor 8.

Siapkan source di Mac:

```bash
git pull --ff-only origin fix/gps-speed-route-map-20261013
npm ci
npm run ios:prepare
npm run ios:doctor
npm run ios:open
```

Di Xcode:

1. Pilih project **App** lalu target **App** → **Signing & Capabilities**.
2. Aktifkan **Automatically manage signing** dan pilih Team dari Apple Account.
3. Pastikan **Background Modes → Location updates** aktif. File `Info.plist` proyek sudah memiliki izin lokasi saat digunakan, izin lokasi Always, serta `UIBackgroundModes = location`.
4. Sambungkan iPhone lewat kabel, pilih **Trust This Computer** di iPhone, aktifkan **Developer Mode** di iPhone bila diminta, lalu pilih iPhone itu sebagai run destination dan tekan **Run**.

Untuk tes di simulator tanpa signing:

```bash
npm run ios:build:sim
```

Akun Apple gratis dengan **Personal Team** dapat dipakai untuk pengujian pribadi melalui Xcode, tetapi provisioning untuk app/device akan kedaluwarsa setelah 7 hari sehingga perlu build dan instal ulang. Untuk TestFlight atau App Store, gunakan Apple Developer Program.

## Catatan

Browser tetap memiliki fallback GPS.

Native GPS menyimpan titik sementara di `TripPoints`, lalu mengambilnya saat trip selesai.

Perhitungan BBM mingguan adalah estimasi dari jarak trip dan data pengisian/efisiensi; GPS tidak mengukur liter bensin secara langsung.

## GPS tracking production rule

Production Apps Script yang dipakai RH Habits adalah deployment HRE yang terkunci. Jangan membuat URL deployment baru hanya untuk perubahan versi; update `Code.gs`, lalu deploy **new version** pada Web App deployment yang sama.

Native tracking menggunakan provider GNSS speed bila tersedia dan Haversine sebagai fallback untuk validasi/missing speed. Pada iOS, native preparation memasang `CLBackgroundActivitySession` untuk meningkatkan reliability saat layar dikunci; iOS tetap dapat menangguhkan atau menghentikan app sesuai kebijakan sistem operasi.
