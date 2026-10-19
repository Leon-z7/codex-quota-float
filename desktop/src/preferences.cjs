'use strict';
const fs = require('node:fs');
const DEFAULTS = Object.freeze({ style: 'apple', theme: 'system', alwaysOnTop: true, refreshSeconds: 60 });
function sanitize(input = {}) {
  return {
    style: ['apple', 'pill', 'fluent', 'mini', 'percent'].includes(input.style) ? input.style : DEFAULTS.style,
    theme: ['system', 'light', 'dark'].includes(input.theme) ? input.theme : DEFAULTS.theme,
    alwaysOnTop: typeof input.alwaysOnTop === 'boolean' ? input.alwaysOnTop : DEFAULTS.alwaysOnTop,
    refreshSeconds: [30, 60, 120, 300].includes(input.refreshSeconds) ? input.refreshSeconds : DEFAULTS.refreshSeconds,
  };
}
function loadPreferences(file) {
  try { return sanitize(JSON.parse(fs.readFileSync(file, 'utf8'))); }
  catch { return { ...DEFAULTS }; }
}
function savePreferences(file, value) {
  const clean = sanitize(value);
  const temp = file + '.tmp';
  fs.writeFileSync(temp, JSON.stringify(clean, null, 2));
  fs.renameSync(temp, file);
  return clean;
}
module.exports = { DEFAULTS, sanitize, loadPreferences, savePreferences };
