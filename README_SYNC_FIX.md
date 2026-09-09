SYNC FIX

Penyebab status "Sinkronisasi..." adalah index.html memanggil google.script.run tetapi tidak memuat gas-bridge.js ketika aplikasi dibuka dari Vercel.

Perbaikan:
1. Muat gas-bridge.js sebelum kode aplikasi.
2. Muat rh-native-gps.js setelah bridge.
3. Pastikan gas-bridge.js, rh-native-gps.js, index.html berada satu root Vercel.
4. Hard refresh browser setelah deploy.

Urutan script:
<script src="gas-bridge.js"></script>
<script src="rh-native-gps.js"></script>
