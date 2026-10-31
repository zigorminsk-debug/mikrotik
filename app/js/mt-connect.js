/* =====================================================================
   UI: прямая работа с MikroTik — реальный роутер (RouterOS API)
   или встроенный учебный симулятор (виртуальный роутер).
   ===================================================================== */
(function () {
  'use strict';

  var connectView = document.getElementById('connect-view');
  if (!connectView) return;

  var $ = function (id) { return document.getElementById(id); };

  /* ---------- элементы управления ---------- */
  var mtTargetRadios = document.querySelectorAll('input[name=mt_target]');
  var mtSessionReal = $('mt_session_real');
  var mtSessionVirtual = $('mt_session_virtual');

  var mtHost = $('mt_host');
  var mtPort = $('mt_port');
  var mtSsl = $('mt_ssl');
  var mtUser = $('mt_user');
  var mtPass = $('mt_pass');
  var mtConnectBtn = $('mt_connect');
  var mtDisconnectBtn = $('mt_disconnect');
  var mtStatus = $('mt_status');

  var mtVirtStatus = $('mt_virt_status');
  var mtVirtStart = $('mt_virt_start');
  var mtVirtReset = $('mt_virt_reset');
  var mtVirtExport = $('mt_virt_export');

  var mtConsole = $('mt_console');
  var mtConsoleSend = $('mt_console_send');
  var mtConsoleClear = $('mt_console_clear');
  var mtConsoleOut = $('mt_console_out');
  var mtApplyBtn = $('mt_apply');
  var mtApplyOut = $('mt_apply_out');

  var sessionId = null;
  var connected = false;
  var virtRunning = false;
  var vr = new VirtualRouter();   // учебный симулятор RouterOS

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/\"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function isVirtual() {
    for (var i = 0; i < mtTargetRadios.length; i++) {
      if (mtTargetRadios[i].checked) return mtTargetRadios[i].value === 'virtual';
    }
    return false;
  }

  function setTargetUI() {
    if (isVirtual()) {
      mtSessionReal.hidden = true;
      mtSessionVirtual.hidden = false;
      mtConnectBtn.hidden = true;
      mtDisconnectBtn.hidden = true;
      if (mtApplyBtn) mtApplyBtn.hidden = !standGroupsOrEmpty();
    } else {
      mtSessionReal.hidden = false;
      mtSessionVirtual.hidden = true;
      mtConnectBtn.hidden = false;
      mtDisconnectBtn.hidden = connected ? false : true;
      if (mtApplyBtn) mtApplyBtn.hidden = !standGroupsOrEmpty() || !connected;
    }
  }

  function standGroupsOrEmpty() {
    return !!(window.__lastStandGroups && window.__lastStandGroups.length);
  }

  Array.prototype.forEach.call(mtTargetRadios, function (radio) {
    radio.addEventListener('change', function () {
      setTargetUI();
    });
  });

  function setStatus(text, kind) {
    if (!mtStatus) return;
    mtStatus.textContent = text;
    mtStatus.className = 'mt-status mt-status-' + (kind || 'off');
  }
  function setVirtStatus(text, kind) {
    if (!mtVirtStatus) return;
    mtVirtStatus.textContent = text;
    mtVirtStatus.className = 'mt-status mt-status-' + (kind || 'off');
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
    log(el, label || (rep.status === 'done' ? '✓ OK' : '✗ Ошибка'), rep.status === 'done' ? 'ok' : 'err');
    if (rep.text) log(el, rep.text, 'cmd');
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

  /* ---------- отправка одной команды (реальный или виртуальный роутер) ---------- */
  function sendCli(line) {
    if (!line) return Promise.resolve();
    var target = isVirtual();
    if (!target) {
      if (!connected || sessionId == null) {
        log(mtConsoleOut, 'нет подключения к роутеру', 'err');
        return Promise.reject(new Error('не подключено'));
      }
      log(mtConsoleOut, '> ' + esc(line) + '   [реальный роутер]', 'cmd');
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
    } else {
      if (!virtRunning) {
        log(mtConsoleOut, 'запустите виртуальный роутер', 'warn');
        return Promise.reject(new Error('симулятор остановлен'));
      }
      log(mtConsoleOut, '> ' + esc(line) + '   [виртуальный роутер]', 'cmd');
      var words = MtApi.cliToWords(line);
      if (!words) return Promise.resolve();
      try {
        var rep = vr.execute(words);
        renderReply(mtConsoleOut, null, rep);
        if (rep.status !== 'done') return Promise.reject(new Error(rep.message || rep.status));
        return Promise.resolve(rep);
      } catch (e) {
        log(mtConsoleOut, 'ошибка выполнения: ' + esc(e && e.message ? e.message : String(e)), 'err');
        return Promise.reject(e);
      }
    }
  }

  /* ---------- подключение к реальному роутеру ---------- */
  mtConnectBtn.addEventListener('click', function () {
    if (isVirtual()) return; // виртуальный роутер — своя кнопка
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
        setTargetUI();
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
        setTargetUI();
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
    setTargetUI();
  });

  /* ---------- виртуальный роутер ---------- */
  mtVirtStart.addEventListener('click', function () {
    if (virtRunning) return;
    vr.reset();
    virtRunning = true;
    mtVirtStart.hidden = true;
    mtVirtReset.hidden = false;
    setVirtStatus('Симулятор запущен (заводская конфигурация)', 'ok');
    log(mtConsoleOut, 'виртуальный роутер запущен', 'ok');
    setTargetUI();
  });

  mtVirtReset.addEventListener('click', function () {
    vr.reset();
    setVirtStatus('Конфигурация сброшена', 'info');
    log(mtConsoleOut, 'виртуальный роутер сброшен к заводским настройкам', 'info');
  });

  mtVirtExport.addEventListener('click', function () {
    if (!virtRunning) {
      log(mtConsoleOut, 'запустите виртуальный роутер', 'warn');
      return;
    }
    var rep = vr.execute(['/export']);
    renderReply(mtApplyOut, null, rep);
    if (rep.text) log(mtConsoleOut, 'Экспорт виртуального роутера:\n' + rep.text, 'cmd');
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
    setTargetUI();
  };

  mtApplyBtn.addEventListener('click', function () {
    if (isVirtual()) {
      if (!virtRunning) {
        log(mtApplyOut, 'запустите виртуальный роутер', 'warn');
        return;
      }
    } else {
      if (!connected || sessionId == null) {
        log(mtApplyOut, 'сначала подключитесь к роутеру', 'warn');
        return;
      }
    }
    if (!standGroups || standGroups.length === 0) {
      log(mtApplyOut, 'нет сгенерированной конфигурации — смоделируйте задачу на стенде', 'warn');
      return;
    }
    var commands = [];
    standGroups.forEach(function (g) {
      (g.code || '').split('\n').forEach(function (line) {
        line = line.trim();
        if (!line) return;
        if (line.charAt(0) === '#') return;
        if (line.indexOf('/*') >= 0 || line.indexOf('---') >= 0) return;
        if (line.indexOf('IPF') >= 0 && line.indexOf('/') < 0) return;
        if (/^=\s*=/.test(line)) return;
        commands.push(line);
      });
    });
    var total = commands.length;
    var ok = 0, fail = 0;
    log(mtApplyOut, 'отправка ' + total + ' команд на ' + (isVirtual() ? 'виртуальный роутер' : 'реальный роутер') + '…', 'info');

    var idx = 0;
    function runNext() {
      if (idx >= commands.length) {
        log(mtApplyOut, 'завершено: ' + ok + ' выполнено, ' + fail + ' ошибок из ' + total, ok === total && total > 0 ? 'ok' : 'err');
        return;
      }
      var line = commands[idx++];
      sendCli(line).then(function () {
        ok++;
        runNext();
      }).catch(function () {
        fail++;
        runNext();
      });
    }
    runNext();
  });

  /* ---------- инициализация ---------- */
  setTargetUI();
})();
