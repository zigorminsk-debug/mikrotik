/* Предзагрузка окна Electron: безопасное API прямого подключения к MikroTik.
   Доступно в мире страницы как window.mikrotik (через contextBridge).
   Сетевые сокеты viven только в главном процессе (main.js) — рендерер остаётся
   в песочнице (sandbox: true, nodeIntegration: false). */
'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('mikrotik', {
  open: (host, port, ssl, user, pass) =>
    ipcRenderer.invoke('mt:open', host, port, ssl, user, pass),
  send: (id, words) => ipcRenderer.invoke('mt:send', id, words),
  close: (id) => ipcRenderer.invoke('mt:close', id),

  /* ---------- QEMU CHR ---------- */
  qemuList: () => ipcRenderer.invoke('qemu:list'),
  qemuStart: (config) => ipcRenderer.invoke('qemu:start', config),
  qemuStop: (id) => ipcRenderer.invoke('qemu:stop', id),
  qemuStatus: (id) => ipcRenderer.invoke('qemu:status', id)
});
