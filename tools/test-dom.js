#!/usr/bin/env node
/* DOM-смоук-тест: загружает app/index.html в jsdom со всеми скриптами,
   эмулирует нажатие «Смоделировать настройки» (в т.ч. со включённым VPN —
   тот самый сценарий с «plan is not defined»), проверяет регулировку
   шрифта и наличие автодополнения. Запуск: node tools/test-dom.js */
'use strict';
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

let passed = 0, failed = 0;
function ok(cond, msg) {
  if (cond) { passed++; console.log('  ✓ ' + msg); }
  else { failed++; console.log('  ✗ FAIL: ' + msg); }
}
const delay = (ms) => new Promise(r => setTimeout(r, ms));

async function main() {
  const page = path.join(__dirname, '..', 'app', 'index.html');
  const scriptErrors = [];
  const vc = new VirtualConsole();
  vc.on('jsdomError', (e) => {
    const m = e && e.message ? e.message : String(e);
    if (!/Not implemented/.test(m)) scriptErrors.push(m);
    if (e && e.detail) scriptErrors.push(String(e.detail && e.detail.message || e.detail));
  });
  vc.on('error', (m) => scriptErrors.push(String(m)));

  const dom = await JSDOM.fromFile(page, {
    runScripts: 'dangerously',
    resources: 'usable',
    pretendToBeVisual: true,
    virtualConsole: vc,
    beforeParse(window) {
      // заглушки для API, которых нет в jsdom
      window.HTMLElement.prototype.scrollIntoView = function () {};
      window.scrollTo = function () {};
    }
  });

  const win = dom.window;
  await new Promise((resolve) => {
    if (win.document.readyState === 'complete') resolve();
    else win.addEventListener('load', resolve);
    setTimeout(resolve, 5000);
  });
  await delay(100);

  const doc = win.document;
  const $ = (id) => doc.getElementById(id);

  console.log('== Загрузка приложения ==');
  ok(scriptErrors.length === 0, 'нет ошибок исполнения скриптов' + (scriptErrors.length ? ': ' + scriptErrors.join(' | ') : ''));
  ok(typeof win.StandEngine === 'object', 'StandEngine загружен');
  ok(doc.getElementById('nav').children.length === 11, 'разделов в меню: ' + doc.getElementById('nav').children.length);
  ok(doc.getElementById('content').children.length > 0, 'первый раздел отрендерен');
  const ownShot = doc.querySelector('#content li img[src$="chr-winbox4-workspace.png"]');
  ok(!!ownShot && !ownShot.closest('li').textContent.includes('отдельный скриншот пока не добавлен'), 'свой снимок прикреплён к отдельному действию');
  ok(!!doc.querySelector('#content li .fs-hint'), 'для пункта без снимка показано отсутствие');
  ok(!!doc.getElementById('dl-net') && !!doc.getElementById('dl-ip') && !!doc.getElementById('dl-port'), 'datalist автодополнения на месте');
  ok($('lan_cidr').getAttribute('list') === 'dl-net', 'поле подсети подключено к автодополнению');
  ok($('lan_gw').getAttribute('list') === 'dl-ip', 'поле шлюза подключено к автодополнению');
  const pubIp = doc.querySelector('[data-pub] [data-f=ip]');
  ok(pubIp && pubIp.getAttribute('list') === 'dl-ip', 'поле внутреннего IP публикации подключено к автодополнению');
  const pubPort = doc.querySelector('[data-pub] [data-f=port]');
  ok(pubPort && pubPort.getAttribute('list') === 'dl-port', 'поле порта подключено к автодополнению');

  console.log('== Стенд: сценарий из скриншота (VPN включён) ==');
  ok($('isp_primary').value === '0' && $('isp_backup').value === '1',
    'по умолчанию основной=1-й, резервный=2-й провайдер (' +
    $('isp_primary').value + '/' + $('isp_backup').value + ')');
  function runStand() {
    $('btn_run').dispatchEvent(new win.Event('click', { bubbles: true }));
    const r = $('stand-results');
    return { hidden: r.hidden, html: r.innerHTML };
  }
  // 1) воспроизведение бага: VPN ≠ none → раньше было "plan is not defined"
  $('vpn_type').value = 'wireguard';
  $('vpn_type').dispatchEvent(new win.Event('change'));
  let res = runStand();
  ok(!res.hidden, 'результаты отображены');
  ok(!/Ошибка моделирования/.test(res.html), 'нет карточки «Ошибка моделирования»');
  ok(!/plan is not defined/.test(res.html), 'нет ошибки «plan is not defined» (регрессия)');
  ok(/Инструкция по реализации/.test(res.html), 'инструкция реализации построена');
  ok(/WireGuard/.test(res.html), 'конфигурация WireGuard присутствует');
  ok(/Чек-лист приёмки/.test(res.html), 'чек-лист построен');
  ok(!/undefined/.test(res.html), 'нет «undefined» в HTML результатов');

  // 2) остальные VPN-типы тоже не падают
  for (const t of ['ikev2', 'l2tp-ipsec', 'ipsec-s2s', 'pptp', 'l2tp', 'sstp', 'ovpn']) {
    $('vpn_type').value = t;
    $('vpn_type').dispatchEvent(new win.Event('change'));
    res = runStand();
    ok(!/Ошибка моделирования|plan is not defined/.test(res.html), 'VPN ' + t + ': рендер без исключений');
  }
  $('vpn_type').value = 'none';
  $('vpn_type').dispatchEvent(new win.Event('change'));

  // 3) валидные данные без VPN → полный результат
  res = runStand();
  ok(/Модель прошла проверку/.test(res.html), 'дефолтная задача проходит проверку');
  ok(/План адресации/.test(res.html), 'план адресации отрисован');
  ok(!/undefined/.test(res.html), 'нет «undefined» в дефолтном результате');

  // 4) ошибки валидации показываются, а не роняют рендер
  $('guest_cidr').value = '192.168.88.0/24';
  res = runStand();
  ok(/найдено ошибок/.test(res.html) && /пересекаются/.test(res.html), 'пересечение подсетей → корректный экран ошибок');
  $('guest_cidr').value = '192.168.99.0/24';

  // 5) кнопка «Сбросить» работает
  $('btn_reset').dispatchEvent(new win.Event('click', { bubbles: true }));
  ok($('stand-results').hidden === true, 'сброс очищает результаты');
  ok(doc.querySelectorAll('.isp-row').length === 2, 'после сброса два провайдера по умолчанию');

  console.log('== Регулировка шрифта ==');
  ok($('fs_val').textContent === '100%', 'стартовый масштаб 100%');
  $('fs_plus').dispatchEvent(new win.Event('click', { bubbles: true }));
  ok($('fs_val').textContent === '115%', 'A＋ → 115%');
  ok(doc.querySelector('.content-wrap').style.zoom === '1.15', 'zoom применён к контенту');
  $('fs_plus').dispatchEvent(new win.Event('click', { bubbles: true }));
  $('fs_plus').dispatchEvent(new win.Event('click', { bubbles: true }));
  ok($('fs_val').textContent === '150%', 'максимум 150%');
  $('fs_plus').dispatchEvent(new win.Event('click', { bubbles: true }));
  ok($('fs_val').textContent === '150%', 'потолок не превышается');
  $('fs_minus').dispatchEvent(new win.Event('click', { bubbles: true }));
  ok($('fs_val').textContent === '130%', 'A− уменьшает обратно');
  try {
    var hasLS = typeof win.localStorage !== 'undefined' && win.localStorage !== null;
    if (hasLS) {
      win.localStorage.setItem('mtFontScale-chk', '1');
      hasLS = win.localStorage.getItem('mtFontScale-chk') === '1';
    }
    if (hasLS) ok(win.localStorage.getItem('mtFontScale') !== null, 'масштаб сохранён в localStorage');
    else ok(true, 'localStorage недоступен на file:// в jsdom — в приложении доступ защищён try/catch (пропущено)');
  } catch (e) {
    ok(true, 'localStorage недоступен — в приложении доступ защищён try/catch (пропущено)');
  }

  console.log('== Обновления (кнопка «⟳ Обновить») ==');
  ok(typeof win.APP_VERSION === 'string' && win.APP_VERSION.length > 0, 'APP_VERSION из version.js: ' + win.APP_VERSION);
  // a) сети/fetch нет → экран «не удалось» с кнопкой перехода к релизам
  $('btn_update').dispatchEvent(new win.Event('click', { bubbles: true }));
  await delay(20);
  ok($('upd-modal').hidden === false, 'диалог обновлений открылся');
  ok(/Не удалось проверить/.test($('upd-body').textContent), 'показан экран «не удалось проверить»');
  ok(/Страница релизов/.test($('upd-actions').textContent), 'кнопка «Страница релизов» присутствует');
  ok(/Повторить/.test($('upd-actions').textContent), 'кнопка «Повторить» присутствует');
  // b) fetch отвечает: есть новая версия → предложение скачать
  win.fetch = function () {
    return Promise.resolve({
      ok: true,
      json: function () {
        return Promise.resolve({
          tag_name: 'v99.0.0',
          assets: [
            { name: 'MikroTik-Guide-v99.0.0.apk', browser_download_url: 'https://example.com/a.apk' },
            { name: 'MikroTik-Guide-Setup-99.0.0.exe', browser_download_url: 'https://example.com/s.exe' }
          ]
        });
      }
    });
  };
  $('btn_update').dispatchEvent(new win.Event('click', { bubbles: true }));
  await delay(40);
  ok(/Доступна версия 99\.0\.0/.test($('upd-title').textContent), 'найдено обновление 99.0.0');
  ok(/Скачать/.test($('upd-actions').textContent), 'кнопка скачивания показана');
  ok(/99\.0\.0/.test($('upd-body').textContent), 'текст содержит новую версию');
  // c) версия та же → «последняя версия»
  win.fetch = function () {
    return Promise.resolve({
      ok: true,
      json: function () { return Promise.resolve({ tag_name: 'v' + win.APP_VERSION, assets: [] }); }
    });
  };
  $('btn_update').dispatchEvent(new win.Event('click', { bubbles: true }));
  await delay(40);
  ok(/последняя версия/.test($('upd-title').textContent), 'актуальная версия → «У вас последняя версия»');
  // d) закрытие
  $('upd_close').dispatchEvent(new win.Event('click', { bubbles: true }));
  ok($('upd-modal').hidden === true, 'диалог закрывается');

  console.log('== Навигация ==');
  const navItems = doc.getElementById('nav').children;
  const navInitial = Array.from(navItems).find(item => item.dataset.sec === 'initial');
  const secId = navInitial.dataset.sec;
  win.location.hash = '#' + secId;
  await delay(80);
  if ($('topbar-title').textContent !== 'Подключение провайдера') {
    // jsdom не всегда эмулирует hashchange по клику на <a> — диспатчим событие вручную
    win.dispatchEvent(new win.Event('hashchange'));
    await delay(30);
  }
  ok(win.location.hash === '#' + secId, 'hash обновлён: ' + win.location.hash);
  ok($('topbar-title').textContent === 'Подключение провайдера',
    'заголовок топбара соответствует разделу: ' + $('topbar-title').textContent);
  ok(navInitial.classList.contains('active'), 'раздел активен в меню');
  ok(doc.getElementById('content').children.length > 0, 'раздел отрендерен после перехода');

  ok(scriptErrors.length === 0, 'итог: ошибок скриптов нет' + (scriptErrors.length ? ': ' + scriptErrors.join(' | ') : ''));

  console.log('============================');
  console.log('DOM-тест: ' + passed + ' ok, ' + failed + ' failed');
  win.close();
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error('✗ Критическая ошибка DOM-теста:', e);
  process.exit(1);
});
