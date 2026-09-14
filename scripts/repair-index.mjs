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

// The current index source lost its Weather module. Restore the original
// lightweight RPC-backed module during build so Weather.refresh() is always defined.
if (!/\b(const|let|var)\s+Weather\s*=/.test(html)) {
  const weatherCode = `\nconst Weather = {\n  refresh(force) {\n    const box = document.getElementById('weather-banner');\n    const content = document.getElementById('weather-content');\n    if (!box || !content) return;\n    box.classList.add('show');\n    content.textContent = 'Memeriksa prakiraan hujan...';\n    google.script.run\n      .withSuccessHandler(r => {\n        const s = r && r.summary;\n        if (!s) { content.textContent = 'Prakiraan belum tersedia.'; return; }\n        const m = s.morning || {}, e = s.evening || {};\n        const txt = x => \`${'${'}x.probability || 0}${'}'}% kemungkinan hujan\${x.precipitation ? \` • \${Num(x.precipitation,1)} mm/jam\` : ''}\`;\n        content.innerHTML = \`<div class="route-list"><div class="route-row"><div><div class="route-name">\${Icon('sun',15)} Pagi 07:00</div><div class="route-sub">\${txt(m)}</div></div><div class="eta"><strong>\${Icon(m.caution ? 'rain' : 'sun',16)}</strong></div></div><div class="route-row"><div><div class="route-name">\${Icon('sun',15)} Sore 18:00</div><div class="route-sub">\${txt(e)}</div></div><div class="eta"><strong>\${Icon(e.caution ? 'rain' : 'sun',16)}</strong></div></div></div>\`;\n        if (m.caution || e.caution) App.toast('Ada potensi hujan di jam commute.');\n      })\n      .withFailureHandler(e => { content.textContent = 'Cuaca tidak tersedia.'; })\n      .getCommuteWeather();\n  }\n};\n`;
  html = html.replace(/<script>\nconst Icon=/, `<script>${weatherCode}const Icon=`);
}

if (html !== before) {
  fs.writeFileSync(file, html);
  console.log('[RH] Repaired known index.html source issues.');
} else {
  console.log('[RH] No known index.html repair was necessary.');
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
console.log(`[RH] index.html syntax OK (${i} script blocks checked).`);
