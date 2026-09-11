import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const www = path.join(root, 'www');

// www is a generated Capacitor asset folder. Always rebuild it from root
// so native builds can never run stale HTML/JS copies.
fs.rmSync(www, { recursive: true, force: true });
fs.mkdirSync(www, { recursive: true });

function copyRequired(name) {
  const src = path.join(root, name);
  const dst = path.join(www, name);
  if (!fs.existsSync(src)) throw new Error(`[RH] Required web asset missing: ${name}`);
  fs.copyFileSync(src, dst);
}

for (const name of [
  'index.html',
  'gas-bridge.js',
  'rh-native-gps.js',
  'rh-native-media.js'
]) copyRequired(name);

for (const name of ['manifest.json', 'mobile-responsive.css']) {
  const src = path.join(root, name);
  if (fs.existsSync(src)) fs.copyFileSync(src, path.join(www, name));
}

const androidManifest = path.join(root, 'android/app/src/main/AndroidManifest.xml');
if (fs.existsSync(androidManifest)) {
  let s = fs.readFileSync(androidManifest, 'utf8');
  const permissions = [
    'android.permission.INTERNET',
    'android.permission.ACCESS_FINE_LOCATION',
    'android.permission.ACCESS_COARSE_LOCATION',
    'android.permission.FOREGROUND_SERVICE',
    'android.permission.FOREGROUND_SERVICE_LOCATION',
    'android.permission.POST_NOTIFICATIONS',
    'android.permission.CAMERA'
  ];
  const missing = permissions.filter(p => !s.includes(p));
  if (missing.length) {
    const lines = missing.map(p => `    <uses-permission android:name="${p}" />`).join('\n');
    s = s.replace(/<application\b/, `${lines}\n\n    <application`);
    fs.writeFileSync(androidManifest, s);
  }
}

const strings = path.join(root, 'android/app/src/main/res/values/strings.xml');
if (fs.existsSync(strings)) {
  let s = fs.readFileSync(strings, 'utf8');
  const additions = [
    '<string name="capacitor_background_geolocation_notification_channel_name">RH Habits Tracking</string>',
    '<string name="capacitor_background_geolocation_notification_icon">ic_launcher</string>'
  ];
  for (const line of additions) {
    if (!s.includes(line)) s = s.replace('</resources>', `    ${line}\n</resources>`);
  }
  fs.writeFileSync(strings, s);
}

const plist = path.join(root, 'ios/App/App/Info.plist');
if (fs.existsSync(plist)) {
  let s = fs.readFileSync(plist, 'utf8');
  const additions = [
    ['NSLocationWhenInUseUsageDescription', '<string>RH Habits menggunakan lokasi saat Trip Tracking aktif untuk menghitung jarak, kecepatan, dan rute perjalanan.</string>'],
    ['NSLocationAlwaysAndWhenInUseUsageDescription', '<string>RH Habits menggunakan lokasi saat Trip Tracking aktif, termasuk ketika layar dikunci, untuk merekam perjalanan.</string>'],
    ['NSCameraUsageDescription', '<string>RH Habits membutuhkan akses kamera saat mengambil foto struk.</string>'],
    ['NSPhotoLibraryUsageDescription', '<string>RH Habits membutuhkan akses foto saat memilih struk dari galeri.</string>'],
    ['NSPhotoLibraryAddUsageDescription', '<string>RH Habits membutuhkan izin tambahan foto untuk Camera API.</string>']
  ];
  const insert = [];
  for (const [key, value] of additions) {
    if (!s.includes(`<key>${key}</key>`)) insert.push(`\t<key>${key}</key>\n\t${value}`);
  }
  if (!s.includes('<key>UIBackgroundModes</key>')) {
    insert.push('\t<key>UIBackgroundModes</key>\n\t<array>\n\t\t<string>location</string>\n\t</array>');
  }
  if (insert.length) s = s.replace('</dict>', `${insert.join('\n')}\n</dict>`);
  fs.writeFileSync(plist, s);
}

console.log('[RH] Native assets rebuilt from root into ./www');
