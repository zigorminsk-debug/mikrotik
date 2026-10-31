/* =====================================================================
   UI: прямая работа с физическим MikroTik через RouterOS API.
   Подключение, консоль команд, применение конфигурации со стенда.
   ===================================================================== */
(function () {
  'use strict';

  var connectView = document.getElementById('connect-view');
  if (!connectView) return;

  var $ = function (id) { return document.getElementById(id); };

  var mtHost = $('mt_host');
  var mtPort = $('mt_port');
  var mtSsl = $('mt_ssl');
  var mtUser = $('mt_user');
  var mtPass = $('mt_pass');
  var mtConnectBtn = $('mt_connect');
  var mtDisconnectBtn = $('mt_disconnect');
  var mtStatus = $('mt_status');
  var mtConsole = $('mt_console');
  var mtConsoleSend = $('mt_console_send');
  var mtConsoleClear = $('mt_console_clear');
  var mtConsoleOut = $('mt_console_out');
  var mtApplyBtn = $('mt_apply');
  var mtApplyOut = $('mt_apply_out');

  var sessionId = null;
  var connected = false;

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/\"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function setStatus(text, kind) {
    if (!mtStatus) return;
    mtStatus.textContent = text;
    mtStatus.className = 'mt-status mt-status-' + (kind || 'off');
  }
  function transportUnavailable() {
    return !MtTransport || !MtTransport.available();
  }

  function log(el, text, kind) {
    if (!el) return;
    var d = document.createElement('div');
    d.className = 'line' + (kind ? ' ' + kind : '');
    d.textContent = text;
    el.appendChild(d);
    el.scrollTop = el.scrollHeight;
  }

  function renderReply(el, label, rep) {
    log(el, label || (rep.status === 'done' ? '✓ OK' : '✗ Ошибка API'), rep.status === 'done' ? 'ok' : 'err');
    if (rep.items && rep.items.length) {
      rep.items.forEach(function (it) {
        var line = '';
        (it.attrs || []).forEach(function (a) {
          if (line) line += '   ';
          line += esc(a.name) + ' = ' + esc(a.value);
        });
        log(el, line, 'cmd');
      });
    }
    if (rep.message) log(el, 'сообщение: ' + esc(rep.message), 'err');
  }

  function sendCli(line) {
    if (!line) return Promise.resolve();
    if (!connected || sessionId == null) {
      log(mtConsoleOut, 'нет подключения к роутеру', 'err');
      return Promise.reject(new Error('не подключено'));
    }
    log(mtConsoleOut, '> ' + esc(line), 'cmd');
    var words = MtApi.cliToWords(line);
    if (!words) return Promise.resolve();
    return MtTransport.send(sessionId, words).then(function (rep) {
      renderReply(mtConsoleOut, null, rep);
      if (rep.status !== 'done') return Promise.reject(new Error(rep.message || rep.status));
      return rep;
    }).catch(function (e) {
      log(mtConsoleOut, 'ошибка выполнения: ' + esc(e && e.message ? e.message : String(e)), 'err');
      throw e;
    });
  }

  /* ---------- подключение / отключение ---------- */
  mtConnectBtn.addEventListener('click', function () {
    if (transportUnavailable()) {
      setStatus('Прямое подключение недоступно в этой сборке (нет нативного транспорта)', 'err');
      log(mtConsoleOut, 'требуется сборка с поддержкой RouterOS API (Android WebView-мост или Electron IPC)', 'warn');
      return;
    }
    if (!mtHost.value.trim() || !mtUser.value.trim()) {
      setStatus('Укажите хост и пользователя', 'err');
      return;
    }
    setStatus('Подключение к ' + mtHost.value.trim() + ':' + (mtPort.value || '8728') + '…', 'info');
    mtConnectBtn.disabled = true;
    // нативный мост блокирует поток WebView — откладываем на тик, чтобы статус отрисовался
    setTimeout(function () {
      MtTransport.open({
      host: mtHost.value.trim(),
      port: Number(mtPort.value) || 8728,
      ssl: mtSsl.checked,
      user: mtUser.value.trim(),
      pass: mtPass.value
    }).then(function (id) {
      sessionId = id;
      connected = true;
      setStatus('Подключено к ' + mtHost.value.trim() + ':' + mtPort.value, 'ok');
      mtConnectBtn.hidden = true;
      mtDisconnectBtn.hidden = false;
      if (mtApplyBtn) mtApplyBtn.hidden = false;
      return MtTransport.send(sessionId, MtApi.cliToWords('/system identity print'));
    }).then(function (rep) {
      var name = '';
      if (rep.items && rep.items[0] && rep.items[0].attrs) {
        rep.items[0].attrs.forEach(function (a) { if (a.name === 'name') name = a.value; });
      }
      log(mtConsoleOut, 'роутер: ' + (name || 'неизвестно'), 'ok');
    }).catch(function (e) {
      connected = false;
      sessionId = null;
      setStatus('ошибка подключения: ' + esc(e && e.message ? e.message : String(e)), 'err');
      log(mtConsoleOut, 'не удалось подключиться: ' + esc(e && e.message ? e.message : String(e)), 'err');
    }).finally(function () {
      mtConnectBtn.disabled = false;
    });
  });
  });

  mtDisconnectBtn.addEventListener('click', function () {
    if (sessionId != null) {
      MtTransport.close(sessionId).catch(function () {});
      sessionId = null;
    }
    connected = false;
    setStatus('Не подключено', 'off');
    mtConnectBtn.hidden = false;
    mtDisconnectBtn.hidden = true;
  });

  /* ---------- консоль ---------- */
  mtConsoleSend.addEventListener('click', function () { sendCli(mtConsole.value); });
  mtConsole.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendCli(mtConsole.value); }
  });
  mtConsoleClear.addEventListener('click', function () { mtConsoleOut.innerHTML = ''; });

  /* ---------- применить конфигурацию со стенда ---------- */
  var standGroups = null;
  window.MtConnect = window.MtConnect || {};
  window.MtConnect.setStandGroups = function (groups) {
    standGroups = groups || null;
    if (mtApplyBtn) mtApplyBtn.hidden = !standGroups || standGroups.length === 0;
  };

  mtApplyBtn.addEventListener('click', function () {
    if (!connected || sessionId == null) {
      log(mtApplyOut, 'сначала подключитесь к роутеру', 'warn');
      return;
    }
    if (!standGroups || standGroups.length === 0) {
      log(mtApplyOut, 'нет сгенерированной конфигурации — смоделируйте задачу на стенде', 'warn');
      return;
    }
    var total = 0, ok = 0, fail = 0;
    standGroups.forEach(function (g) {
      (g.code || '').split('\n').forEach(function (line) {
        line = line.trim();
        if (!line) return;
        if (line.charAt(0) === '#' || line.charAt(0) === '/') {
          if (line.indexOf('/*') >= 0 || line.indexOf('---') >= 0) return;
        }
        total++;
      });
    });
    log(mtApplyOut, 'отправка ' + total + ' команд на роутер…', 'info');

    (function runNext(groupIdx, lineIdx) {
      // найти следующую выполняемую строку
      while (groupIdx < standGroups.length) {
        var lines = (standGroups[groupIdx].code || '').split('\n');
        while (lineIdx < lines.length) {
          var line = lines[lineIdx].trim();
          lineIdx++;
          if (!line) continue;
          if (line.charAt(0) === '#') continue;
          if (line.indexOf('/*') >= 0 || line.indexOf('---') >= 0) continue;
          if (line.indexOf('IPF') >= 0 && line.indexOf('/') < 0) continue;
          // заголовки групп вроде «=== N. Имя ===» пропускаем
          if (/^=\s*=/.test(line)) continue;
          sendCli(line).then(function () { ok++; }).catch(function () { fail++; });
          return runNextDelayed(groupIdx, lineIdx);
        }
        groupIdx++; lineIdx = 0;
      }
      log(mtApplyOut, 'завершено: ' + ok + ' выполнено, ' + fail + ' ошибок из ' + total, ok && !fail ? 'ok' : 'err');
    })(0, 0);

    function runNextDelayed(g, i) {
      setTimeout(function () { runNext(g, i); }, 50);
    }
  });
})();
