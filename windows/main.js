/* Окно приложения и изолированная виртуальная CHR для Windows. */
'use strict';
const { app, BrowserWindow, shell, dialog, ipcMain, clipboard } = require('electron');
const fs = require('fs').promises;
const path = require('path');
const { randomBytes } = require('crypto');
const engine = require('./www/js/lab-sim');
const { makePlan } = require('./chr/plan');
const { validateDualInternet } = require('./chr/online');
const { networkWarning } = require('./chr/network-warning');
const { ensureImage } = require('./chr/download');
const { ChrSession } = require('./chr/session');
const physicalDiscovery = require('./physical/mndp');
const {openWinbox} = require('./physical/open-winbox');
const {spawn} = require('child_process');

let mainWindow = null, chrWindow = null, active = null, launching = false, quitting = false, cleanupFailed = false;
const sessionsRoot = () => path.join(app.getPath('userData'), 'chr-sessions');
function publishStatus(text) { if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('chr:status', text); }

async function removeStale(root, pattern) {
  let entries;
  try { entries = await fs.readdir(root, {withFileTypes:true}); }
  catch (e) { if (e.code === 'ENOENT') return; throw e; }
  for (const entry of entries) {
    if (entry.isDirectory() && pattern.test(entry.name))
      await fs.rm(path.join(root, entry.name), {recursive:true, force:true, maxRetries:10, retryDelay:500});
  }
}
async function staleSessions() {
  await removeStale(sessionsRoot(), /^session-[A-Za-z0-9_-]+$/);
  await removeStale(path.join(app.getPath('userData'), 'chr-cache'), /^\.chr-[A-Za-z0-9_-]+$/);
}
async function closeChr() {
  const s = active; active = null;
  if (chrWindow && !chrWindow.isDestroyed()) { const w = chrWindow; chrWindow = null; w.destroy(); }
  if (s) await s.stop();
}
async function licenseConsent(online) {
  while (mainWindow && !mainWindow.isDestroyed()) {
    const answer = await dialog.showMessageBox(mainWindow, {
      type:'info', title:'Лицензия RouterOS CHR',
      message:'Перед первой загрузкой ознакомьтесь с условиями MikroTik.',
      detail:'Официальный образ CHR 7.23.8 будет загружен с download.mikrotik.com и проверен по SHA-256. ' + (online ? 'ВМ сможет обращаться к интернету, компьютеру и локальной сети через Windows.' : 'ВМ изолирована от физической сети и интернета.') + ' Выбранные клиентские устройства и провайдеры не запускаются как ВМ. Все изменения в CHR удаляются при закрытии окна. Бесплатная лицензия CHR ограничивает скорость.',
      buttons:['Открыть условия MikroTik', 'Согласен и запустить', 'Отмена'], defaultId:0, cancelId:2, noLink:true
    });
    if (answer.response === 0) { await shell.openExternal('https://mikrotik.com/software/legal'); continue; }
    return answer.response === 1;
  }
  return false;
}
function openChrWindow(info, vm) {
  const expected = new URL(info.url);
  if (expected.protocol !== 'http:' || expected.hostname !== '127.0.0.1' || !expected.port) throw new Error('Недопустимый адрес виртуальной CHR');
  const win = new BrowserWindow({width:1280, height:840, minWidth:760, minHeight:500, title:'Виртуальная RouterOS CHR', autoHideMenuBar:true,
    webPreferences:{sandbox:true, contextIsolation:true, nodeIntegration:false, partition:'chr-' + randomBytes(16).toString('hex')}});
  chrWindow = win;
  const allowed = address => { try { const u = new URL(address); return (u.protocol === 'http:' || u.protocol === 'ws:') && u.hostname === '127.0.0.1' && u.port === expected.port; } catch (_) { return false; } };
  win.webContents.session.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
  win.webContents.session.webRequest.onBeforeRequest({urls:['<all_urls>']}, (request, callback) => callback({cancel: !allowed(request.url)}));
  win.webContents.setWindowOpenHandler(() => ({action:'deny'}));
  win.webContents.on('will-navigate', (event, url) => { if (!allowed(url)) event.preventDefault(); });
  win.webContents.on('will-redirect', (event, url) => { if (!allowed(url)) event.preventDefault(); });
  win.on('closed', () => {
    if (chrWindow === win) chrWindow = null;
    if (active === vm) { active = null; vm.stop().then(() => publishStatus('Виртуальная RouterOS закрыта; временный диск удалён.')).catch(() => { publishStatus('Не удалось удалить временные данные CHR.'); if (mainWindow && !mainWindow.isDestroyed()) dialog.showErrorBox('Очистка CHR', 'Не удалось удалить временные данные CHR. Закройте приложение и удалите папку chr-sessions из его данных.'); }); }
  });
  win.loadURL(info.url).catch(() => { if (!win.isDestroyed()) win.close(); });
}
ipcMain.handle('chr:launch', async (event, routerId, state) => {
  if (process.platform !== 'win32' || !mainWindow || event.sender !== mainWindow.webContents || event.senderFrame !== mainWindow.webContents.mainFrame) return {ok:false, message:'Виртуальная CHR доступна только в окне приложения Windows.'};
  if (cleanupFailed) return {ok:false, message:'Не удалось очистить временные данные CHR. Закройте приложение и проверьте папки chr-sessions и chr-cache в его данных.'};
  if (launching || active) return {ok:false, message:'Виртуальная CHR уже запущена или запускается. Закройте её окно перед новым запуском.'};
  if (!app.isPackaged) return {ok:false, message:'Для виртуальной CHR требуется собранный Windows-установщик с QEMU.'};
  launching = true;
  const status = text => { if (!event.sender.isDestroyed()) event.sender.send('chr:status', text); };
  mainWindow.setProgressBar(2, {mode:'indeterminate'});
  try {
    status('Проверка проекта виртуальной RouterOS…');
    if (typeof routerId !== 'string' || routerId.length > 128 || !state || Buffer.byteLength(JSON.stringify(state), 'utf8') > 256000) throw new Error('Недопустимый размер или формат проекта.');
    const plan = makePlan(engine, state, routerId, {allowDualStaticWan:true});
    if (plan.blockers.length) return {ok:false, message:plan.blockers.join('\n')};
    const online = Array.isArray(plan.expected.wans) && plan.expected.wans.length === 2;
    if (online) {
      if (!validateDualInternet(plan.expected)) return {ok:false, message:'Этот интернет-режим пока поддерживает только два виртуальных статических WAN: ether1 — 10.0.2.20/24, шлюз 10.0.2.2; ether4 — 10.0.3.20/24, шлюз 10.0.3.2; DNS 10.0.2.3 и 10.0.3.3. Порты зависят от порядка подключения на схеме. Программа не заменяет выбранные адреса. Настоящие независимые провайдеры, DHCP и PPPoE пока не поддерживаются.'};
      const networkChoice = await dialog.showMessageBox(mainWindow, networkWarning());
      if (networkChoice.response !== 1 || quitting || !mainWindow || mainWindow.isDestroyed()) return {ok:false, cancelled:true};
    }
    status('Ознакомьтесь с условиями лицензии MikroTik.');
    if (!await licenseConsent(online)) return {ok:false, cancelled:true};
    const qemu = path.join(process.resourcesPath, 'qemu', 'qemu-system-x86_64.exe');
    const supervisor = path.join(process.resourcesPath, 'chr-supervisor.exe');
    await Promise.all([fs.access(qemu), fs.access(supervisor)]);
    status('Проверка или загрузка официального образа CHR. При первом запуске это может занять несколько минут…');
    const image = await ensureImage(path.join(app.getPath('userData'), 'chr-cache'), true);
    if (quitting || !mainWindow || mainWindow.isDestroyed()) return {ok:false, cancelled:true};
    const vm = new ChrSession({qemu, image, supervisor, tempRoot:sessionsRoot(), internetConsent:online});
    active = vm;
    status('Запуск CHR, применение и проверка настроек. Это может занять несколько минут…');
    const info = await vm.start(plan);
    vm.exitPromise.then(() => {
      if (active === vm && !quitting) closeChr().then(() => { if (mainWindow && !mainWindow.isDestroyed()) dialog.showErrorBox('Виртуальная RouterOS', 'Виртуальная CHR неожиданно завершилась.'); }).catch(() => { if (mainWindow && !mainWindow.isDestroyed()) dialog.showErrorBox('Очистка CHR', 'Не удалось очистить временные данные CHR.'); });
    });
    if (quitting || !mainWindow || mainWindow.isDestroyed()) { await closeChr(); return {ok:false, cancelled:true}; }
    const choice = await dialog.showMessageBox(mainWindow, {type:'info', title:'Виртуальная RouterOS готова',
      message:online ? 'Настройки проверены в CHR с двумя виртуальными WAN.' : 'Базовые настройки проверены в изолированной CHR.',
      detail:'Логин: admin\nВременный пароль: ' + info.password + '\n\nПри закрытии окна виртуальный диск будет удалён. ' + (online ? 'Оба WAN используют сеть Windows. Клиенты и независимые провайдеры схемы не эмулируются; доступ к компьютеру и локальной сети возможен.' : 'Интернет, клиенты и провайдеры схемы не эмулируются.') + (plan.expected.ntp ? ' Параметры NTP и часовой пояс проверены, но синхронизация времени и доступность сервера не проверялись.' : ''),
      buttons:['Скопировать пароль и открыть', 'Открыть без копирования', 'Закрыть CHR'], defaultId:0, cancelId:2, noLink:true});
    if (choice.response === 2 || active !== vm || quitting) { await closeChr(); return {ok:false, cancelled:true}; }
    if (choice.response === 0) {
      clipboard.writeText(info.password);
      setTimeout(() => { try { if (clipboard.readText() === info.password) clipboard.clear(); } catch (_) {} }, 60000).unref();
    }
    openChrWindow(info, vm);
    return {ok:true};
  } catch (error) {
    try { await closeChr(); } catch (_) { return {ok:false, message:'Ошибка CHR; не удалось очистить временные данные. Закройте приложение и удалите папку chr-sessions из его данных.'}; }
    return {ok:false, message:'Не удалось открыть виртуальную RouterOS: ' + (error && error.message ? error.message : 'неизвестная ошибка')};
  } finally { launching = false; if (mainWindow && !mainWindow.isDestroyed()) mainWindow.setProgressBar(-1); }
});
// Local read-only MNDP discovery. MAC and identity advertisements are unauthenticated.
let physicalScanning = false;
function trustedMain(event) { return process.platform === 'win32' && mainWindow && event.sender === mainWindow.webContents && event.senderFrame === mainWindow.webContents.mainFrame; }
ipcMain.handle('physical:interfaces', async event => {
  if (!trustedMain(event)) return {ok:false,message:'Поиск доступен только в окне приложения Windows.'};
  try { return {ok:true,interfaces:physicalDiscovery.interfaces()}; }
  catch (_) { return {ok:false,message:'Не удалось получить список сетевых адаптеров.'}; }
});
ipcMain.handle('physical:discover', async (event,name,address) => {
  if (!trustedMain(event)) return {ok:false,message:'Недопустимый источник запроса.'};
  if (physicalScanning) return {ok:false,message:'Поиск уже выполняется.'};
  if (typeof name !== 'string' || name.length > 200 || typeof address !== 'string' || address.length > 15 || !physicalDiscovery.interfaces().some(x=>x.name===name && x.address===address)) return {ok:false,message:'Выберите доступный сетевой адаптер.'};
  physicalScanning = true;
  try {
    const choice=await dialog.showMessageBox(mainWindow,{type:'warning',title:'Поиск физических MikroTik',message:'Отправить запрос обнаружения в выбранную локальную сеть?',detail:'Адаптер: '+name+' ('+address+'). Будет отправлен локальный широковещательный UDP-запрос MNDP на порт 5678. Это только поиск: приложение не подключается, не сбрасывает и не меняет роутер. Устройства могут сообщать недостоверные MAC и названия; сверьте MAC на корпусе. Ответы могут поступить и через другие адаптеры.',buttons:['Отмена','Искать'],defaultId:0,cancelId:0,noLink:true});
    if(choice.response!==1 || quitting || !mainWindow || mainWindow.isDestroyed())return {ok:false,cancelled:true};
    const devices=await physicalDiscovery.discover(name,address);
    return {ok:true,devices};
  } catch (_) { return {ok:false,message:'Не удалось выполнить поиск. Проверьте адаптер и доступность UDP/5678; возможно, порт занят или заблокирован Windows.'}; }
  finally { physicalScanning=false; }
});
// Explicit user action only: overwrite clipboard with a single validated MAC.
// This is not discovery, device authentication, a connection or a router command.
ipcMain.handle('physical:copy-mac', async (event, mac) => {
  if (!trustedMain(event)) return {ok:false,message:'Недопустимый источник запроса.'};
  if (typeof mac !== 'string' || !/^(?:[0-9a-f]{2}:){5}[0-9a-f]{2}$/i.test(mac) || (parseInt(mac.slice(0,2),16)&1) || /^00(?::00){5}$/i.test(mac))
    return {ok:false,message:'Введите одноадресный MAC в формате AA:BB:CC:DD:EE:FF.'};
  try {clipboard.writeText(mac.toUpperCase());return {ok:true};}
  catch (_) {return {ok:false,message:'Не удалось скопировать MAC в буфер обмена Windows.'};}
});
// This starts a user-selected external application only; it cannot send
// commands or credentials, or determine whether any router login succeeds.
let openingWinbox=false;
ipcMain.handle('physical:open-winbox', async event => {
  if (!trustedMain(event)) return {ok:false,message:'Недопустимый источник запроса.'};
  if (openingWinbox) return {ok:false,message:'Выбор WinBox уже выполняется.'};
  openingWinbox=true;
  try {return await openWinbox({dialog,owner:mainWindow,fs,spawn,isStopped:()=>quitting||!mainWindow||mainWindow.isDestroyed()});}
  finally {openingWinbox=false;}
});
// Only the trusted main renderer can request a save; the user chooses the path.
ipcMain.handle('diagram:save', async (event, format, bytes) => {
  if (!mainWindow || event.sender !== mainWindow.webContents || event.senderFrame !== mainWindow.webContents.mainFrame) return {ok:false,message:'Недопустимый источник сохранения.'};
  if ((format !== 'png' && format !== 'gif') || !ArrayBuffer.isView(bytes) || bytes.byteLength > 20 * 1024 * 1024 || bytes.byteLength < 8) return {ok:false,message:'Недопустимый формат или размер изображения.'};
  const data = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const valid = format === 'png' ? data.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])) : data.subarray(0,6).toString('ascii') === 'GIF89a';
  if (!valid) return {ok:false,message:'Содержимое файла не соответствует формату.'};
  try {
    const result = await dialog.showSaveDialog(mainWindow, {title:'Сохранить схему',defaultPath:'MikroTik-схема.' + format,filters:[{name:format.toUpperCase(),extensions:[format]}]});
    if (result.canceled || !result.filePath) return {ok:false,cancelled:true};
    await fs.writeFile(result.filePath, data); return {ok:true};
  } catch (_) { return {ok:false,message:'Не удалось записать файл. Проверьте доступ к выбранной папке.'}; }
});
function createWindow() {
  mainWindow = new BrowserWindow({width:1280, height:860, minWidth:860, minHeight:560, backgroundColor:'#0f172a', title:'Учебник MikroTik', autoHideMenuBar:false,
    webPreferences:{contextIsolation:true, nodeIntegration:false, sandbox:true, preload:path.join(__dirname,'preload.js')}});
  mainWindow.loadFile(path.join(__dirname,'www','index.html'));
  mainWindow.webContents.setWindowOpenHandler(({url}) => { if (/^https?:/i.test(url)) shell.openExternal(url); return {action:'deny'}; });
  mainWindow.webContents.on('will-navigate', (event, url) => { if (/^https?:/i.test(url)) { event.preventDefault(); shell.openExternal(url); } });
  mainWindow.on('closed', () => { mainWindow = null; if (!quitting) { quitting = true; closeChr().finally(() => app.quit()); } });
}
if (!app.requestSingleInstanceLock()) app.quit();
else app.whenReady().then(async () => {
  try { await staleSessions(); } catch (_) { cleanupFailed = true; dialog.showErrorBox('Очистка CHR', 'Не удалось очистить временные диски виртуальной CHR. Проверьте папку chr-sessions в данных приложения.'); }
  createWindow();
  app.on('second-instance', () => { if (mainWindow) { if (mainWindow.isMinimized()) mainWindow.restore(); mainWindow.focus(); } });
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('before-quit', event => {
  if (!quitting && active) { event.preventDefault(); quitting = true; closeChr().finally(() => app.quit()); }
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
