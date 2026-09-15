import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';

const file = path.resolve(process.argv[2] || 'index.html');
if (!fs.existsSync(file)) throw new Error('[RH] index.html not found: ' + file);

let html = fs.readFileSync(file, 'utf8');

// Repair only known source-level corruption; do not change business logic.
html = html.replace(/\},\,/g, '},');
html = html.replace(/\n  \}\n  renderPublicTransport\(/g, '\n  },\n  renderPublicTransport(');
html = html.replace(/\n  \}\n  renderFuelPrediction\(/g, '\n  },\n  renderFuelPrediction(');
html = html.replace(/\n  \}\,\,\n/g, '\n  },\n');
html = html.replace(/<link\s+rel=["']manifest["']\s+href=["']\?manifest=1["']\s*\/?>/i, '<link rel="manifest" href="/manifest.json">');

// Native GPS: flush server-side points BEFORE stopping the native provider.
// The native URL delivery is independent of the WebView, so this keeps points
// recorded while the phone is locked available when the user taps Stop.
html = html.replace(
  /if\(wasNative&&window\.RHNativeGPS\)\{try\{await window\.RHNativeGPS\.stop\(\);\}catch\(e\)\{console\.warn\('\[RHGPS\] native stop',e\);\}\s*\}\s*if\(wasNative\)\{\s*\/\/ Do NOT set active=false before fetching; refreshNativePoints intentionally\s*\/\/ works while stopping so iOS can flush the last native location\(s\)\.\s*await this\.waitForNativeFlush\(sid,8000\);\s*\}/,
  "if(wasNative){\n      // Pull points while native tracking is still alive, then stop it.\n      await this.waitForNativeFlush(sid,6500);\n      if(window.RHNativeGPS){try{await window.RHNativeGPS.stop();}catch(e){console.warn('[RHGPS] native stop',e);}}\n    }"
);

// Smooth only the displayed speed; preserve raw provider speed for analytics.
html = html.replace(
  "const point={lat,lng,speed:speedKmh,speedKmh:speedKmh,accuracy:isFinite(accuracy)?accuracy:0,time:ts,bearing:isFinite(bearing)?bearing:null,altitude:isFinite(altitude)?altitude:null,source:isNative?'native':'browser',simulated:!!(isNative&&pos.simulated)};",
  "const point={lat,lng,speed:speedKmh,speedKmh:speedKmh,displaySpeedKmh:speedKmh,accuracy:isFinite(accuracy)?accuracy:0,time:ts,bearing:isFinite(bearing)?bearing:null,altitude:isFinite(altitude)?altitude:null,source:isNative?'native':'browser',simulated:!!(isNative&&pos.simulated)};"
);
html = html.replace(
  "point.speedKmh=speedKmh; point.speed=speedKmh;",
  "point.speedKmh=speedKmh; point.speed=speedKmh; point.displaySpeedKmh=speedKmh;"
);
html = html.replace(
  "this.points.push(point);\n    if(this.points.length%5===0||Date.now()-this.lastPersist>5000)this.persist();",
  "const prevDisplay=prev&&Number(prev.displaySpeedKmh);\n    if(isFinite(prevDisplay)&&speedKmh>0){ point.displaySpeedKmh=Math.max(0,Math.min(220,prevDisplay*0.72+speedKmh*0.28)); }\n    this.points.push(point);\n    if(this.points.length%5===0||Date.now()-this.lastPersist>5000)this.persist();"
);
html = html.replace(
  "document.getElementById('gps-speed').textContent=Num(last?.speedKmh!==undefined?last.speedKmh:(last?.speed||0),1);",
  "document.getElementById('gps-speed').textContent=Num(last?.displaySpeedKmh!==undefined?last.displaySpeedKmh:(last?.speedKmh!==undefined?last.speedKmh:(last?.speed||0)),1);"
);
html = html.replace(
  "document.getElementById('float-speed').textContent=Num(last?.speedKmh!==undefined?last.speedKmh:(last?.speed||0),1);",
  "document.getElementById('float-speed').textContent=Num(last?.displaySpeedKmh!==undefined?last.displaySpeedKmh:(last?.speedKmh!==undefined?last.speedKmh:(last?.speed||0)),1);"
);

// Weather is called by App.init(), so guarantee a runtime module exists.
if (!/\bconst\s+Weather\s*=/.test(html)) {
  const weatherCode = [
    'const Weather = {',
    '  refresh(force) {',
    "    const box = document.getElementById('weather-banner');",
    "    const content = document.getElementById('weather-content');",
    '    if (!box || !content) return;',
    "    box.classList.add('show');",
    "    content.textContent = 'Memeriksa prakiraan hujan...';",
    '    google.script.run',
    '      .withSuccessHandler(r => {',
    '        const s = r && r.summary;',
    "        if (!s) { content.textContent = 'Prakiraan belum tersedia.'; return; }",
    '        const m = s.morning || {};',
    '        const e = s.evening || {};',
    "        const txt = x => String(Number(x.probability || 0)) + '% kemungkinan hujan' + (x.precipitation ? (' • ' + Num(x.precipitation, 1) + ' mm/jam') : '');",
    "        content.innerHTML = '<div class=\"route-list\">' + '<div class=\"route-row\"><div><div class=\"route-name\">' + Icon('sun',15) + ' Pagi 07:00</div><div class=\"route-sub\">' + txt(m) + '</div></div><div class=\"eta\"><strong>' + Icon(m.caution ? 'rain' : 'sun',16) + '</strong></div></div>' + '<div class=\"route-row\"><div><div class=\"route-name\">' + Icon('sun',15) + ' Sore 18:00</div><div class=\"route-sub\">' + txt(e) + '</div></div><div class=\"eta\"><strong>' + Icon(e.caution ? 'rain' : 'sun',16) + '</strong></div></div>' + '</div>';",
    "        if (m.caution || e.caution) App.toast('Ada potensi hujan di jam commute.');",
    '      })',
    "      .withFailureHandler(() => { content.textContent = 'Cuaca tidak tersedia.'; })",
    '      .getCommuteWeather();',
    '  }',
    '};',
    ''
  ].join('\n');
  const marker = /<script[^>]*>\s*const\s+Icon\s*=/i;
  if (marker.test(html)) html = html.replace(marker, '<script>' + weatherCode + 'const Icon=');
  else html = html.replace(/<\/body>/i, '<script>' + weatherCode + '</script>\n</body>');
}

const scriptRe = /<script(?:[^>]*)>([\s\S]*?)<\/script>/gi;
let match;
let count = 0;
while ((match = scriptRe.exec(html))) {
  const code = match[1];
  if (!code.trim()) { count++; continue; }
  const tmp = path.join(os.tmpdir(), 'rh-index-' + process.pid + '-' + count + '.js');
  fs.writeFileSync(tmp, code);
  const result = spawnSync(process.execPath, ['--check', tmp], { encoding: 'utf8' });
  try { fs.unlinkSync(tmp); } catch (_) {}
  if (result.status !== 0) {
    throw new Error('[RH] inline script #' + count + ' invalid:\n' + (result.stderr || result.stdout));
  }
  count++;
}

if (!/\bconst\s+App\s*=/.test(html)) throw new Error('[RH] App module missing from index.html.');
if (!/\bconst\s+GPS\s*=/.test(html)) throw new Error('[RH] GPS module missing from index.html.');
if (!/\bconst\s+Weather\s*=/.test(html)) throw new Error('[RH] Weather module missing from index.html.');

fs.writeFileSync(file, html);
console.log('[RH] index.html validated: ' + count + ' script blocks.');
