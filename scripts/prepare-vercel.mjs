import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const repair = path.join(root, 'scripts', 'repair-index.mjs');
const index = path.join(root, 'index.html');
const out = path.join(root, 'public');

if (!fs.existsSync(repair)) throw new Error('[RH] repair-index.mjs tidak ditemukan.');
if (!fs.existsSync(index)) throw new Error('[RH] index.html tidak ditemukan.');

const r = spawnSync(process.execPath, [repair, index], { stdio: 'inherit' });
if (r.status !== 0) throw new Error('[RH] Validasi/perbaikan index.html gagal.');

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });

// Static web assets used by the browser/PWA. API functions stay under /api.
for (const name of [
  'index.html',
  'gas-bridge.js',
  'rh-native-gps.js',
  'rh-native-media.js',
  'manifest.json',
  'sw.js'
]) {
  const src = path.join(root, name);
  if (!fs.existsSync(src)) throw new Error(`[RH] Asset wajib tidak ditemukan: ${name}`);
  fs.copyFileSync(src, path.join(out, name));
}

console.log('[RH] Vercel static output prepared in ./public');
