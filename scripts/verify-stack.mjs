import process from 'node:process';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';

const execFileAsync = promisify(execFile);

const VERCEL = String(
  process.env.RH_VERIFY_URL ||
  process.env.VERCEL_BRANCH_URL ||
  'https://rhhabits.vercel.app'
).replace(/\/$/, '');

const EXPECTED_BRIDGE = String(process.env.RH_EXPECT_BRIDGE || '20260922-r8');
const GAS = 'https://script.google.com/macros/s/AKfycbyHREf-8F0Dd8G7hXtw_cyQskLkCzmkATDmOeBBovQWe9SeRw49ZIGxIzdSNTvScfn5qg/exec';
const OLD_GAS = 'https://script.google.com/macros/s/AKfycbyi6yqLiKwjpoy9TclZycH6KOPi0GXlPHc7iHGAA5srKCV6TVWOlSyTr-1V-JOiwlr2MQ/exec';

const CLI_MODE = String(process.env.RH_USE_VERCEL_CLI || 'auto').toLowerCase();
const VERCEL_SCOPE = String(process.env.RH_VERCEL_SCOPE || 'rio-hutagalungs-projects');

function isVercelUrl(url) {
  try {
    return new URL(url).hostname.endsWith('.vercel.app');
  } catch {
    return false;
  }
}

const USE_VERCEL_CLI =
  CLI_MODE !== '0' &&
  (CLI_MODE === '1' || (isVercelUrl(VERCEL) && !new URL(VERCEL).hostname.startsWith('rhhabits.vercel.app')));

async function listLatestReadyPreview() {
  const { stdout, stderr } = await execFileAsync(
    'npx',
    ['--yes', 'vercel@59.25.0', 'ls', '--scope', VERCEL_SCOPE],
    { maxBuffer: 2 * 1024 * 1024 }
  );

  const lines = (String(stdout || '') + '\n' + String(stderr || '')).split(/\r?\n/);

  for (const line of lines) {
    if (!/\bReady\s+Preview\b/.test(line)) continue;
    const match = line.match(/https:\/\/trackingapps-[^\s]+\.vercel\.app/);
    if (match) return match[0];
  }

  throw new Error('Tidak menemukan deployment Preview trackingapps berstatus Ready dari vercel ls.');
}

async function requestWithVercelCli(label, url, options = {}) {
  const args = ['--yes', 'vercel@59.25.0', 'curl', url];

  if (options.method && options.method !== 'GET') {
    args.push('-X', options.method);
  }

  for (const [key, value] of Object.entries(options.headers || {})) {
    args.push('-H', `${key}: ${value}`);
  }

  if (options.body) {
    args.push('-d', options.body);
  }

  const { stdout, stderr } = await execFileAsync(
    'npx',
    args,
    { maxBuffer: 10 * 1024 * 1024 }
  );

  const text = String(stdout || '');
  const err = String(stderr || '');
  const combined = (text + '\n' + err).trim();

  if (/DEPLOYMENT_NOT_FOUND|deployment could not be found on Vercel/i.test(combined)) {
    throw new Error('DEPLOYMENT_NOT_FOUND');
  }

  if (/\bHTTP\s+(4\d\d|5\d\d)\b/i.test(combined)) {
    console.log(`\n[${label}] Vercel CLI response indicates HTTP failure ${url}`);
    console.log(combined.slice(0, 5000));
    throw new Error(label + ' failed via Vercel CLI.');
  }

  console.log(`\n[${label}] Vercel CLI OK ${url}`);
  if (err.trim()) console.log(err.trim().slice(0, 1000));
  console.log(text.slice(0, 5000));

  return {
    r: { status: 200, ok: true, url },
    text,
    json: null
  };
}

async function request(label, url, options = {}, retryPreview = true) {
  let useVercelCli = USE_VERCEL_CLI;
  try {
    useVercelCli = useVercelCli && new URL(url).hostname.endsWith('.vercel.app');
  } catch {
    useVercelCli = false;
  }

  if (useVercelCli) {
    try {
      return await requestWithVercelCli(label, url, options);
    } catch (error) {
      if (retryPreview && String(error.message) === 'DEPLOYMENT_NOT_FOUND') {
        const latest = await listLatestReadyPreview();
        const original = new URL(url);
        const replacement = new URL(latest);
        replacement.search = original.search;

        if (replacement.origin !== original.origin) {
          console.log(`\n[RH] Preview lama tidak ditemukan. Beralih ke Preview Ready terbaru: ${replacement.origin}`);
          return request(label, replacement.toString(), options, false);
        }
      }
      throw error;
    }
  }

  const r = await fetch(url, {
    redirect: 'follow',
    cache: 'no-store',
    ...options
  });

  const text = await r.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {}

  console.log('\n[' + label + '] HTTP ' + r.status + ' ' + r.url);
  console.log(json ? JSON.stringify(json, null, 2) : text.slice(0, 500));

  if (!r.ok) {
    throw new Error(label + ' failed: HTTP ' + r.status);
  }

  return { r, text, json };
}

const page = await request('Vercel HTML', VERCEL + '/?verify=20260922');
const LIVE_VERCEL = (() => {
  try { return new URL(page.r?.url || VERCEL).origin; }
  catch { return VERCEL; }
})();

if (page.text.includes(OLD_GAS)) {
  throw new Error('Live HTML masih mengandung Apps Script deployment lama.');
}

if (!page.text.includes('<link rel="manifest" href="/manifest.json">')) {
  throw new Error('Live index masih memakai manifest URL lama.');
}

if (!page.text.includes('gas-bridge.js?v=' + EXPECTED_BRIDGE)) {
  throw new Error('Target belum memakai RPC bridge ' + EXPECTED_BRIDGE + '.');
}

if (!page.text.includes('renderPublicTransport(p)')) {
  throw new Error('Live index belum memuat App.renderPublicTransport.');
}

await request('Vercel health', LIVE_VERCEL + '/api/health');
await request('Vercel GAS health', LIVE_VERCEL + '/api/health?probe=gas');
await request('Manifest', LIVE_VERCEL + '/manifest.json');
await request('Apps Script GET ping', GAS + '?fn=ping&args=' + encodeURIComponent('[]'));
await request(
  'Apps Script GET getTripMapsUrl',
  GAS + '?fn=getTripMapsUrl&args=' + encodeURIComponent(JSON.stringify([[],'A','B']))
);
await request('Vercel RPC GET ping', LIVE_VERCEL + '/api/rpc?fn=ping&args=' + encodeURIComponent('[]'));
await request(
  'Vercel RPC POST ping',
  LIVE_VERCEL + '/api/rpc',
  {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body: JSON.stringify({ fn: 'ping', args: [] })
  }
);
await request(
  'Vercel RPC POST getTripMapsUrl',
  LIVE_VERCEL + '/api/rpc',
  {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body: JSON.stringify({ fn: 'getTripMapsUrl', args: [[], 'A', 'B'] })
  }
);
await request(
  'Vercel RPC POST getBootstrap',
  LIVE_VERCEL + '/api/rpc',
  {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body: JSON.stringify({ fn: 'getBootstrap', args: [] })
  }
);
await request('Vercel native-location GET', LIVE_VERCEL + '/api/native-location');

console.log('\n[RH] verify-stack finished OK');
