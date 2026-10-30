/* Окно приложения и изолированная виртуальная CHR для Windows. */
'use strict';
const { app, BrowserWindow, shell, dialog, ipcMain, clipboard } = require('electron');
const fs = require('fs').promises;
const path = require('path');
const { randomBytes } = require('crypto');
const engine = require('./www/js/lab-sim');
const { makePlan } = require('./chr/plan');
const { ensureImage } = require('./chr/download');
const { ChrSession } = require('./chr/session');

let mainWindow = null, chrWindow = null, active = null, launching = false, quitting = false;
const sessionsRoot = () => path.join(app.getPath('userData'), 'chr-sessions');

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
async function licenseConsent() {
  while (mainWindow && !mainWindow.isDestroyed()) {
    const answer = await dialog.showMessageBox(mainWindow, {
      type:'info', title:'Лицензия RouterOS CHR',
      message:'Перед первой загрузкой ознакомьтесь с условиями MikroTik.',
      detail:'Официальный образ CHR 7.23.8 будет загружен с download.mikrotik.com и проверен по SHA-256. ВМ изолирована от физической сети и интернета. Выбранные клиентские устройства и провайдеры не запускаются как ВМ. Все изменения в CHR удаляются при закрытии окна. Бесплатная лицензия CHR ограничивает скорость.',
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
    if (active === vm) { active = null; vm.stop().catch(() => { if (mainWindow && !mainWindow.isDestroyed()) dialog.showErrorBox('Очистка CHR', 'Не удалось удалить временные данные CHR. Закройте приложение и удалите папку chr-sessions из его данных.'); }); }
  });
  win.loadURL(info.url).catch(() => { if (!win.isDestroyed()) win.close(); });
}
ipcMain.handle('chr:launch', async (event, routerId, state) => {
  if (process.platform !== 'win32' || !mainWindow || event.sender !== mainWindow.webContents || event.senderFrame !== mainWindow.webContents.mainFrame) return {ok:false, message:'Виртуальная CHR доступна только в окне приложения Windows.'};
  if (launching || active) return {ok:false, message:'Виртуальная CHR уже запущена или запускается. Закройте её окно перед новым запуском.'};
  if (!app.isPackaged) return {ok:false, message:'Для виртуальной CHR требуется собранный Windows-установщик с QEMU.'};
  launching = true;
  try {
    if (typeof routerId !== 'string' || routerId.length > 128 || !state || Buffer.byteLength(JSON.stringify(state), 'utf8') > 256000) throw new Error('Недопустимый размер или формат проекта.');
    const plan = makePlan(engine, state, routerId);
    if (plan.blockers.length) return {ok:false, message:plan.blockers.join('\n')};
    if (!await licenseConsent()) return {ok:false, cancelled:true};
    const qemu = path.join(process.resourcesPath, 'qemu', 'qemu-system-x86_64.exe');
    const supervisor = path.join(process.resourcesPath, 'chr-supervisor.exe');
    await Promise.all([fs.access(qemu), fs.access(supervisor)]);
    const image = await ensureImage(path.join(app.getPath('userData'), 'chr-cache'), true);
    if (quitting || !mainWindow || mainWindow.isDestroyed()) return {ok:false, cancelled:true};
    const vm = new ChrSession({qemu, image, supervisor, tempRoot:sessionsRoot()});
    active = vm;
    const info = await vm.start(plan);
    vm.exitPromise.then(() => {
      if (active === vm && !quitting) closeChr().then(() => { if (mainWindow && !mainWindow.isDestroyed()) dialog.showErrorBox('Виртуальная RouterOS', 'Виртуальная CHR неожиданно завершилась.'); }).catch(() => { if (mainWindow && !mainWindow.isDestroyed()) dialog.showErrorBox('Очистка CHR', 'Не удалось очистить временные данные CHR.'); });
    });
    if (quitting || !mainWindow || mainWindow.isDestroyed()) { await closeChr(); return {ok:false, cancelled:true}; }
    const choice = await dialog.showMessageBox(mainWindow, {type:'info', title:'Виртуальная RouterOS готова',
      message:'Базовые настройки проверены в изолированной CHR.',
      detail:'Логин: admin\nВременный пароль: ' + info.password + '\n\nПри закрытии окна виртуальный диск будет удалён. Интернет, клиенты и провайдеры схемы не эмулируются.',
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
  } finally { launching = false; }
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
  try { await staleSessions(); } catch (_) { dialog.showErrorBox('Очистка CHR', 'Не удалось очистить временные диски виртуальной CHR. Проверьте папку chr-sessions в данных приложения.'); }
  createWindow();
  app.on('second-instance', () => { if (mainWindow) { if (mainWindow.isMinimized()) mainWindow.restore(); mainWindow.focus(); } });
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('before-quit', event => {
  if (!quitting && active) { event.preventDefault(); quitting = true; closeChr().finally(() => app.quit()); }
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
