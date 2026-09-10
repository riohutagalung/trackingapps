# RH Habits — Native Android/iOS build

Perubahan ini mempertahankan UI dan Apps Script yang sekarang, tetapi menambahkan native GPS engine untuk build Android/iOS.

## 1. Install dependencies

```bash
npm install
```

## 2. Generate platform project

```bash
npx cap add android
npx cap add ios
node scripts/setup-native.mjs
npx cap sync
```

## 3. Android

```bash
npx cap open android
```

Build/install dari Android Studio. Saat Trip Tracking aktif, Android memakai native foreground location service dan notifikasi tracking.

## 4. iOS

```bash
npx cap open ios
```

Di Xcode aktifkan Background Modes > Location updates dan pastikan deskripsi permission lokasi sudah sesuai produk. Build/signing iOS tetap membutuhkan macOS + Xcode + Apple Developer account.

## 5. Alur tracking

Web/PWA tetap menggunakan `navigator.geolocation` sebagai fallback.

Build native memakai `@capgo/background-geolocation`. Titik native dikirim ke `/api/native-location`, lalu diteruskan ke Apps Script `TripPoints`. Saat WebView hidup, titik juga masuk ke UI melalui event `rh-native-location`. Ketika trip dihentikan, titik yang diterima server digabung dengan titik UI sebelum `addTrip()` dipanggil.

## 6. Disclosure

Sebelum native tracking pertama, aplikasi menjelaskan bahwa lokasi digunakan ketika Trip Tracking aktif, termasuk saat layar dikunci, untuk jarak, kecepatan, route points, dan analisis perjalanan.

## 7. Catatan akurasi

Jarak dihitung dari titik GPS berurutan setelah filter outlier. Kecepatan memakai GPS speed jika tersedia dan fallback delta-distance/time. Konsumsi BBM mingguan tetap merupakan estimasi berbasis data trip + catatan pengisian BBM/efisiensi yang ada; GPS sendiri tidak dapat mengukur liter bensin yang benar-benar terbakar.

## Media / OCR

Native Android/iOS memakai `@capacitor/camera` untuk Kamera dan Galeri. Desktop/Web tetap memakai input file biasa. Keduanya mengirim hasil foto yang sudah diperkecil ke OCR Apps Script sehingga alur OCR sama lintas device.
