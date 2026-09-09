import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const addAndroidPermissions = (file) => {
  if (!fs.existsSync(file)) return;
  let s = fs.readFileSync(file, 'utf8');
  const names = [
    'android.permission.ACCESS_FINE_LOCATION',
    'android.permission.ACCESS_COARSE_LOCATION',
    'android.permission.FOREGROUND_SERVICE',
    'android.permission.FOREGROUND_SERVICE_LOCATION',
    'android.permission.POST_NOTIFICATIONS'
  ];
  const missing = names.filter(name => !s.includes(name)).map(name => `    <uses-permission android:name="${name}" />`).join('\n');
  if (missing) s = s.replace(/<application\b/, missing + '\n\n  <application');
  fs.writeFileSync(file, s);
};

addAndroidPermissions(path.join(root, 'android/app/src/main/AndroidManifest.xml'));

const strings = path.join(root, 'android/app/src/main/res/values/strings.xml');
if (fs.existsSync(strings)) {
  let s = fs.readFileSync(strings, 'utf8');
  const additions = `\n    <string name="capacitor_background_geolocation_notification_channel_name">RH Habits Tracking</string>\n    <string name="capacitor_background_geolocation_notification_icon">ic_launcher</string>\n`;
  if (!s.includes('capacitor_background_geolocation_notification_channel_name')) s=s.replace('</resources>', additions+'</resources>');
  fs.writeFileSync(strings,s);
}

const plist = path.join(root, 'ios/App/App/Info.plist');
if (fs.existsSync(plist)) {
  let s = fs.readFileSync(plist, 'utf8');
  const inserts = [];
  if (!s.includes('<key>NSLocationWhenInUseUsageDescription</key>')) inserts.push(`\n\t<key>NSLocationWhenInUseUsageDescription</key>\n\t<string>RH Habits menggunakan lokasi saat Trip Tracking aktif untuk menghitung jarak, kecepatan, dan rute perjalanan.</string>`);
  if (!s.includes('<key>NSLocationAlwaysAndWhenInUseUsageDescription</key>')) inserts.push(`\n\t<key>NSLocationAlwaysAndWhenInUseUsageDescription</key>\n\t<string>RH Habits menggunakan lokasi saat Trip Tracking aktif, termasuk ketika layar dikunci, untuk merekam perjalanan.</string>`);
  if (!s.includes('<key>NSCameraUsageDescription</key>')) inserts.push(`\n\t<key>NSCameraUsageDescription</key>\n\t<string>RH Habits membutuhkan akses kamera saat kamu memilih Ambil Foto untuk membaca struk.</string>`);
  if (!s.includes('<key>NSPhotoLibraryUsageDescription</key>')) inserts.push(`\n\t<key>NSPhotoLibraryUsageDescription</key>\n\t<string>RH Habits membutuhkan akses foto saat kamu memilih gambar struk dari galeri.</string>`);
  if (!s.includes('<key>UIBackgroundModes</key>')) inserts.push(`\n\t<key>UIBackgroundModes</key>\n\t<array>\n\t\t<string>location</string>\n\t</array>`);
  if (inserts.length) s=s.replace('</dict>', inserts.join('')+'\n</dict>');
  fs.writeFileSync(plist,s);
}

console.log('[RH] Native preparation complete. Android/iOS permission scaffolding patched. Review Info.plist and Xcode Background Modes before release.');
