import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';

/**
 * RH Habits Vercel/native source validator.
 *
 * IMPORTANT:
 * This script is intentionally READ-ONLY with respect to index.html.
 * It must never rewrite business logic during a deployment.
 * The source in GitHub is the canonical application source.
 */

const file = path.resolve(process.argv[2] || 'index.html');

if (!fs.existsSync(file)) {
  throw new Error('[RH] index.html not found: ' + file);
}

const html = fs.readFileSync(file, 'utf8');

if (!/<link\s+rel=["']manifest["']\s+href=["']\/manifest\.json["']\s*\/?>/i.test(html)) {
  throw new Error('[RH] index.html manifest link must point to /manifest.json');
}

if (!/gas-bridge\.js\?v=20260921/.test(html)) {
  throw new Error('[RH] index.html must load the cache-busted gas-bridge.js?v=20260921');
}

if (!/\bconst\s+App\s*=/.test(html)) {
  throw new Error('[RH] App module missing from index.html.');
}

if (!/\bconst\s+GPS\s*=/.test(html)) {
  throw new Error('[RH] GPS module missing from index.html.');
}

if (!/\bconst\s+Weather\s*=/.test(html) && !/\bwindow\.Weather\s*=/.test(html)) {
  throw new Error('[RH] Weather module missing from index.html.');
}

// Validate every inline JavaScript block. External JS files are validated
// separately by Node --check in the same build step below.
const scriptRe = /<script(?:[^>]*)>([\s\S]*?)<\/script>/gi;
let match;
let count = 0;

while ((match = scriptRe.exec(html))) {
  const code = match[1];
  const tmp = path.join(os.tmpdir(), 'rh-index-' + process.pid + '-' + count + '.js');

  try {
    fs.writeFileSync(tmp, code, 'utf8');
    const result = spawnSync(process.execPath, ['--check', tmp], { encoding: 'utf8' });

    if (result.status !== 0) {
      throw new Error(
        '[RH] inline script #' + count + ' invalid:\n' +
        (result.stderr || result.stdout || 'unknown syntax error')
      );
    }
  } finally {
    try { fs.unlinkSync(tmp); } catch (_) {}
  }

  count++;
}

for (const relative of ['gas-bridge.js', 'rh-native-gps.js', 'rh-native-media.js']) {
  const jsFile = path.join(path.dirname(file), relative);
  if (!fs.existsSync(jsFile)) {
    throw new Error('[RH] required JS asset missing: ' + relative);
  }

  const result = spawnSync(process.execPath, ['--check', jsFile], { encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(
      '[RH] ' + relative + ' syntax invalid:\n' +
      (result.stderr || result.stdout || 'unknown syntax error')
    );
  }
}

console.log('[RH] index.html + native web assets validated: ' + count + ' inline script blocks.');
