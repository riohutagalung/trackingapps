# RH Habits V13 — Performance + Stable Backend Bridge

## Architecture
Browser -> Vercel `/api/rpc` -> Apps Script `/exec` -> Google Sheets.

This avoids relying on browser CORS behavior when calling Apps Script Content Service directly.

## Deploy
1. Replace the GitHub/Vercel files with this folder.
2. Optional: set Vercel environment variable `GAS_WEB_APP_URL` to the current Apps Script `/exec` URL. A fallback to the current URL is already embedded in `api/rpc.js`.
3. Redeploy Vercel.
4. Unregister the old Service Worker once in Chrome DevTools -> Application -> Service Workers, then hard refresh.
5. Keep Apps Script Web App access configured so the Vercel server can call the `/exec` endpoint.

## Apps Script
Use the supplied `Code.gs` from the same version. No Sheet creation is performed during normal reads.
