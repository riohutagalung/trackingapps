/**
 * RH Habits — Vercel -> Google Apps Script RPC proxy
 * CHANGE: Canonical backend URL is the Apps Script URL supplied for RH Habits.
 * Prefer Vercel Environment Variable GAS_WEB_APP_URL so the URL can be rotated
 * without changing source. No browser-to-Apps-Script CORS dependency.
 */
'use strict';

const DEFAULT_GAS_WEB_APP_URL =
  'https://script.google.com/macros/s/AKfycbxahLvhLXHepKDQravov_fs4PyvqDOxp3at_5iyuUK3Rs1PlN5bErFXNLZaq3PW4IngnA/exec';

function getGasUrl() {
  const value = String(process.env.GAS_WEB_APP_URL || DEFAULT_GAS_WEB_APP_URL).trim();
  return value.replace(/\/+$/, '');
}

function sendJson(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept');
  res.setHeader('X-RH-Backend', 'Vercel->AppsScript');
  return res.end(JSON.stringify(body));
}

function parseArgs(value) {
  if (Array.isArray(value)) return value;
  if (value == null || value === '') return [];
  try {
    const parsed = JSON.parse(String(value));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    throw new Error('Parameter args bukan JSON array yang valid.');
  }
}

function extractJson(text, upstreamStatus) {
  const raw = String(text || '').replace(/^\uFEFF/, '').trim();
  if (!raw) throw new Error(`Apps Script mengembalikan body kosong (HTTP ${upstreamStatus}).`);
  try {
    return JSON.parse(raw);
  } catch {
    const preview = raw.replace(/\s+/g, ' ').slice(0, 500);
    throw new Error(`Apps Script mengembalikan bukan JSON (HTTP ${upstreamStatus}). ${preview}`);
  }
}

async function callGas(fn, args, method) {
  const base = getGasUrl();
  const controller = new AbortController();
  const timeoutMs = method === 'GET' ? 20000 : 40000;
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const options = {
      method,
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        Accept: 'application/json'
      }
    };

    let url = base;
    if (method === 'GET') {
      url += '?fn=' + encodeURIComponent(fn) +
        '&args=' + encodeURIComponent(JSON.stringify(Array.isArray(args) ? args : []));
    } else {
      options.headers['Content-Type'] = 'application/json;charset=utf-8';
      options.body = JSON.stringify({
        fn,
        args: Array.isArray(args) ? args : []
      });
    }

    const upstream = await fetch(url, options);
    const payload = extractJson(await upstream.text(), upstream.status);

    if (!upstream.ok) {
      const message = payload && payload.error
        ? payload.error
        : `Apps Script HTTP ${upstream.status}`;
      throw new Error(message);
    }

    return payload;
  } finally {
    clearTimeout(timer);
  }
}

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') return sendJson(res, 204, { ok: true });

  try {
    if (req.method === 'GET') {
      const query = req.query || {};
      const fn = String(query.fn || 'ping').trim();
      if (!fn) return sendJson(res, 400, { ok: false, error: 'Field fn wajib ada.' });
      const args = parseArgs(query.args);
      const result = await callGas(fn, args, 'GET');
      return sendJson(res, 200, result);
    }

    if (req.method !== 'POST') {
      return sendJson(res, 405, { ok: false, error: 'Method tidak diizinkan.' });
    }

    let body = req.body || {};
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body || '{}');
      } catch {
        return sendJson(res, 400, { ok: false, error: 'Body JSON tidak valid.' });
      }
    }

    const fn = String(body.fn || '').trim();
    if (!fn) return sendJson(res, 400, { ok: false, error: 'Field fn wajib ada.' });

    const args = Array.isArray(body.args) ? body.args : [];
    const result = await callGas(fn, args, 'POST');
    return sendJson(res, 200, result);
  } catch (error) {
    const message = error && error.name === 'AbortError'
      ? 'Apps Script timeout. Coba lagi; operasi berat tidak dijalankan saat boot.'
      : ((error && error.message) || String(error));

    return sendJson(res, 502, {
      ok: false,
      error: 'Koneksi RH -> Apps Script gagal: ' + message,
      backend: getGasUrl()
    });
  }
};
