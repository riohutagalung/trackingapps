/**
 * RH Habits V13 — Vercel Serverless RPC proxy
 * CommonJS on purpose: works in a default Vercel Node.js function without
 * requiring package.json { "type": "module" }.
 */
const GAS_WEB_APP_URL = process.env.GAS_WEB_APP_URL ||
  'https://script.google.com/macros/s/AKfycbwttZKVunZZwNPl782piugygn3JESN6wHQK8c5D2Pi6NE3kLJp57UbCdgfQush6Ql6lig/exec';

function json(res, status, body) {
  res.status(status);
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('X-RH-Backend', 'Vercel->AppsScript');
  return res.end(JSON.stringify(body));
}

function parseArgs(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    return [];
  }
}

async function callGas(fn, args, method) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25000);
  try {
    let url = GAS_WEB_APP_URL;
    const options = {
      redirect: 'follow',
      signal: controller.signal,
      headers: { 'Accept': 'application/json' }
    };

    if (method === 'GET') {
      url += (url.includes('?') ? '&' : '?') +
        'fn=' + encodeURIComponent(fn) +
        '&args=' + encodeURIComponent(JSON.stringify(args || []));
      options.method = 'GET';
    } else {
      options.method = 'POST';
      options.headers['Content-Type'] = 'application/json;charset=utf-8';
      options.body = JSON.stringify({ fn, args: Array.isArray(args) ? args : [] });
    }

    const upstream = await fetch(url, options);
    const text = await upstream.text();
    let payload;
    try {
      payload = text ? JSON.parse(text) : null;
    } catch (e) {
      const preview = String(text || '').replace(/\s+/g, ' ').slice(0, 300);
      throw new Error('Apps Script mengembalikan bukan JSON (HTTP ' + upstream.status + '). ' + preview);
    }
    if (!upstream.ok) {
      throw new Error((payload && payload.error) || ('Apps Script HTTP ' + upstream.status));
    }
    return payload;
  } finally {
    clearTimeout(timer);
  }
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept');
  if (req.method === 'OPTIONS') return json(res, 204, {});
  try {
    if (req.method === 'GET') {
      const fn = String((req.query && req.query.fn) || 'ping');
      const args = parseArgs(req.query && req.query.args);
      const result = await callGas(fn, args, 'GET');
      return json(res, 200, result);
    }

    if (req.method !== 'POST') {
      return json(res, 405, { ok: false, error: 'Method tidak diizinkan.' });
    }

    let body = req.body || {};
    if (typeof body === 'string') {
      try { body = JSON.parse(body || '{}'); } catch (_) { body = {}; }
    }
    const fn = String(body.fn || '').trim();
    if (!fn) return json(res, 400, { ok: false, error: 'Field fn wajib ada.' });

    // GET is preferred because Apps Script Content Service explicitly documents
    // redirecting responses to a one-time googleusercontent URL. For large
    // payloads (OCR images, GPS arrays), POST is still required.
    const result = await callGas(fn, Array.isArray(body.args) ? body.args : [], 'POST');
    return json(res, 200, result);
  } catch (err) {
    const msg = err && err.name === 'AbortError'
      ? 'Apps Script timeout setelah 25 detik.'
      : ((err && err.message) || String(err));
    return json(res, 502, { ok: false, error: 'Proxy RH → Apps Script gagal: ' + msg });
  }
};
