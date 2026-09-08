/**
 * RH Habits V12 — same-origin bridge.
 * Browser -> /api/rpc (Vercel) -> Apps Script Web App.
 *
 * WHY:
 * Direct browser fetch() to Apps Script is cross-origin and the Apps Script
 * Content Service uses a redirect to script.googleusercontent.com. The
 * browser can reject that response even when the Web App URL itself opens.
 * Keeping the Apps Script call server-side avoids that dependency on browser CORS.
 */
(function () {
  'use strict';

  var RPC_URL = '/api/rpc';

  function callRpc(fnName, args, handlers) {
    var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timeout = setTimeout(function () {
      if (controller) controller.abort();
    }, 30000);

    fetch(RPC_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fn: fnName, args: args || [] }),
      credentials: 'same-origin',
      cache: 'no-store',
      signal: controller ? controller.signal : undefined
    })
      .then(function (res) {
        return res.text().then(function (text) {
          var payload = null;
          try { payload = text ? JSON.parse(text) : null; } catch (e) {}
          if (!res.ok) {
            var msg = payload && payload.error ? payload.error : ('HTTP ' + res.status + ' dari Vercel API');
            throw new Error(msg);
          }
          if (!payload) throw new Error('Respons server bukan JSON yang valid.');
          return payload;
        });
      })
      .then(function (payload) {
        if (payload && payload.ok) {
          if (handlers.success) handlers.success(payload.result, handlers.userObject);
        } else {
          var msg = (payload && payload.error) || 'RPC gagal tanpa pesan error.';
          if (handlers.failure) handlers.failure(new Error(msg), handlers.userObject);
          else console.error('[gas-bridge] RPC error (' + fnName + '):', msg);
        }
      })
      .catch(function (err) {
        var msg = err && err.name === 'AbortError' ? 'Request ke server timeout (30 detik).' : ((err && err.message) || String(err));
        if (handlers.failure) handlers.failure(new Error(msg), handlers.userObject);
        else console.error('[gas-bridge] fetch error (' + fnName + '):', msg);
      })
      .finally(function () {
        clearTimeout(timeout);
      });
  }

  function makeRunner(handlers) {
    return new Proxy(function () {}, {
      get: function (_target, prop) {
        if (prop === 'withSuccessHandler') {
          return function (cb) { return makeRunner(Object.assign({}, handlers, { success: cb })); };
        }
        if (prop === 'withFailureHandler') {
          return function (cb) { return makeRunner(Object.assign({}, handlers, { failure: cb })); };
        }
        if (prop === 'withUserObject') {
          return function (obj) { return makeRunner(Object.assign({}, handlers, { userObject: obj })); };
        }
        return function () {
          callRpc(prop, Array.prototype.slice.call(arguments), handlers);
        };
      }
    });
  }

  window.google = window.google || {};
  window.google.script = window.google.script || {};
  window.google.script.run = makeRunner({});
  console.log('[RH] same-origin bridge aktif → ' + RPC_URL);
})();
