'use strict';
const { contextBridge, ipcRenderer } = require('electron');
// Narrow bridge: the renderer can submit a lab state, never executable paths or commands.
contextBridge.exposeInMainWorld('routerOS', Object.freeze({
  launch: (routerId, state) => ipcRenderer.invoke('chr:launch', routerId, state),
  launchClients: (routerId, state) => ipcRenderer.invoke('chr:launch', routerId, state, true),
  pingClient: (routerId, clientId, state, target) => ipcRenderer.invoke('chr:ping-client', routerId, clientId, state, target),
  ping: (routerId, state, target) => ipcRenderer.invoke('chr:ping', routerId, state, target),
  physicalInterfaces: () => ipcRenderer.invoke('physical:interfaces'),
  discoverPhysical: (name, address) => ipcRenderer.invoke('physical:discover', name, address),
  openWinbox: () => ipcRenderer.invoke('physical:open-winbox'),
  copyPhysicalMac: mac => ipcRenderer.invoke('physical:copy-mac', mac),
  saveDiagram: (format, bytes) => ipcRenderer.invoke('diagram:save', format, bytes),
  onClosed: callback => {
    if (typeof callback !== 'function') throw new TypeError('Expected callback');
    const handler = () => callback();
    ipcRenderer.on('chr:closed', handler);
    return () => ipcRenderer.removeListener('chr:closed', handler);
  },
  onStatus: callback => {
    if (typeof callback !== 'function') throw new TypeError('Expected callback');
    const handler = (_event, text) => callback(text);
    ipcRenderer.on('chr:status', handler);
    return () => ipcRenderer.removeListener('chr:status', handler);
  }
}));
