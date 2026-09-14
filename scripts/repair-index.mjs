import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const file = path.resolve(process.argv[2] || 'index.html');
if (!fs.existsSync(file)) throw new Error(`[RH] index file not found: ${file}`);

let html = fs.readFileSync(file, 'utf8');
const before = html;

// Repair only known source corruption. Keep application logic intact.
html = html.replace(/\},\,/g, '},');
html = html.replace(/\n  \}\n  renderPublicTransport\(/g, '\n  },\n  renderPublicTransport(');
html = html.replace(/\n  \}\n  renderFuelPrediction\(/g, '\n  },\n  renderFuelPrediction(');
html = html.replace(/\n  \}\,\,\n/g, '\n  },\n');
html = html.replace(/<link\s+rel=["']manifest["']\s+href=["']\?manifest=1["']\s*\/?>/i, '<link rel="manifest" href="/manifest.json">');

// Fix the known broken sparkline interpolation exactly, without touching route logic.
html = html.replace(
  /const poly=sample\.map\(p=>`\$\{sx\(Number\(p\.lng\)\)\|\|0\)\.toFixed\(1\),\$\{['"}]?sy\(Number\(p\.lat\)\|\|0\)\.toFixed\(1\)['"}]?\}\)\.join\(' '\);/,
  "const poly=sample.map(p=>`${sx(Number(p.lng)||0).toFixed(1)},${sy(Number(p.lat)||0).toFixed(1)}`).join(' ');"
);
// Fallback for the literal corrupted blob currently present in older copies.
html = html.replace(
  /const poly=sample\.map\(p=>`\$\{sx\(Number\(p\.lng\)\|\|0\)\.toFixed\(1\),\$\{'\}sy\(Number\(p\.lat\)\|\|0\)\.toFixed\(1\)\$\{'\}\)\.join\(' '\);/g,
  "const poly=sample.map(p=>`${sx(Number(p.lng)||0).toFixed(1)},${sy(Number(p.lat)||0).toFixed(1)}`).join(' ');"
);

// Ensure Weather exists in the actual runtime HTML, not just inside this repair script.
if (!/\bconst\s+Weather\s*=/.test(html)) {
  const weatherCode = `
const Weather = {
  refresh(force) {
    const box = document.getElementById('weather-banner');
    const content = document.getElementById('weather-content');
    if (!box || !content) return;
    box.classList.add('show');
    content.textContent = 'Memeriksa prakiraan hujan...';
    google.script.run
      .withSuccessHandler(r => {
        const s = r && r.summary;
        if (!s) { content.textContent = 'Prakiraan belum tersedia.'; return; }
        const m = s.morning || {}, e = s.evening || {};
        const txt = x => `${'${'}x.probability || 0}% kemungkinan hujan${'}'}${'${'}x.precipitation ? ` • ${'${'}Num(x.precipitation,1)} mm/jam${'}'}` : ''${'}'}`;
        content.innerHTML = `<div class="route-list"><div class="route-row"><div><div class="route-name">${'${'}Icon('sun',15)${'}'} Pagi 07:00</div><div class="route-sub">${'${'}txt(m)${'}'}</div></div><div class="eta"><strong>${'${'}Icon(m.caution ? 'rain' : 'sun',16)${'}'}</strong></div></div><div class="route-row"><div><div class="route-name">${'${'}Icon('sun',15)${'}'} Sore 18:00</div><div class="route-sub">${'${'}txt(e)${'}'}</div></div><div class="eta"><strong>${'${'}Icon(e.caution ? 'rain' : 'sun',16)${'}'}</strong></div></div></div>`;
        if (m.caution || e.caution) App.toast('Ada potensi hujan di jam commute.');
      })
      .withFailureHandler(() => { content.textContent = 'Cuaca tidak tersedia.'; })
      .getCommuteWeather();
  }
};
`;
  const marker = /<script[^>]*>\s*const\s+Icon\s*=/i;
  if (marker.test(html)) html = html.replace(marker, `<script>${weatherCode}const Icon=`);
  else html = html.replace(/<\/body>/i, `<script>${weatherCode}</script>\n</body>`);
}

// Keep exactly one connection indicator on small/touch layouts.
html = html.replace(
  /(@media \(max-width:900px\), \(pointer:coarse\) and \(max-width:1024px\) \{[\s\S]*?)(\n  \.topbar \{)/,
  '$1\n  .topbar .status { display:none; }$2'
);

// Standardize splash screen.
html = html.replace(
  /<div class="rh-splash-title">RH Habits<\/div>\s*<div class="rh-splash-sub">Personal commute & expense tracker<\/div>/,
  '<div class="rh-splash-title">habits</div>'
);
html = html.replace(/\.rh-splash-inner \{[^}]*\}/, '.rh-splash-inner { display:flex; flex-direction:column; align-items:center; justify-content:center; gap:10px; transform:translateY(4px); }');
html = html.replace(/\.rh-splash-title \{[^}]*\}/, '.rh-splash-title { font-family:\'Space Grotesk\',sans-serif; font-size:20px; font-weight:600; letter-spacing:.2px; color:#f5f8fc; text-transform:lowercase; }');
html = html.replace(/\.rh-splash-sub \{[^}]*\}/, '.rh-splash-sub { display:none; }');

// Compact GPS history. UI only.
if (!/__rhTripHistoryPatch/.test(html)) {
  const historyPatch = `
<script id="__rhTripHistoryPatch">
window.addEventListener('load', function () {
  try {
    if (!window.App || typeof App.renderTrips !== 'function') return;
    if (App.__rhTripHistoryPatch) return;
    App.__rhTripHistoryPatch = true;
    var originalRenderTrips = App.renderTrips.bind(App);
    var expanded = false;
    var allTrips = [];
    App.toggleTripHistory = function () { expanded = !expanded; App.renderTrips(allTrips); };
    App.renderTrips = function (arr) {
      allTrips = Array.isArray(arr) ? arr.slice() : [];
      var shown = expanded ? allTrips : allTrips.slice(0, 5);
      originalRenderTrips(shown);
      var box = document.getElementById('trip-history');
      if (!box) return;
      var more = document.getElementById('trip-history-more');
      if (!more) {
        more = document.createElement('button');
        more.id = 'trip-history-more';
        more.className = 'btn small full';
        more.type = 'button';
        more.style.marginTop = '12px';
        box.parentNode.insertBefore(more, box.nextSibling);
      }
      more.style.display = allTrips.length > 5 ? 'block' : 'none';
      more.textContent = expanded ? 'Tampilkan lebih sedikit' : 'Lihat lebih banyak';
      more.setAttribute('aria-expanded', expanded ? 'true' : 'false');
      more.onclick = App.toggleTripHistory;
    };
  } catch (e) { console.warn('[RH] trip history UI patch skipped:', e); }
});
</script>`;
  html = html.replace(/<\/body>/i, historyPatch + '\n</body>');
}

// Validate every inline script before deploy/native preparation.
const scriptRe = /<script(?:[^>]*)>([\s\S]*?)<\/script>/gi;
let match; let i = 0;
while ((match = scriptRe.exec(html))) {
  const code = match[1];
  if (!code.trim()) { i++; continue; }
  const tmp = path.join(os.tmpdir(), `rh-index-${process.pid}-${i}.js`);
  fs.writeFileSync(tmp, code);
  const r = spawnSync(process.execPath, ['--check', tmp], { encoding: 'utf8' });
  try { fs.unlinkSync(tmp); } catch (_) {}
  if (r.status !== 0) throw new Error(`[RH] index.html inline script #${i} still invalid:\n${r.stderr || r.stdout}`);
  i++;
}
if (!/\bconst\s+Weather\s*=/.test(html)) throw new Error('[RH] Weather module missing from index.html.');
if (!/\bconst\s+App\s*=/.test(html)) throw new Error('[RH] App module missing from index.html.');
if (!/\bconst\s+GPS\s*=/.test(html)) throw new Error('[RH] GPS module missing from index.html.');

if (html !== before) { fs.writeFileSync(file, html); console.log('[RH] Repaired known index.html source/UI issues.'); }
else console.log('[RH] No known index.html repair was necessary.');
console.log(`[RH] index.html syntax OK (${i} script blocks checked).`);
