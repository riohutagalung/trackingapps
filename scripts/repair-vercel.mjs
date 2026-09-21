import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';

const file = path.resolve(process.argv[2] || 'index.html');
if (!fs.existsSync(file)) throw new Error('[RH] index.html tidak ditemukan: ' + file);

const html = fs.readFileSync(file, 'utf8');

// Build/native validation only.
// The source is now canonical; do not mutate business/UI logic during deployment.
const scriptRe = /<script(?:[^>]*)>([\\s\\S]*?)<\\/script>/gi;
let match;
let count = 0;

while ((match = scriptRe.exec(html))) {
  const code = match[1];
  if (!code.trim()) {
    count++;
    continue;
  }

  const tmp = path.join(os.tmpdir(), 'rh-index-' + process.pid + '-' + count + '.js');
  fs.writeFileSync(tmp, code);

  const result = spawnSync(process.execPath, ['--check', tmp], {
    encoding: 'utf8'
  });

  try { fs.unlinkSync(tmp); } catch (_) {}

  if (result.status !== 0) {
    throw new Error(
      '[RH] index.html inline script #' + count + ' invalid:\\n' +
      (result.stderr || result.stdout || 'Unknown syntax error')
    );
  }

  count++;
}

const required = [
  ['App', /\\bconst\\s+App\\s*=/],
  ['GPS', /\\bconst\\s+GPS\\s*=/],
  ['Weather', /\\bconst\\s+Weather\\s*=/],
  ['RPC bridge', /gas-bridge\\.js/],
  ['Manifest', /<link\\s+rel=["']manifest["']/i]
];

for (const [name, pattern] of required) {
  if (!pattern.test(html)) {
    throw new Error('[RH] Required ' + name + ' module/reference missing from index.html.');
  }
}

if (html.includes('href="?manifest=1"')) {
  throw new Error('[RH] index.html masih memakai manifest Apps Script ?manifest=1. Vercel harus memakai /manifest.json.');
}

if (html.includes('\\n  }\\n  renderPublicTransport(') ||
    html.includes('\\n  }\\n  renderFuelPrediction(') ||
    html.includes('},,')) {
  throw new Error('[RH] index.html masih mengandung punctuation corruption pada App/Trip.');
}

console.log('[RH] index.html validation OK (' + count + ' script blocks checked).');