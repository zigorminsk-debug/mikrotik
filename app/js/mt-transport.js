/* =====================================================================
   Транспорт RouterOS API: скрывает разницу между платформами.
   • Android   — window.Android.mtOpen/mtSend/mtClose (Java-мост, сокеты)
   • Windows   — window.mikrotik.open/send/close (Electron IPC → net/tls)
   Обе платформы уже выполняют connect + логин при открытии сессии.
   ===================================================================== */
(function (global) {
  'use strict';

  function nativeApi() {
    if (typeof window === 'undefined') return null;
    var a = window.Android || window.mt;
    if (a && typeof a.mtOpen === 'function') return 'android';
    var w = window.mikrotik;
    if (w && typeof w.open === 'function') return 'electron';
    return null;
  }

  function platformReply(raw) {
    if (raw === null || raw === undefined) return { status: 'error', items: [], message: 'пустой ответ транспорта' };
    if (typeof raw === 'object') return raw;
    try { return JSON.parse(String(raw)); } catch (e) { return { status: 'error', items: [], message: 'неверный ответ транспорта' }; }
  }

  function normalize(rep) {
    rep = rep || {};
    rep.status = rep.status || 'done';
    rep.items = rep.items || [];
    rep.message = rep.message || '';
    return rep;
  }

  var MtTransport = {
    available: function () { return nativeApi() !== null; },

    open: function (opts) {
      opts = opts || {};
      var p = nativeApi();
      if (!p) return Promise.reject(new Error('Прямое подключение недоступно: в этой сборке нет нативного транспорта RouterOS API.'));
      var host = String(opts.host || '').trim();
      var port = Number(opts.port) || 8728;
      if (!host) return Promise.reject(new Error('Укажите хост / IP роутера.'));
      if (port < 1 || port > 65535) return Promise.reject(new Error('Порт должен быть в диапазоне 1–65535.'));
      if (p === 'android') {
        var api = window.Android || window.mt;
        return Promise.resolve(api.mtOpen(host, port, !!opts.ssl, String(opts.user || ''), String(opts.pass || '')));
      }
      return window.mikrotik.open(host, port, !!opts.ssl, String(opts.user || ''), String(opts.pass || ''));
    },

    send: function (id, words) {
      var p = nativeApi();
      if (!p) return Promise.reject(new Error('Нет нативного транспорта.'));
      if (p === 'android') {
        var api = window.Android || window.mt;
        var raw = api.mtSend(id, JSON.stringify(words || []));
        return Promise.resolve(normalize(platformReply(raw)));
      }
      return window.mikrotik.send(id, words || []).then(normalize);
    },

    close: function (id) {
      var p = nativeApi();
      if (!p) return Promise.resolve();
      if (p === 'android') {
        (window.Android || window.mt).mtClose(id);
        return Promise.resolve();
      }
      return window.mikrotik.close(id);
    }
  };

  global.MtTransport = MtTransport;
  if (typeof module !== 'undefined' && module.exports) module.exports = MtTransport;
})(this);
