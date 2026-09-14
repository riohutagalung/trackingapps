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

// The current Trip UI calls this.tripSparkline(), but one source revision lost
// the helper. Restore the original lightweight SVG route preview during build.
if (!/\btripSparkline\s*\(points\)/.test(html)) {
  const sparkline = `\n  tripSparkline(points){\n    if(!points||points.length<2)return '';\n    const xs=points.map(p=>Number(p.lng)||0), ys=points.map(p=>Number(p.lat)||0);\n    const minX=Math.min(...xs), maxX=Math.max(...xs), minY=Math.min(...ys), maxY=Math.max(...ys);\n    const sx=x=>maxX===minX?50:8+84*(x-minX)/(maxX-minX);\n    const sy=y=>maxY===minY?40:70-54*(y-minY)/(maxY-minY);\n    const step=Math.max(1,Math.ceil(points.length/160));\n    const sample=points.filter((_,i)=>i%step===0);\n    const poly=sample.map(p=>\`${'${'}sx(Number(p.lng)||0).toFixed(1)${'}'},\${'${'}sy(Number(p.lat)||0).toFixed(1)${'}'}\`).join(' ');\n    return \`<svg class="trip-route-svg" viewBox="0 0 100 78" preserveAspectRatio="none"><polyline points="\${poly}" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/><circle cx="\${sx(xs[0]).toFixed(1)}" cy="\${sy(ys[0]).toFixed(1)}" r="3" fill="currentColor"/><circle cx="\${sx(xs[xs.length-1]).toFixed(1)}" cy="\${sy(ys[ys.length-1]).toFixed(1)}" r="3" fill="currentColor"/></svg>\`;\n  },\n`;
  html = html.replace(/\n  renderTrend\(arr, changePct\) \{/, sparkline + '  renderTrend(arr, changePct) {');
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