# Panduan Integrasi RH Habits PWA & Google Apps Script

Berikut adalah panduan untuk menggabungkan file `manifest.json`, `sw.js`, dan menyambungkan aplikasi `catatanku_V10_FINAL_2.html` milikmu ke Google Spreadsheet secara *real-time*.

## 1. Persiapan File
Pastikan ketiga file berikut berada di dalam satu folder yang sama:
- `catatanku_V10_FINAL_2.html`
- `manifest.json`
- `sw.js`
*(Note: Siapkan juga logo aplikasi dengan nama `icon-192.png` dan `icon-512.png` agar PWA bisa diinstall sempurna di HP).*

## 2. Edit File HTML (`catatanku_V10_FINAL_2.html`)

### A. Ubah Link Manifest
Cari baris ini di dalam `<head>`:
```html
<link rel="manifest" href="?manifest=1">
```
Ubah menjadi:
```html
<link rel="manifest" href="manifest.json">
```

### B. Tambahkan Script Service Worker & Koneksi Database
Scroll ke bagian paling bawah file HTML kamu (tepat di atas tag `</body>`). Tambahkan kode JavaScript berikut untuk mendaftarkan Service Worker dan membuat fungsi "real-time" sync dengan Google Apps Script.

```html
<script>
  // 1. REGISTER SERVICE WORKER (Untuk PWA)
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js')
        .then(registration => {
          console.log('ServiceWorker berhasil didaftarkan dengan scope: ', registration.scope);
        })
        .catch(err => {
          console.log('ServiceWorker gagal didaftarkan: ', err);
        });
    });
  }

  // 2. KONEKSI REAL-TIME GOOGLE APPS SCRIPT
  const WEB_APP_URL = "https://script.google.com/macros/s/AKfycbxKW6HQtYkFjpz6UqzfzY5XLZXySHTgE8_rVPrgnXuR2oLbA-8sT3VK2RWCTXYmK1-lLw/exec";

  // Fungsi untuk mengambil data dari Spreadsheet
  async function fetchData() {
    try {
      const response = await fetch(WEB_APP_URL + "?action=getData");
      // Karena masalah CORS biasanya Fetch ke GAS butuh mode no-cors jika tidak diatur dari server,
      // pastikan Apps Script kamu mereturn JSONP atau JSON response yang proper.
      const data = await response.json(); 
      console.log("Data tersinkronisasi:", data);
      
      // TODO: Panggil fungsi update UI di sini menggunakan 'data'
      // contoh: renderHabits(data.habits);

    } catch (error) {
      console.error("Gagal sinkronisasi data:", error);
    }
  }

  // Fungsi untuk menyimpan data ke Spreadsheet
  async function sendData(payload) {
    try {
      const response = await fetch(WEB_APP_URL, {
        method: "POST",
        // header content-type text/plain digunakan untuk menghindari preflight CORS error di GAS
        headers: {
            "Content-Type": "text/plain;charset=utf-8", 
        },
        body: JSON.stringify(payload)
      });
      const result = await response.json();
      console.log("Data berhasil disimpan:", result);
      
      // Ambil ulang data agar UI selalu sinkron (real-time feeling)
      fetchData(); 
    } catch (error) {
      console.error("Gagal mengirim data:", error);
    }
  }

  // 3. EFEK "REAL-TIME" DENGAN POLLING
  // Aplikasi akan mengecek data terbaru di Spreadsheet setiap 5 detik (5000 ms)
  setInterval(fetchData, 5000);

  // Ambil data pertama kali saat aplikasi dibuka
  window.onload = () => {
    fetchData();
  };
</script>
```

## 3. Catatan Penting untuk Apps Script Kamu (.gs)
Agar file HTML dapat membaca datanya, pastikan file `Code.gs` di web app Google Script kamu sudah mereturn data menggunakan `ContentService` agar tidak kena block **CORS**. Contoh standar `Code.gs`:

```javascript
function doGet(e) {
  var action = e.parameter.action;
  if(action == "getData") {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    var data = sheet.getDataRange().getValues();
    
    // Kembalikan sebagai JSON
    return ContentService.createTextOutput(JSON.stringify(data))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function doPost(e) {
  var data = JSON.parse(e.postData.contents);
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  
  // Contoh nambah baris:
  sheet.appendRow([data.tanggal, data.kategori, data.jumlah]);
  
  return ContentService.createTextOutput(JSON.stringify({"status": "success"}))
    .setMimeType(ContentService.MimeType.JSON);
}
```
Pastikan deploy ulang sebagai "New Version" setiap kali kamu mengedit `Code.gs`!
