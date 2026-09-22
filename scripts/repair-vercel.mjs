import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';

/**
 * RH Habits Vercel/native source repair + validator.
 *
 * The repairs below are deliberately narrow:
 * - restore commas between known App object methods
 * - remove a known accidental double-comma
 * - make the Vercel PWA manifest link point to /manifest.json
 *
 * No business logic is changed.
 */

const file = path.resolve(process.argv[2] || 'index.html');
const root = path.dirname(file);
const EXPECTED_GAS = 'https://script.google.com/macros/s/AKfycbyHREf-8F0Dd8G7hXtw_cyQskLkCzmkATDmOeBBovQWe9SeRw49ZIGxIzdSNTvScfn5qg/exec';
const OBSOLETE_GAS = 'https://script.google.com/macros/s/AKfycbyi6yqLiKwjpoy9TclZycH6KOPi0GXlPHc7iHGAA5srKCV6TVWOlSyTr-1V-JOiwlr2MQ/exec';

if (!fs.existsSync(file)) {
  throw new Error('[RH] index.html not found: ' + file);
}

let html = fs.readFileSync(file, 'utf8');
const before = html;

// Known source corruption found in the current index.html.
html = html.replace(/\},\,/g, '},');
html = html.replace(/\n  \}\n  renderPublicTransport\(/g, '\n  },\n  renderPublicTransport(');
html = html.replace(/\n  \}\n  renderFuelPrediction\(/g, '\n  },\n  renderFuelPrediction(');
html = html.replace(/\n  \}\,\,\n/g, '\n  },\n');
html = html.replace(
  /<link\s+rel=["']manifest["']\s+href=["']\?manifest=1["']\s*\/?>/i,
  '<link rel="manifest" href="/manifest.json">'
);

if (html !== before) {
  fs.writeFileSync(file, html, 'utf8');
  console.log('[RH] Repaired known index.html source issues.');
} else {
  console.log('[RH] No known index.html repair was necessary.');
}

const manifestOk = /<link\s+rel=["']manifest["']\s+href=["']\/manifest\.json["']\s*\/?>/i.test(html);
if (!manifestOk) {
  throw new Error('[RH] index.html manifest link must point to /manifest.json');
}

const REQUIRED_BRIDGE_VERSION = '20260922-r8';
if (!html.includes('gas-bridge.js?v=' + REQUIRED_BRIDGE_VERSION)) {
  throw new Error('[RH] index.html must load gas-bridge.js?v=' + REQUIRED_BRIDGE_VERSION);
}

for (const relative of ['api/rpc.js', 'api/native-location.js', 'api/health.js']) {
  const backendFile = path.join(root, relative);
  if (!fs.existsSync(backendFile)) throw new Error('[RH] required backend file missing: ' + relative);
  const backendSource = fs.readFileSync(backendFile, 'utf8');
  if (!backendSource.includes(EXPECTED_GAS)) {
    throw new Error('[RH] ' + relative + ' is not pinned to the production Apps Script deployment.');
  }
  if (backendSource.includes(OBSOLETE_GAS)) {
    throw new Error('[RH] ' + relative + ' still contains the obsolete Apps Script deployment.');
  }
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

// Validate every inline JavaScript block.
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
