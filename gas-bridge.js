/**
 * RH Habits V13 — same-origin RPC bridge with JSONP fallback.
 * Browser -> /api/rpc -> Apps Script /exec (or direct Apps Script JSONP)
 */
(function () {
  'use strict';

  // Primary proxy endpoint (same-origin). Keep as default to support deployments
  // that proxy /api/rpc -> Apps Script exec. If that fails we try direct Apps Script
  // exec URL via JSONP (window.RH_APPSCRIPT_URL) or meta[name="rh-script-id"].
  var RPC_URL = '/api/rpc';
  var MAX_GET_BYTES = 1400;

  function encodedSize(fnName, args) {
    try { return encodeURIComponent(JSON.stringify({fn: fnName, args: args || []})).length; }
    catch (e) { return 999999; }
  }

  // JSONP helper (for cross-origin Apps Script fallback)
  function jsonpCall(url, params, handlers, timeoutMs) {
    params = params || {};
    var callbackName = '__rh_cb_' + (Date.now().toString(36)) + '_' + Math.floor(Math.random()*1000);
    params.callback = callbackName;
    var q = Object.keys(params).map(function(k){ return encodeURIComponent(k) + '=' + encodeURIComponent(params[k]); }).join('&');
    var script = document.createElement('script');
    script.src = url + (url.indexOf('?') === -1 ? '?' : '&') + q;
    script.async = true;

    var timeout = setTimeout(function(){ cleanup(); if (handlers && handlers.failure) handlers.failure(new Error('JSONP timeout'), handlers.userObject); }, timeoutMs || 30000);

    window[callbackName] = function(payload) {
      cleanup();
      try {
        if (payload && payload.ok) {
          if (handlers && handlers.success) handlers.success(payload.result, handlers.userObject);
        } else {
          var msg = (payload && payload.error) || 'RPC gagal tanpa pesan error (JSONP).';
          if (handlers && handlers.failure) handlers.failure(new Error(msg), handlers.userObject);
        }
      } catch (e) {
        if (handlers && handlers.failure) handlers.failure(e, handlers.userObject);
      }
    };

    function cleanup(){
      clearTimeout(timeout);
      try { delete window[callbackName]; } catch (e) { window[callbackName] = undefined; }
      if (script.parentNode) script.parentNode.removeChild(script);
    }

    document.head.appendChild(script);
  }

  function callRpc(fnName, args, handlers) {
    var useGet = encodedSize(fnName, args) <= MAX_GET_BYTES;
    var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timeoutId = setTimeout(function () { if (controller) controller.abort(); }, 30000);
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
          try { payload = text ? JSON.parse(text) : null; } catch (e) { payload = null; }
          if (!res.ok) {
            throw new Error((payload && payload.error) ? payload.error : ('HTTP ' + res.status + ' dari ' + url));
          }
          if (!payload) throw new Error('Respons bukan JSON yang valid dari ' + url);
          return payload;
        });
      })
      .then(function (payload) {
        if (payload && payload.ok) {
          if (handlers && handlers.success) handlers.success(payload.result, handlers.userObject);
        } else {
          var msg = (payload && payload.error) || 'RPC gagal tanpa pesan error.';
          if (handlers && handlers.failure) handlers.failure(new Error(msg), handlers.userObject);
        }
      })
      .catch(function (err) {
        // On failure, attempt JSONP fallback to direct Apps Script exec endpoint if available.
        var msg = err && err.name === 'AbortError' ? 'Request timeout (30 detik).' : ((err && err.message) || String(err));
        // Try fallback
        var scriptUrl = window.RH_APPSCRIPT_URL || (document.querySelector('meta[name="rh-script-id"]') && (function(){ var id=document.querySelector('meta[name="rh-script-id"]').getAttribute('content')||''; return id?('https://script.google.com/macros/s/'+id+'/exec'):''; })());
        if (scriptUrl) {
          // Use JSONP (no credentials)
          jsonpCall(scriptUrl, { fn: fnName, args: JSON.stringify(args || []) }, handlers, 30000);
        } else {
          if (handlers && handlers.failure) handlers.failure(new Error(msg), handlers.userObject);
          else console.error('[RH] RPC ' + fnName + ': ' + msg);
        }
      })
      .finally(function () { clearTimeout(timeoutId); });
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
  console.log('[RH] V13 bridge aktif → ' + RPC_URL + ' (JSONP fallback enabled)');
})();
