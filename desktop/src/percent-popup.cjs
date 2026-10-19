'use strict';
const path = require('node:path');
const { popupBounds } = require('./window-layout.cjs');

// The capsule and dropdown have separate native surfaces. Opening a dropdown
// never moves/resizes the capsule, even between IPC delivery and a compositor frame.
class PercentPopup {
  constructor({ BrowserWindow, screen, owner, settings, dismiss }) {
    Object.assign(this, { BrowserWindow, screen, owner, settings, dismiss });
    this.window = null;
    this.height = 600;
    this.version = 0;
    this.open = false;
    this.hold = false;
    this.keyboard = false;
  }
  async ensure() {
    if (this.loading) return this.loading;
    if (this.window && !this.window.isDestroyed()) return;
    const win = this.window = new this.BrowserWindow({
      width: 324, height: 624, frame: false, transparent: true,
      backgroundColor: '#00000000', show: false, skipTaskbar: true,
      parent: this.owner(), resizable: false, maximizable: false, fullscreenable: false,
      alwaysOnTop: this.settings().alwaysOnTop, title: 'Codex Quota details',
      webPreferences: { preload: path.join(__dirname, 'preload.cjs'),
        contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false },
    });
    win.setAlwaysOnTop(this.settings().alwaysOnTop, 'floating');
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    win.webContents.on('will-navigate', event => event.preventDefault());
    win.on('blur', () => {
      if (this.keyboard && !this.hold) this.dismiss();
    });
    this.loading = win.loadFile(path.join(__dirname, 'renderer/index.html'), { query: { surface: 'percent-panel' } })
      .then(() => win.webContents.executeJavaScript('window.percentPanelReady'))
      .finally(() => { this.loading = null; });
    return this.loading;
  }
  measure(height) {
    if (!Number.isFinite(height)) return;
    this.height = Math.max(80, Math.min(2000, Math.ceil(height)));
    return this.layout();
  }
  layout() {
    if (!this.window || this.window.isDestroyed()) return;
    const owner = this.owner().getBounds();
    const area = this.screen.getDisplayMatching(owner).workArea;
    const layout = popupBounds(owner, area, this.height);
    this.window.setBounds(layout.bounds);
    this.window.webContents.send('percent:layout', layout);
    return layout;
  }
  async setOpen(open, focus = false) {
    const version = ++this.version;
    clearTimeout(this.closeTimer);
    this.open = open;
    this.keyboard = open && (focus || this.keyboard);
    if (!open) {
      this.hold = false;
      if (!this.window || this.window.isDestroyed()) return;
      this.window.webContents.send('percent:state', { open: false, version });
      // Renderer acknowledges the fade; fallback also handles an unresponsive renderer.
      this.closeTimer = setTimeout(() => this.closed(version), 250);
      return;
    }
    await this.ensure();
    if (!this.open || version !== this.version) return;
    this.layout();
    this.window.showInactive();
    this.window.webContents.send('percent:state', { open: true, version, focus });
    if (focus) this.window.focus();
  }
  closed(version) {
    if (version !== this.version || this.open) return;
    clearTimeout(this.closeTimer);
    this.window?.hide();
  }
  contains(point) {
    if (this.hold || this.keyboard) return true;
    if (!this.window?.isVisible()) return false;
    const b = this.window.getBounds();
    return point.x >= b.x + 12 && point.x < b.x + b.width - 12 &&
      point.y >= b.y + 12 && point.y < b.y + b.height - 12;
  }
  hide() {
    ++this.version;
    this.open = this.hold = this.keyboard = false;
    clearTimeout(this.closeTimer);
    if (this.window && !this.window.isDestroyed()) this.window.webContents.send('percent:state', { open: false, immediate: true, version: this.version });
    this.window?.hide();
  }
  destroy() {
    this.hide();
    this.window?.destroy();
    this.window = null;
  }
}
module.exports = { PercentPopup };
