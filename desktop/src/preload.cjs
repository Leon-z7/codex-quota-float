'use strict';
const { contextBridge, ipcRenderer } = require('electron');
function subscribe(channel, callback) {
  const handler = (_event, value) => callback(value);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
}
contextBridge.exposeInMainWorld('quotaApp', {
  bootstrap: () => ipcRenderer.invoke('quota:bootstrap'),
  refresh: () => ipcRenderer.invoke('quota:refresh'),
  updateSettings: value => ipcRenderer.invoke('settings:update', value),
  resize: height => ipcRenderer.invoke('window:resize', height),
  hide: () => ipcRenderer.invoke('window:hide'),
  quit: () => ipcRenderer.invoke('app:quit'),
  onSnapshot: callback => subscribe('quota:snapshot', callback),
  onStatus: callback => subscribe('quota:status', callback),
  onSettings: callback => subscribe('settings:changed', callback),
  onPointer: callback => subscribe('window:pointer', callback),
});
