import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const file = path.resolve(process.argv[2] || 'index.html');
if (!fs.existsSync(file)) throw new Error(`[RH] index file not found: ${file}`);

let html = fs.readFileSync(file, 'utf8');
const before = html;

// Restore only known source corruption; application logic is unchanged.
html = html.replace(/\},\,/g, '},');
html = html.replace(/\n  \}\n  renderPublicTransport\(/g, '\n  },\n  renderPublicTransport(');
html = html.replace(/\n  \}\n  renderFuelPrediction\(/g, '\n  },\n  renderFuelPrediction(');
html = html.replace(/\n  \}\,\,\n/g, '\n  },\n');
html = html.replace(/<link\s+rel=["']manifest["']\s+href=["']\?manifest=1["']\s*\/?>/i,
  '<link rel="manifest" href="/manifest.json">');

// Repair the accidentally corrupted sparkline interpolation without changing the route logic.
html = html.replace(
  /const poly=sample\.map\(p=>`\$\{sx\(Number\(p\.lng\)\)\|\|0\)\.toFixed\(1\),\$\{'\}sy\(Number\(p\.lat\)\|\|0\)\.toFixed\(1\)\$\{'\}\)\.join\(' '\);/,
  "const poly=sample.map(p=>`${sx(Number(p.lng)||0).toFixed(1)},${sy(Number(p.lat)||0).toFixed(1)}`).join(' ');"
);

// The current source must contain the lightweight Weather module used during startup.
if (!/\b(const|let|var)\s+Weather\s*=/.test(html)) {
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
        const txt = x => \`${'${'}x.probability || 0}${'}'}% kemungkinan hujan\${x.precipitation ? \` • \${Num(x.precipitation,1)} mm/jam\` : ''}\`;
        content.innerHTML = \`<div class="route-list"><div class="route-row"><div><div class="route-name">\${Icon('sun',15)} Pagi 07:00</div><div class="route-sub">\${txt(m)}</div></div><div class="eta"><strong>\${Icon(m.caution ? 'rain' : 'sun',16)}</strong></div></div><div class="route-row"><div><div class="route-name">\${Icon('sun',15)} Sore 18:00</div><div class="route-sub">\${txt(e)}</div></div><div class="eta"><strong>\${Icon(e.caution ? 'rain' : 'sun',16)}</strong></div></div></div>\`;
        if (m.caution || e.caution) App.toast('Ada potensi hujan di jam commute.');
      })
      .withFailureHandler(e => { content.textContent = 'Cuaca tidak tersedia.'; })
      .getCommuteWeather();
  }
};
`;
  html = html.replace(/<script>\nconst Icon=/, `<script>${weatherCode}const Icon=`);
}

// Hard fail the build/native preparation if any inline JS remains invalid.
const scriptRe = /<script(?:[^>]*)>([\s\S]*?)<\/script>/gi;
let match;
let i = 0;
while ((match = scriptRe.exec(html))) {
  const code = match[1];
  if (!code.trim()) { i++; continue; }
  const tmp = path.join(os.tmpdir(), `rh-index-${process.pid}-${i}.js`);
  fs.writeFileSync(tmp, code);
  const r = spawnSync(process.execPath, ['--check', tmp], { encoding: 'utf8' });
  try { fs.unlinkSync(tmp); } catch (_) {}
  if (r.status !== 0) {
    throw new Error(`[RH] index.html inline script #${i} still invalid:\n${r.stderr || r.stdout}`);
  }
  i++;
}

// Runtime-safe assertions for known required startup modules.
if (!/\bconst\s+Weather\s*=/.test(html)) throw new Error('[RH] Weather module missing from index.html.');
if (!/\bconst\s+App\s*=/.test(html)) throw new Error('[RH] App module missing from index.html.');
if (!/\bconst\s+GPS\s*=/.test(html)) throw new Error('[RH] GPS module missing from index.html.');

if (html !== before) {
  fs.writeFileSync(file, html);
  console.log('[RH] Repaired known index.html source issues.');
} else {
  console.log('[RH] No known index.html repair was necessary.');
}
console.log(`[RH] index.html syntax OK (${i} script blocks checked).`);
