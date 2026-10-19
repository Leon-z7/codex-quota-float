const { contextBridge } = require('electron');
let settings = { style: 'apple', theme: 'light', alwaysOnTop: true, refreshSeconds: 60 };
const callbacks = {};
const snapshot = {
  planType: 'plus', updatedAt: new Date().toISOString(),
  buckets: [{ limitId: 'codex', limitName: 'Codex', primary: { usedPercent: 25, windowDurationMins: 300, resetsAt: Date.now()/1000+9900 }, secondary: { usedPercent: 58, windowDurationMins: 10080, resetsAt: Date.now()/1000+182000 } }],
};
contextBridge.exposeInMainWorld('quotaApp', {
  bootstrap: async () => ({ snapshot, status: { level: 'ok', message: '已连接' }, settings }),
  refresh: async () => snapshot,
  updateSettings: async patch => { settings = { ...settings, ...patch }; return settings; },
  resize: async () => {},
  hide: async () => {},
  quit: async () => {},
  onSnapshot: cb => { callbacks.snapshot = cb; },
  onStatus: cb => { callbacks.status = cb; },
  onSettings: cb => { callbacks.settings = cb; },
});
contextBridge.exposeInMainWorld('previewTest', {
  snapshot: value => callbacks.snapshot(value),
  status: value => callbacks.status(value),
});
