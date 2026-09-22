'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('quotaApp', {
  refresh: () => ipcRenderer.invoke('quota:refresh'),
  lastSnapshot: () => ipcRenderer.invoke('quota:last'),
  setExpanded: (expanded) => ipcRenderer.invoke('window:setExpanded', expanded),
  close: () => ipcRenderer.invoke('window:close'),
  configureCloud: (config) => ipcRenderer.invoke('cloud:configure', config),
  cloudStatus: () => ipcRenderer.invoke('cloud:status'),
  signIn: (credentials) => ipcRenderer.invoke('cloud:signIn', credentials),
  signUp: (credentials) => ipcRenderer.invoke('cloud:signUp', credentials),
  signOut: () => ipcRenderer.invoke('cloud:signOut'),
  onSnapshot: (callback) => ipcRenderer.on('quota:snapshot', (_event, value) => callback(value)),
  onStatus: (callback) => ipcRenderer.on('quota:status', (_event, value) => callback(value)),
  onCloudUpload: (callback) => ipcRenderer.on('cloud:upload', (_event, value) => callback(value)),
});

