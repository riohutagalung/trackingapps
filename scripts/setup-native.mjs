import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const www = path.join(root, 'www');

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function copyIfExists(src, dest) {
  if (!fs.existsSync(src)) {
    console.warn(`[RH] Skip: ${src}`);
    return false;
  }

  ensureDir(path.dirname(dest));
  fs.copyFileSync(src, dest);
  console.log(`[RH] Copied: ${path.relative(root, src)} -> ${path.relative(root, dest)}`);
  return true;
}

/*
 * ============================================================
 * 1. PREPARE WEB ASSETS FOR CAPACITOR
 * ============================================================
 *
 * Capacitor 8 tidak menerima "." sebagai webDir.
 * Kita gunakan ./www sebagai native web bundle.
 */

ensureDir(www);

const webFiles = [
  'index.html',
  'gas-bridge.js',
  'rh-native-gps.js',
  'rh-native-media.js',
  'manifest.json',
  'mobile-responsive.css'
];

for (const file of webFiles) {
  copyIfExists(
    path.join(root, file),
    path.join(www, file)
  );
}

/*
 * Kalau index.html adalah file utama, wajib ada.
 */
if (!fs.existsSync(path.join(www, 'index.html'))) {
  throw new Error(
    '[RH] index.html tidak ditemukan. Pastikan index.html ada di root repository.'
  );
}

/*
 * ============================================================
 * 2. ANDROID PERMISSIONS
 * ============================================================
 */

const androidManifest = path.join(
  root,
  'android',
  'app',
  'src',
  'main',
  'AndroidManifest.xml'
);

if (fs.existsSync(androidManifest)) {
  let s = fs.readFileSync(androidManifest, 'utf8');

  const permissions = [
    'android.permission.ACCESS_FINE_LOCATION',
    'android.permission.ACCESS_COARSE_LOCATION',
    'android.permission.FOREGROUND_SERVICE',
    'android.permission.FOREGROUND_SERVICE_LOCATION',
    'android.permission.POST_NOTIFICATIONS',
    'android.permission.CAMERA'
  ];

  const missing = permissions
    .filter(p => !s.includes(p))
    .map(
      p => `    <uses-permission android:name="${p}" />`
    );

  if (missing.length) {
    s = s.replace(
      /<application\b/,
      `${missing.join('\n')}\n\n  <application`
    );

    fs.writeFileSync(androidManifest, s);
    console.log('[RH] Android permissions updated.');
  } else {
    console.log('[RH] Android permissions already OK.');
  }
}

/*
 * ============================================================
 * 3. ANDROID BACKGROUND GPS NOTIFICATION
 * ============================================================
 */

const stringsFile = path.join(
  root,
  'android',
  'app',
  'src',
  'main',
  'res',
  'values',
  'strings.xml'
);

if (fs.existsSync(stringsFile)) {
  let s = fs.readFileSync(stringsFile, 'utf8');

  const additions = `
    <string name="capacitor_background_geolocation_notification_channel_name">RH Habits Tracking</string>
    <string name="capacitor_background_geolocation_notification_icon">ic_launcher</string>
`;

  if (
    !s.includes(
      'capacitor_background_geolocation_notification_channel_name'
    )
  ) {
    s = s.replace('</resources>', `${additions}</resources>`);
    fs.writeFileSync(stringsFile, s);
    console.log('[RH] Android GPS notification strings added.');
  }
}

/*
 * ============================================================
 * 4. iOS PERMISSIONS
 * ============================================================
 */

const plist = path.join(
  root,
  'ios',
  'App',
  'App',
  'Info.plist'
);

if (fs.existsSync(plist)) {
  let s = fs.readFileSync(plist, 'utf8');

  const inserts = [];

  if (!s.includes('<key>NSLocationWhenInUseUsageDescription</key>')) {
    inserts.push(`
    <key>NSLocationWhenInUseUsageDescription</key>
    <string>RH Habits menggunakan lokasi saat Trip Tracking aktif untuk menghitung jarak, kecepatan, dan rute perjalanan.</string>
`);
  }

  if (
    !s.includes(
      '<key>NSLocationAlwaysAndWhenInUseUsageDescription</key>'
    )
  ) {
    inserts.push(`
    <key>NSLocationAlwaysAndWhenInUseUsageDescription</key>
    <string>RH Habits menggunakan lokasi saat Trip Tracking aktif, termasuk ketika layar dikunci, untuk merekam perjalanan.</string>
`);
  }

  if (!s.includes('<key>NSCameraUsageDescription</key>')) {
    inserts.push(`
    <key>NSCameraUsageDescription</key>
    <string>RH Habits membutuhkan akses kamera saat kamu memilih Ambil Foto untuk membaca struk.</string>
`);
  }

  if (!s.includes('<key>NSPhotoLibraryUsageDescription</key>')) {
    inserts.push(`
    <key>NSPhotoLibraryUsageDescription</key>
    <string>RH Habits membutuhkan akses foto saat kamu memilih gambar struk dari galeri.</string>
`);
  }

  if (!s.includes('<key>UIBackgroundModes</key>')) {
    inserts.push(`
    <key>UIBackgroundModes</key>
    <array>
      <string>location</string>
    </array>
`);
  }

  if (inserts.length) {
    s = s.replace(
      '</dict>',
      `${inserts.join('')}\n</dict>`
    );

    fs.writeFileSync(plist, s);
    console.log('[RH] iOS permissions updated.');
  }
}

/*
 * ============================================================
 * 5. FINAL CHECK
 * ============================================================
 */

const requiredWebFiles = [
  'index.html',
  'gas-bridge.js',
  'rh-native-gps.js',
  'rh-native-media.js'
];

const missingWeb = requiredWebFiles.filter(
  file => !fs.existsSync(path.join(www, file))
);

if (missingWeb.length) {
  console.warn(
    `[RH] WARNING: web assets missing: ${missingWeb.join(', ')}`
  );
}

console.log('');
console.log('[RH] Native preparation complete.');
console.log(`[RH] Web assets directory: ${path.relative(root, www)}`);

if (fs.existsSync(path.join(root, 'ios'))) {
  console.log(
    '[RH] iOS detected. Review Xcode Background Modes > Location updates.'
  );
}

if (fs.existsSync(path.join(root, 'android'))) {
  console.log('[RH] Android detected.');
}