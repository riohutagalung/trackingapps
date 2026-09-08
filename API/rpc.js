/**
 * Vercel Serverless Function: same-origin proxy to Google Apps Script.
 * Browser talks to /api/rpc, server talks to GAS /exec.
 */
const GAS_WEB_APP_URL = process.env.GAS_WEB_APP_URL || 'https://script.google.com/macros/s/AKfycbzRjg19auTOg4Z0_0T_-S938vNFFfbE6DZtNXzGz91DL6snMqR9WIMb25OGym7I29H-aw/exec';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('X-RH-Backend', 'Vercel->AppsScript');

  if (req.method === 'GET') {
    return res.status(200).json({ ok: true, service: 'RH Habits RPC proxy', backend: GAS_WEB_APP_URL.replace(/\/exec.*/, '/exec') });
  }
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method tidak diizinkan. Gunakan POST.' });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    if (!body.fn) return res.status(400).json({ ok: false, error: 'Field fn wajib ada.' });

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 28000);

    let upstream;
    try {
      upstream = await fetch(GAS_WEB_APP_URL, {
        method: 'POST',
        redirect: 'follow',
        headers: { 'Content-Type': 'text/plain;charset=utf-8', 'Accept': 'application/json' },
        body: JSON.stringify({ fn: body.fn, args: Array.isArray(body.args) ? body.args : [] }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }

    const text = await upstream.text();
    let payload;
    try {
      payload = JSON.parse(text);
    } catch (e) {
      const preview = String(text || '').replace(/\s+/g, ' ').slice(0, 240);
      return res.status(502).json({ ok: false, error: 'Apps Script mengembalikan respons bukan JSON (HTTP ' + upstream.status + '). Preview: ' + preview });
    }

    return res.status(upstream.ok ? 200 : 502).json(payload);
  } catch (err) {
    const msg = err && err.name === 'AbortError' ? 'Apps Script timeout setelah 28 detik.' : ((err && err.message) || String(err));
    return res.status(502).json({ ok: false, error: 'Proxy ke Apps Script gagal: ' + msg });
  }
}
