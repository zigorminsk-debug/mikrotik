'use strict';
const { contextBridge, ipcRenderer } = require('electron');
// Narrow bridge: the renderer can submit a lab state, never executable paths or commands.
contextBridge.exposeInMainWorld('routerOS', Object.freeze({
  launch: (routerId, state) => ipcRenderer.invoke('chr:launch', routerId, state)
}));
