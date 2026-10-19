'use strict';
const path = require('node:path');
const fs = require('node:fs');
const { app, BrowserWindow, ipcMain, screen, Tray, Menu, nativeTheme } = require('electron');
const { CodexClient } = require('./codex-client.cjs');
const { resizeRequest } = require('./window-layout.cjs');
const { loadPreferences, savePreferences } = require('./preferences.cjs');
let mainWindow, tray, codex, pollTimer, pollPromise;
let snapshot = null, settings, preferencesPath;
let status = { level: 'connecting', message: '正在连接本机 Codex…' };
let quitting = false;
const WIDTHS = { apple: 376, pill: 540, fluent: 404, mini: 158 };

function send(channel, value) {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(channel, value);
}
function setStatus(value) { status = value; send('quota:status', value); }
function clampBounds(width, height, anchorRight = false) {
  const area = screen.getDisplayMatching(mainWindow.getBounds()).workArea;
  width = Math.min(width, area.width);
  height = Math.min(height, area.height);
  const bounds = mainWindow.getBounds();
  mainWindow.setBounds({ width, height, x: Math.max(area.x, Math.min(anchorRight ? bounds.x + bounds.width - width : bounds.x, area.x + area.width - width)), y: Math.max(area.y, Math.min(bounds.y, area.y + area.height - height)) });
}
function showWindow() { mainWindow.show(); mainWindow.focus(); }
function refreshTray() {
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: '显示额度窗口', click: showWindow },
    { label: '立即刷新', click: () => refresh().catch(() => {}) },
    { type: 'separator' },
    { label: '始终置顶', type: 'checkbox', checked: settings.alwaysOnTop, click: item => updateSettings({ alwaysOnTop: item.checked }) },
    { type: 'separator' },
    { label: '退出 Codex Quota', click: () => { quitting = true; app.quit(); } },
  ]));
}
function createWindow() {
  const area = screen.getPrimaryDisplay().workArea;
  let position = {};
  try {
    const saved = JSON.parse(fs.readFileSync(path.join(app.getPath('userData'), 'window-position.json'), 'utf8'));
    if (Number.isFinite(saved.x) && Number.isFinite(saved.y)) position = { x: saved.x, y: saved.y };
  } catch {}
  mainWindow = new BrowserWindow({
    width: WIDTHS[settings.style], height: 330,
    x: area.x + area.width - WIDTHS[settings.style] - 24, y: area.y + 24, ...position,
    frame: false, transparent: true, backgroundColor: '#00000000',
    resizable: false, maximizable: false, fullscreenable: false,
    alwaysOnTop: settings.alwaysOnTop, skipTaskbar: true, show: false,
    title: 'Codex Quota', icon: path.join(__dirname, '../assets/icon.ico'),
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  mainWindow.setAlwaysOnTop(settings.alwaysOnTop, 'floating');
  clampBounds(WIDTHS[settings.style], 330);
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('will-navigate', event => event.preventDefault());
  mainWindow.loadFile(path.join(__dirname, 'renderer/index.html'));
  mainWindow.once('ready-to-show', () => mainWindow.showInactive());
  mainWindow.on('close', event => { if (!quitting) { event.preventDefault(); mainWindow.hide(); } });
  let moveTimer;
  mainWindow.on('moved', () => {
    clearTimeout(moveTimer);
    moveTimer = setTimeout(() => {
      if (mainWindow.isDestroyed()) return;
      const bounds = mainWindow.getBounds();
      const x = settings.style === 'mini' ? bounds.x + bounds.width - WIDTHS.mini : bounds.x;
      const y = bounds.y;
      try { fs.writeFileSync(path.join(app.getPath('userData'), 'window-position.json'), JSON.stringify({ x, y })); } catch {}
    }, 300);
  });
  screen.on('display-removed', () => { const bounds = mainWindow.getBounds(); clampBounds(bounds.width, bounds.height); });
  tray = new Tray(path.join(__dirname, '../assets/icon.ico'));
  tray.setToolTip('Codex Quota · 本机额度');
  tray.on('double-click', showWindow);
  tray.on('click', () => mainWindow.isVisible() ? mainWindow.hide() : showWindow());
  refreshTray();
}
function configurePoll() {
  clearInterval(pollTimer);
  pollTimer = setInterval(() => refresh().catch(() => {}), settings.refreshSeconds * 1000);
}
function updateSettings(patch) {
  const next = savePreferences(preferencesPath, { ...settings, ...patch });
  settings = next;
  nativeTheme.themeSource = next.theme;
  mainWindow.setAlwaysOnTop(next.alwaysOnTop, 'floating');
  if (next.style !== 'mini') clampBounds(WIDTHS[next.style], mainWindow.getBounds().height);
  configurePoll();
  refreshTray();
  send('settings:changed', settings);
  return settings;
}
function refresh() {
  if (pollPromise) return pollPromise;
  pollPromise = (async () => {
    setStatus({ level: 'connecting', message: '正在读取额度…' });
    try {
      if (!codex) {
        codex = new CodexClient();
        codex.on('snapshot', value => {
          snapshot = value;
          setStatus({ level: 'ok', message: 'Codex 已连接' });
          send('quota:snapshot', value);
        });
        codex.on('status', value => setStatus(value));
      }
      if (!codex.ready) await codex.start();
      else await codex.refresh();
      return snapshot;
    } catch (error) {
      setStatus({ level: 'error', message: error.message });
      codex?.close();
      codex = null;
      throw error;
    }
  })().finally(() => { pollPromise = null; });
  return pollPromise;
}
function registerIpc() {
  ipcMain.handle('quota:bootstrap', () => ({ snapshot, status, settings }));
  ipcMain.handle('quota:refresh', () => refresh());
  ipcMain.handle('settings:update', (_event, patch) => {
    if (!patch || typeof patch !== 'object' || Array.isArray(patch)) throw new Error('设置无效');
    return updateSettings(patch);
  });
  ipcMain.handle('window:resize', (_event, request) => {
    const size = resizeRequest(settings.style, request);
    if (size) clampBounds(size.width, size.height, settings.style === 'mini');
  });
  ipcMain.handle('window:hide', () => mainWindow.hide());
  ipcMain.handle('app:quit', () => { quitting = true; app.quit(); });
}
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => { if (mainWindow) showWindow(); });
  app.whenReady().then(() => {
    preferencesPath = path.join(app.getPath('userData'), 'preferences.json');
    settings = loadPreferences(preferencesPath);
    nativeTheme.themeSource = settings.theme;
    registerIpc();
    createWindow();
    configurePoll();
    refresh().catch(() => {});
  });
  app.on('before-quit', () => { quitting = true; clearInterval(pollTimer); codex?.close(); });
  app.on('window-all-closed', () => app.quit());
}
