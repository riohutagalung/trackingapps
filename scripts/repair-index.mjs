import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const file = path.resolve(process.argv[2] || 'index.html');
if (!fs.existsSync(file)) throw new Error(`[RH] index file not found: ${file}`);

let html = fs.readFileSync(file, 'utf8');
const before = html;

// Narrow repairs for the known source corruption only.
// These replacements do not alter application logic; they only restore
// valid JavaScript punctuation and the correct PWA manifest URL for Vercel.
html = html.replace(/\},\,/g, '},');
html = html.replace(/\n  \}\n  renderPublicTransport\(/g, '\n  },\n  renderPublicTransport(');
html = html.replace(/\n  \}\n  renderFuelPrediction\(/g, '\n  },\n  renderFuelPrediction(');
html = html.replace(/\n  \}\,\,\n/g, '\n  },\n');
html = html.replace(/<link\s+rel=["']manifest["']\s+href=["']\?manifest=1["']\s*\/?>/i,
  '<link rel="manifest" href="/manifest.json">');

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
