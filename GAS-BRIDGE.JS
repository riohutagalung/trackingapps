/**
 * ===============================================================
 * GAS-BRIDGE.JS
 * ---------------------------------------------------------------
 * MASALAH:
 *   `google.script.run` HANYA ada kalau HTML-nya dibuka lewat URL
 *   Apps Script (…/exec). Kalau file HTML yang sama kamu hosting di
 *   Vercel/GitHub Pages, object itu tidak pernah ada — makanya semua
 *   pemanggilan (getBootstrap, addExpense, addTrip, dst) langsung
 *   gagal diam-diam dan status di UI nyangkut di "Menghubungkan...".
 *
 * SOLUSI:
 *   File ini membuat ULANG API `google.script.run` (lengkap dengan
 *   .withSuccessHandler() / .withFailureHandler() seperti aslinya)
 *   tapi di baliknya memakai fetch() ke Web App Apps Script kamu.
 *   Semua kode di index.html (App, GPS, Expense, Trip, Settings, dll)
 *   TIDAK PERLU diubah sama sekali — cukup include file ini SEBELUM
 *   script utama index.html.
 *
 * CARA PAKAI di index.html:
 *   <script src="gas-bridge.js"></script>
 *   <script> ...seluruh script App/GPS/dst yang sudah ada... </script>
 *
 * WAJIB: isi WEB_APP_URL di bawah dengan URL deployment /exec TERBARU
 * (dapat dari Apps Script > Deploy > Manage deployments, setelah kamu
 * memasang Code.gs yang sudah diperbaiki dan membuat deployment BARU).
 * ===============================================================
 */
(function () {
  'use strict';

  // GANTI dengan URL /exec Apps Script kamu (harus diakhiri "/exec").
  var WEB_APP_URL = 'https://script.google.com/macros/s/AKfycbzJAwTklwT6gdaPRbFD6KSxjNFSVOvGO7d7uA33WVKoR2iKUUPiQ3cNOoUGd7o1NzAoLg/exec';

  // Kalau halaman ini dibuka LANGSUNG lewat Apps Script (mis. saat kamu
  // buka /exec sendiri di browser), google.script.run ASLI sudah ada
  // dan lebih baik daripada polyfill ini — jadi jangan ditimpa.
  if (window.google && window.google.script && window.google.script.run) {
    console.log('[gas-bridge] google.script.run asli terdeteksi, polyfill dilewati.');
    return;
  }

  function callRpc(fnName, args, handlers) {
    fetch(WEB_APP_URL, {
      method: 'POST',
      // WAJIB text/plain, BUKAN application/json — supaya browser tidak
      // mengirim preflight OPTIONS (Apps Script tidak bisa menjawab OPTIONS).
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ fn: fnName, args: args })
    })
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status + ' dari Apps Script');
        return res.json();
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
        if (handlers.failure) handlers.failure(err, handlers.userObject);
        else console.error('[gas-bridge] fetch error (' + fnName + '):', err);
      });
  }

  // Builder rantai: google.script.run.withSuccessHandler(x).withFailureHandler(y).namaFungsi(...)
  function makeRunner(handlers) {
    return new Proxy(function () {}, {
      get: function (_target, prop) {
        if (prop === 'withSuccessHandler') {
          return function (cb) {
            return makeRunner(Object.assign({}, handlers, { success: cb }));
          };
        }
        if (prop === 'withFailureHandler') {
          return function (cb) {
            return makeRunner(Object.assign({}, handlers, { failure: cb }));
          };
        }
        if (prop === 'withUserObject') {
          return function (obj) {
            return makeRunner(Object.assign({}, handlers, { userObject: obj }));
          };
        }
        // Nama properti lain dianggap nama fungsi Apps Script yang mau dipanggil.
        return function () {
          var args = Array.prototype.slice.call(arguments);
          callRpc(prop, args, handlers);
        };
      }
    });
  }

  window.google = window.google || {};
  window.google.script = window.google.script || {};
  window.google.script.run = makeRunner({});

  console.log('[gas-bridge] google.script.run polyfill aktif → ' + WEB_APP_URL);
})();
