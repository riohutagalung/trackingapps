/**
 * RH Habits — browser RPC bridge
 * CHANGE: same-origin only. Browser -> /api/rpc -> Apps Script.
 * This intentionally removes the old JSONP fallback because the Apps Script
 * endpoint returns JSON, not JSONP, and direct cross-origin requests can fail.
 */
(function () {
  'use strict';

  var RPC_URL = '/api/rpc';
  var GET_LIMIT = 1400;
  var REQUEST_TIMEOUT = 35000;
  var MAX_RETRIES = 1;

  function encodeArgs(fnName, args) {
    return JSON.stringify({ fn: fnName, args: Array.isArray(args) ? args : [] });
  }

  function payloadSize(fnName, args) {
    try {
      return encodeURIComponent(encodeArgs(fnName, args)).length;
    } catch (_) {
      return Number.MAX_SAFE_INTEGER;
    }
  }

  function callHttp(fnName, args, attempt) {
    var isGet = payloadSize(fnName, args) <= GET_LIMIT;
    var url = RPC_URL;
    var options = {
      method: isGet ? 'GET' : 'POST',
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { Accept: 'application/json' }
    };

    if (isGet) {
      url += '?fn=' + encodeURIComponent(fnName) +
        '&args=' + encodeURIComponent(JSON.stringify(Array.isArray(args) ? args : []));
    } else {
      options.headers['Content-Type'] = 'application/json;charset=utf-8';
      options.body = encodeArgs(fnName, args);
    }

    var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = setTimeout(function () {
      if (controller) controller.abort();
    }, REQUEST_TIMEOUT);
    if (controller) options.signal = controller.signal;

    return fetch(url, options)
      .then(function (res) {
        return res.text().then(function (text) {
          var payload;
          try {
            payload = text ? JSON.parse(text) : null;
          } catch (_) {
            throw new Error('Respons RPC bukan JSON yang valid (HTTP ' + res.status + ').');
          }
          if (!res.ok) {
            throw new Error((payload && payload.error) || ('HTTP ' + res.status + ' dari ' + url));
          }
          if (!payload || payload.ok !== true) {
            throw new Error((payload && payload.error) || ('RPC ' + fnName + ' gagal.'));
          }
          return payload;
        });
      })
      .catch(function (err) {
        var retryable = err && (err.name === 'AbortError' || /Failed to fetch|NetworkError|Load failed/i.test(err.message || ''));
        if (retryable && attempt < MAX_RETRIES) return callHttp(fnName, args, attempt + 1);
        throw err;
      })
      .finally(function () {
        clearTimeout(timer);
      });
  }

  function callRpc(fnName, args, handlers) {
    handlers = handlers || {};
    callHttp(fnName, args, 0)
      .then(function (payload) {
        if (handlers.success) handlers.success(payload.result, handlers.userObject);
      })
      .catch(function (err) {
        if (handlers.failure) handlers.failure(err, handlers.userObject);
        else console.error('[RH] RPC ' + fnName + ':', err);
      });
  }

  function runner(handlers) {
    return new Proxy(function () {}, {
      get: function (_, prop) {
        if (prop === 'withSuccessHandler') {
          return function (cb) {
            return runner({
              success: cb,
              failure: handlers.failure,
              userObject: handlers.userObject
            });
          };
        }
        if (prop === 'withFailureHandler') {
          return function (cb) {
            return runner({
              success: handlers.success,
              failure: cb,
              userObject: handlers.userObject
            });
          };
        }
        if (prop === 'withUserObject') {
          return function (obj) {
            return runner({
              success: handlers.success,
              failure: handlers.failure,
              userObject: obj
            });
          };
        }
        return function () {
          callRpc(String(prop), Array.prototype.slice.call(arguments), handlers);
        };
      }
    });
  }

  window.google = window.google || {};
  window.google.script = window.google.script || {};
  window.google.script.run = runner({});

  window.RHBridge = {
    rpc: function (fn, args, handlers) {
      callRpc(fn, args || [], handlers || {});
    },
    endpoint: RPC_URL,
    backendMode: 'same-origin-proxy'
  };

  console.log('[RH] Bridge aktif -> ' + RPC_URL);
})();
