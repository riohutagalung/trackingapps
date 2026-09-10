import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const www = path.join(root, 'www');

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function copyIfExists(name) {
  const src = path.join(root, name);
  if (!fs.existsSync(src)) return;
  fs.copyFileSync(src, path.join(www, name));
}

// Capacitor 8 requires webDir to point to a real web asset directory.
// Stage the files needed by the native WebView under ./www.
ensureDir(www);
for (const name of [
  'index.html',
  'gas-bridge.js',
  'rh-native-gps.js',
  'rh-native-media.js',
  'manifest.json',
  'mobile-responsive.css'
]) copyIfExists(name);

function patchAndroid(file){
  if(!fs.existsSync(file)) return;
  let s=fs.readFileSync(file,'utf8');
  const names=['android.permission.ACCESS_FINE_LOCATION','android.permission.ACCESS_COARSE_LOCATION','android.permission.FOREGROUND_SERVICE','android.permission.FOREGROUND_SERVICE_LOCATION','android.permission.POST_NOTIFICATIONS','android.permission.CAMERA'];
  const missing=names.filter(n=>!s.includes(n)).map(n=>`    <uses-permission android:name="${n}" />`).join('\n');
  if(missing)s=s.replace(/<application\b/,missing+'\n\n  <application');
  fs.writeFileSync(file,s);
}
patchAndroid(path.join(root,'android/app/src/main/AndroidManifest.xml'));
const strings=path.join(root,'android/app/src/main/res/values/strings.xml');
if(fs.existsSync(strings)){
  let s=fs.readFileSync(strings,'utf8');
  const additions='\n    <string name="capacitor_background_geolocation_notification_channel_name">RH Habits Tracking</string>\n    <string name="capacitor_background_geolocation_notification_icon">ic_launcher</string>\n';
  if(!s.includes('capacitor_background_geolocation_notification_channel_name'))s=s.replace('</resources>',additions+'</resources>');
  fs.writeFileSync(strings,s);
}
const plist=path.join(root,'ios/App/App/Info.plist');
if(fs.existsSync(plist)){
  let s=fs.readFileSync(plist,'utf8'); const inserts=[];
  if(!s.includes('<key>NSLocationWhenInUseUsageDescription</key>')) inserts.push('\n\t<key>NSLocationWhenInUseUsageDescription</key>\n\t<string>RH Habits menggunakan lokasi saat Trip Tracking aktif untuk menghitung jarak, kecepatan, dan rute perjalanan.</string>');
  if(!s.includes('<key>NSLocationAlwaysAndWhenInUseUsageDescription</key>')) inserts.push('\n\t<key>NSLocationAlwaysAndWhenInUseUsageDescription</key>\n\t<string>RH Habits menggunakan lokasi saat Trip Tracking aktif, termasuk ketika layar dikunci, untuk merekam perjalanan.</string>');
  if(!s.includes('<key>NSCameraUsageDescription</key>')) inserts.push('\n\t<key>NSCameraUsageDescription</key>\n\t<string>RH Habits membutuhkan akses kamera saat kamu memilih Ambil Foto untuk membaca struk.</string>');
  if(!s.includes('<key>NSPhotoLibraryUsageDescription</key>')) inserts.push('\n\t<key>NSPhotoLibraryUsageDescription</key>\n\t<string>RH Habits membutuhkan akses foto saat kamu memilih gambar struk dari galeri.</string>');
  if(!s.includes('<key>UIBackgroundModes</key>')) inserts.push('\n\t<key>UIBackgroundModes</key>\n\t<array>\n\t\t<string>location</string>\n\t</array>');
  if(inserts.length)s=s.replace('</dict>',inserts.join('')+'\n</dict>');
  fs.writeFileSync(plist,s);
}
console.log('[RH] Native web assets staged in ./www and native permissions prepared.');
console.log('[RH] Review Xcode Background Modes > Location updates before release.');
