/* Окно приложения: загружает общий веб-контент учебника (windows/www → ../app).
   Selain того — главный процесс сессий RouterOS API для прямого подключения
   к физическому MikroTik (порты 8728 / 8729 API-SSL). Сокеты живут только здесь;
   рендерер обращается через IPC (preload.js → window.mikrotik). */
'use strict';
const { app, BrowserWindow, shell, ipcMain } = require('electron');
const fs = require('fs');
const net = require('net');
const tls = require('tls');
const path = require('path');

const MtApi = require(mtApiPath());

function mtApiPath() {
  const dev = path.join(__dirname, '..', 'app', 'js', 'mt-api.js');
  if (fs.existsSync(dev)) return dev;
  return path.join(process.resourcesPath, 'app', 'js', 'mt-api.js');
}

let mainWindow = null;

// Сессии прямого подключения к роутерам: id → RouterSession
const sessions = new Map();
let nextSessionId = 1;

const CONNECT_TIMEOUT = 15000;
const SOCKET_TIMEOUT = 60000;

/* ---------- сессия RouterOS API ---------- */
class RouterSession {
  constructor(socket) {
    this.socket = socket;
    this.buf = Buffer.alloc(0);
    this.queue = [];     // ожидающие ответы {resolve, reject}
    this.current = null; // слова текущего предложения-ответа
    this.items = [];     // элементы !re текущего запроса
    this.closed = false;
    this.failed = null;

    socket.setNoDelay(true);
    socket.setTimeout(SOCKET_TIMEOUT);
    socket.on('data', (chunk) => this.feed(chunk));
    socket.on('error', (err) => this.fail(err));
    socket.on('timeout', () => this.fail(new Error('таймаут сокета')));
    socket.on('close', () => {
      if (!this.closed) this.fail(new Error('соединение закрыто роутером'));
    });
  }

  fail(err) {
    if (this.failed) return;
    this.failed = err;
    this.closed = true;
    try { this.socket.destroy(); } catch (e) {}
    const item = this.queue.shift();
    if (item) item.reject(err);
    while (this.queue.length) this.queue.shift().reject(err);
  }

  close() {
    this.closed = true;
    try { this.socket.destroy(); } catch (e) {}
  }

  feed(chunk) {
    this.buf = Buffer.concat([this.buf, chunk]);
    while (this.buf.length > 0) {
      const len = this.buf[0];
      let word;
      if (len === 0xFF) {
        if (this.buf.length < 5) return;
        const n = this.buf.readUInt32BE(1);
        if (this.buf.length < 5 + n) return;
        word = this.buf.slice(5, 5 + n).toString('utf8');
        this.buf = this.buf.slice(5 + n);
      } else {
        if (this.buf.length < 1 + len) return;
        word = this.buf.slice(1, 1 + len).toString('utf8');
        this.buf = this.buf.slice(1 + len);
      }
      this.onWord(word);
    }
  }

  onWord(word) {
    if (!this.current) this.current = [];
    this.current.push(word);
    if (word.charCodeAt(0) === 0x21) { // '!' — статусное слово
      const status = word.slice(1);
      if (status === 're') {
        this.items.push(this.itemOf(this.current));
        this.current = null;
      } else {
        const item = this.queue.shift();
        if (!item) return; // не richiesto
        const last = this.items.length ? this.items[this.items.length - 1] : null;
        if (status === 'done') item.resolve({ status: 'done', items: this.items, message: '' });
        else item.resolve({ status, items: this.items, message: last ? last.message : '' });
        this.items = [];
        this.current = null;
      }
    }
  }

  itemOf(words) {
    const attrs = [];
    let message = '';
    words.forEach((w) => {
      if (w.length > 0 && w.charCodeAt(0) === 0x3D) { // '='
        const eq = w.indexOf('=');
        const a = { name: w.slice(1, eq), value: w.slice(eq + 1) };
        attrs.push(a);
        if (a.name === 'message') message = a.value;
      }
    });
    return { attrs, message };
  }

  send(words) {
    if (this.failed) return Promise.reject(this.failed);
    return new Promise((resolve, reject) => {
      this.queue.push({ resolve, reject });
      try {
        this.socket.write(MtApi.encodeSentence(words));
      } catch (err) {
        this.queue.pop();
        reject(err);
      }
    });
  }
}

/* ---------- открытие сессии (connect + логин) ---------- */
function openSession(opts) {
  return new Promise((resolve, reject) => {
    const socket = (opts.ssl ? tls : net).connect({
      host: opts.host,
      port: opts.port,
      rejectUnauthorized: false // самоподписанные сертификаты роутера
    });
    const timer = setTimeout(() => {
      socket.destroy();
      reject(new Error('таймаут подключения к ' + opts.host + ':' + opts.port));
    }, CONNECT_TIMEOUT);

    const onConnect = () => {
      clearTimeout(timer);
      const session = new RouterSession(socket);
      session.send(MtApi.loginPassword(opts.user, opts.pass)).then((rep) => {
        let chain = Promise.resolve(rep);
        if (rep.status === 'done') {
          const challenge = (rep.items || []).find((it) =>
            (it.attrs || []).some((a) => a.name === 'ret'));
          if (challenge) {
            const ret = challenge.attrs.find((a) => a.name === 'ret').value;
            chain = session.send(MtApi.loginResponse(opts.user, ret, opts.pass));
          }
        }
        return chain.then((rep2) => {
          if (rep2.status !== 'done') throw new Error(rep2.message || 'ошибка логина');
          const id = nextSessionId++;
          sessions.set(id, session);
          resolve(id);
        });
        }).catch((err) => {
        session.close();
        reject(err);
      });
    };

    socket.once('secureConnect', onConnect);
    socket.once('connect', onConnect);
    socket.once('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

ipcMain.handle('mt:open', async (event, opts) => openSession(opts || {}));
ipcMain.handle('mt:send', async (event, id, words) => {
  const session = sessions.get(id);
  if (!session) throw new Error('сессия не найдена или закрыта');
  return session.send(words);
});
ipcMain.handle('mt:close', async (event, id) => {
  const session = sessions.get(id);
  if (session) {
    session.close();
    sessions.delete(id);
  }
});

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 860,
    minHeight: 560,
    backgroundColor: '#0f172a',
    title: 'Учебник MikroTik',
    autoHideMenuBar: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'www', 'index.html'));

  // внешние ссылки открываем в системном браузере (ссылки обновлений и т.п.)
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (/^https?:/i.test(url)) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
    sessions.forEach((session) => session.close());
    sessions.clear();
  });
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
