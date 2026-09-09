/**
 * RH Habits V13 — same-origin RPC bridge.
 * Browser -> /api/rpc -> Apps Script /exec.
 */
(function () {
  'use strict';

  var RPC_URL = '/api/rpc';
  var MAX_GET_BYTES = 1400;

  function encodedSize(fnName, args) {
    try { return encodeURIComponent(JSON.stringify({fn: fnName, args: args || []})).length; }
    catch (e) { return 999999; }
  }

  function callRpc(fnName, args, handlers) {
    var useGet = encodedSize(fnName, args) <= MAX_GET_BYTES;
    var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timeout = setTimeout(function () { if (controller) controller.abort(); }, 30000);
    var url = RPC_URL;
    var options = {
      method: useGet ? 'GET' : 'POST',
      credentials: 'same-origin',
      cache: 'no-store',
      signal: controller ? controller.signal : undefined,
      headers: { 'Accept': 'application/json' }
    };

    if (useGet) {
      url += '?fn=' + encodeURIComponent(fnName) + '&args=' + encodeURIComponent(JSON.stringify(args || []));
    } else {
      options.headers['Content-Type'] = 'application/json;charset=utf-8';
      options.body = JSON.stringify({ fn: fnName, args: Array.isArray(args) ? args : [] });
    }

    fetch(url, options)
      .then(function (res) {
        return res.text().then(function (text) {
          var payload = null;
          try { payload = text ? JSON.parse(text) : null; } catch (e) {}
          if (!res.ok) {
            throw new Error(payload && payload.error ? payload.error : ('HTTP ' + res.status + ' dari /api/rpc'));
          }
          if (!payload) throw new Error('Respons /api/rpc bukan JSON yang valid.');
          return payload;
        });
      })
      .then(function (payload) {
        if (payload && payload.ok) {
          if (handlers.success) handlers.success(payload.result, handlers.userObject);
        } else {
          var msg = (payload && payload.error) || 'RPC gagal tanpa pesan error.';
          if (handlers.failure) handlers.failure(new Error(msg), handlers.userObject);
        }
      })
      .catch(function (err) {
        var msg = err && err.name === 'AbortError' ? 'Request timeout (30 detik).' : ((err && err.message) || String(err));
        if (handlers.failure) handlers.failure(new Error(msg), handlers.userObject);
        else console.error('[RH] RPC ' + fnName + ': ' + msg);
      })
      .finally(function () { clearTimeout(timeout); });
  }

  function makeRunner(handlers) {
    return new Proxy(function () {}, {
      get: function (_target, prop) {
        if (prop === 'withSuccessHandler') return function (cb) { return makeRunner(Object.assign({}, handlers, {success: cb})); };
        if (prop === 'withFailureHandler') return function (cb) { return makeRunner(Object.assign({}, handlers, {failure: cb})); };
        if (prop === 'withUserObject') return function (obj) { return makeRunner(Object.assign({}, handlers, {userObject: obj})); };
        return function () { callRpc(String(prop), Array.prototype.slice.call(arguments), handlers); };
      }
    });
  }

  window.google = window.google || {};
  window.google.script = window.google.script || {};
  window.google.script.run = makeRunner({});
  window.RHBridge = { rpc: callRpc, endpoint: RPC_URL };
  console.log('[RH] V13 bridge aktif → ' + RPC_URL);
})();
