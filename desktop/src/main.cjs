'use strict';

const path = require('node:path');
const { app, BrowserWindow, ipcMain, screen } = require('electron');
const { CodexClient } = require('./codex-client.cjs');
const { CloudSync } = require('./cloud-sync.cjs');

let mainWindow;
let codex;
let cloud;
let lastSnapshot;

function send(channel, payload) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, payload);
  }
}

function createWindow() {
  const workArea = screen.getPrimaryDisplay().workArea;
  mainWindow = new BrowserWindow({
    width: 560,
    height: 112,
    x: workArea.x + workArea.width - 580,
    y: workArea.y + 20,
    minWidth: 440,
    minHeight: 108,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  mainWindow.setAlwaysOnTop(true, 'floating');
  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  mainWindow.once('ready-to-show', () => mainWindow.show());
}

async function startServices() {
  const userData = app.getPath('userData');
  cloud = new CloudSync({
    configPath: path.join(userData, 'cloud-config.json'),
    sessionPath: path.join(userData, 'auth-session.enc.json'),
  });
  codex = new CodexClient();
  codex.on('status', (status) => send('quota:status', status));
  codex.on('snapshot', async (snapshot) => {
    lastSnapshot = snapshot;
    send('quota:snapshot', snapshot);
    try {
      const result = await cloud.upload(snapshot);
      send('cloud:upload', result);
    } catch (error) {
      send('cloud:upload', { uploaded: false, reason: error.message });
    }
  });
  try {
    await codex.start();
  } catch (error) {
    send('quota:status', { level: 'error', message: error.message });
  }
}

app.whenReady().then(async () => {
  createWindow();
  registerIpc();
  await startServices();
});

app.on('window-all-closed', () => app.quit());
app.on('before-quit', () => codex?.close());

function registerIpc() {
  ipcMain.handle('quota:refresh', () => codex.refresh());
  ipcMain.handle('quota:last', () => lastSnapshot || null);
  ipcMain.handle('window:setExpanded', (_event, expanded) => {
    mainWindow.setSize(560, expanded ? 520 : 112, true);
    return expanded;
  });
  ipcMain.handle('window:close', () => mainWindow.close());
  ipcMain.handle('cloud:configure', (_event, config) => cloud.configure(config));
  ipcMain.handle('cloud:status', () => cloud.status());
  ipcMain.handle('cloud:signIn', (_event, credentials) =>
    cloud.signIn(credentials.email, credentials.password));
  ipcMain.handle('cloud:signUp', (_event, credentials) =>
    cloud.signUp(credentials.email, credentials.password));
  ipcMain.handle('cloud:signOut', () => cloud.signOut());
}

