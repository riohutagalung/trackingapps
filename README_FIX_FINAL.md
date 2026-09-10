RH HABITS — FINAL CROSS-DEVICE FIX

Replace in GitHub:
- index.html
- Code.gs
- rh-native-gps.js
- rh-native-media.js
- api/native-location.js
- vercel.json
- package.json
- scripts/setup-native.mjs

Apps Script:
- Replace Code.gs with this Code.gs.
- Keep your existing HTML and maps-helper.gs unless maps-helper.gs duplicates functions already present in Code.gs.
- Deploy a NEW version after saving Code.gs.

Important:
The Android screenshot showing "WEB" and GPS not recording means the installed app is not actually using the native Capacitor bridge, OR the native build was not synced after dependency changes. A web/PWA shortcut cannot become a native background-GPS app by changing HTML alone.

Native rebuild:
  npm install
  npx cap sync
  npm run native:prepare
  npx cap open android
  npx cap open ios

For iOS, enable Background Modes > Location updates in Xcode before release.

Cross-device fixes in index.html:
- Same in-app splash UI on web, Android, and iOS.
- Splash hides after bootstrap/timeout instead of remaining indefinitely.
- Header is non-sticky and scrolls with content.
- Device badge detection is more robust.
- Start Trip icon is a single SVG navigation icon on all platforms; Stop uses a single SVG stop icon.
- Native camera/gallery uses Capacitor Camera, with browser file-input fallback.
- Native trip save no longer sends the entire GPS track through the WebView RPC; backend retrieves TripPoints by tripId.
- Browser trip save sends a bounded GPS payload.
- Native media failure falls back to browser picker instead of dead-ending.
- Apps Script native GPS endpoint now uses the CURRENT deployment URL.

Code.gs:
- addTrip() pulls native TripPoints when gpsPoints is empty.
