'use strict';
// Runs the production main/preload/renderers and real Windows BrowserWindows.
// Only quota data, preferences and cursor sampling are replaced with fixtures.
const { app, BrowserWindow, screen } = require('electron');
const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'quota-native-'));
app.setPath('userData', profile);
const preferences = require('../src/preferences.cjs');
preferences.loadPreferences = () => ({ style: 'percent', theme: 'light', alwaysOnTop: true, refreshSeconds: 60 });
const snapshot = { planType: 'plus', updatedAt: new Date().toISOString(), buckets: [{ limitId: 'codex',
  primary: { usedPercent: 25, windowDurationMins: 300, resetsAt: Date.now() / 1000 + 9900 },
  secondary: { usedPercent: 58, windowDurationMins: 10080, resetsAt: Date.now() / 1000 + 182000 } },
  { limitId: 'other', limitName: 'Other', primary: { usedPercent: 40, windowDurationMins: 300, resetsAt: Date.now() / 1000 + 9900 } }] };
require('../src/codex-client.cjs').CodexClient = class extends EventEmitter {
  async start() { this.ready = true; this.emit('snapshot', snapshot); }
  async refresh() { this.emit('snapshot', snapshot); }
  close() {}
};
let cursor = { x: -10000, y: -10000 };
app.whenReady().then(() => { screen.getCursorScreenPoint = () => cursor; });
require('../src/main.cjs');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const run = (win, code) => win.webContents.executeJavaScript(code, true);
async function until(fn, label) {
  for (let i = 0; i < 200; i++) { if (await fn()) return; await pause(20); }
  throw new Error('Timeout: ' + label);
}
app.whenReady().then(async () => {
  const out = path.resolve(__dirname, '../../artifacts/percent-native');
  fs.mkdirSync(out, { recursive: true });
  const errors = [], report = [];
  app.on('web-contents-created', (_event, contents) => {
    contents.on('console-message', (_event, detail) => { if (detail.level === 'error') errors.push(detail.message); });
  });
  try {
    const main = BrowserWindow.getAllWindows().find(w => w.getTitle() === 'Codex Quota');
    await until(async () => !main.webContents.isLoading() && await run(main, "document.body.dataset.style === 'percent' && innerHeight === 60"), 'capsule loaded');
    const area = screen.getDisplayMatching(main.getBounds()).workArea;
    const originalSize = main.getBounds();
    let moveCount = 0, resizeCount = 0;
    main.on('move', () => moveCount++); main.on('resize', () => resizeCount++);
    for (const position of [
      { x: area.x + 30, y: area.y + 30 },
      { x: area.x + area.width - originalSize.width - 4, y: area.y + 30 },
      { x: area.x + area.width - originalSize.width - 4, y: area.y + area.height - 60 },
      { x: area.x + Math.floor(area.width / 2), y: area.y + Math.floor(area.height / 2) },
    ]) {
      cursor = { x: -10000, y: -10000 }; await pause(700);
      main.setPosition(position.x, position.y); await pause(100);
      const anchor = main.getBounds(), beforeMove = moveCount, beforeResize = resizeCount;
      cursor = { x: anchor.x + anchor.width / 2, y: anchor.y + 30 };
      const popup = () => BrowserWindow.getAllWindows().find(w => w !== main);
      await until(async () => popup()?.isVisible() && await run(popup(), "document.body.dataset.transition === 'open'"), 'popup open');
      const panel = popup();
      await pause(180);
      const b = panel.getBounds();
      assert.deepEqual(main.getBounds(), anchor, 'capsule native bounds unchanged');
      assert.equal(moveCount, beforeMove, 'no native capsule move event');
      assert.equal(resizeCount, beforeResize, 'no native capsule resize event');
      assert.ok(b.x >= area.x && b.y >= area.y && b.x + b.width <= area.x + area.width && b.y + b.height <= area.y + area.height, 'popup within workarea');
      const placement = await run(panel, 'document.body.dataset.placement');
      if (position.y === area.y + area.height - 60) assert.equal(placement, 'above');
      fs.writeFileSync(path.join(out, `open-${report.length}.png`), (await panel.webContents.capturePage()).toPNG());
      await run(panel, `window.frames=[];if(!window.traceStarted){window.traceStarted=true;function trace(){frames.push({time:performance.now(),phase:document.body.dataset.transition,opacity:Number(getComputedStyle(document.querySelector('#shell')).opacity)});requestAnimationFrame(trace)};trace()}`);
      // Stay over a native draggable capsule; no DOM mouse events are injected.
      await pause(350); assert.equal(panel.isVisible(), true);
      // Activate/click a setting: moving focus between the two native windows must not close it.
      cursor = { x: b.x + 40, y: b.y + 40 };
      panel.focus(); await run(panel, "document.querySelector('#refresh').click()");
      await pause(400); assert.equal(await run(panel, 'document.body.dataset.transition'), 'open');
      // A native select holds the dropdown even while the cursor is outside its host.
      await run(panel, "document.querySelector('#theme').dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}))");
      cursor = { x: -10000, y: -10000 }; await pause(450);
      assert.equal(panel.isVisible(), true);
      await run(panel, "document.querySelector('#theme').dispatchEvent(new Event('blur'))");
      await until(async () => await run(panel, "document.body.dataset.transition === 'closing'"), 'fade starts');
      await pause(40);
      assert.equal(panel.isVisible(), true, 'native popup remains visible while fading');
      cursor = { x: anchor.x + anchor.width / 2, y: anchor.y + 30 };
      await until(async () => await run(panel, "document.body.dataset.transition === 'open'"), 'fade reverses');
      await pause(180);
      const frames = await run(panel, 'frames');
      assert.ok(frames.some(f => f.opacity > 0 && f.opacity < 1), 'native renderer produces intermediate opacity');
      assert.deepEqual(main.getBounds(), anchor);
      cursor = { x: -10000, y: -10000 };
      await until(() => !panel.isVisible(), 'fade completes then hides');
      assert.deepEqual(main.getBounds(), anchor);
      assert.equal(moveCount, beforeMove); assert.equal(resizeCount, beforeResize);
      report.push({ position, anchor, panel: b, placement, intermediateFrames: frames.filter(f => f.opacity > 0 && f.opacity < 1).length });
    }
    // Short visits, Escape suppression, keyboard focus, style changes and parent hide.
    const anchor = main.getBounds();
    const bar = { x: anchor.x + anchor.width / 2, y: anchor.y + 30 };
    for (let i = 0; i < 5; i++) { cursor = bar; await pause(100); cursor = {x:-10000,y:-10000}; await pause(120); }
    await pause(600);
    const panel = BrowserWindow.getAllWindows().find(w => w !== main);
    assert.equal(panel.isVisible(), false);
    await run(main, "document.querySelector('#mini-bar').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}))");
    await until(() => panel.isVisible(), 'keyboard opens'); await pause(500);
    assert.equal(panel.isVisible(), true, 'keyboard interaction remains open');
    await run(panel, "quotaApp.selectBucket('other')"); await pause(150);
    assert.equal(await run(main, "document.querySelector('#mini-percent').textContent"), '60%', 'bucket selection shared with capsule');
    await run(panel, "quotaApp.updateSettings({theme:'dark'})"); await pause(150);
    assert.equal(await run(main, 'document.body.dataset.theme'), 'dark');
    assert.equal(await run(panel, 'document.body.dataset.theme'), 'dark');
    fs.writeFileSync(path.join(out, 'dark.png'), (await panel.webContents.capturePage()).toPNG());
    await run(panel, "quotaApp.selectBucket('codex')"); await pause(150);
    await run(panel, "document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))");
    await until(() => !panel.isVisible(), 'Escape closes');
    cursor = bar; await pause(250);
    main.hide(); await pause(200); assert.equal(panel.isVisible(), false, 'owner hide hides popup');
    main.showInactive(); cursor = {x:-10000,y:-10000}; await pause(100);
    await run(main, "quotaApp.updateSettings({style:'mini'})"); await pause(300);
    assert.equal(await run(main, 'document.body.dataset.style'), 'mini');
    await run(main, "quotaApp.updateSettings({style:'percent'})"); await pause(300);
    assert.equal(await run(main, 'innerHeight'), 60);
    assert.deepEqual(errors, []);
    fs.writeFileSync(path.join(out, 'verification.json'), JSON.stringify({ passed: true, electron: process.versions.electron, platform: process.platform, area, report, errors }, null, 2));
    console.log('NATIVE_PERCENT_PASS: production IPC, two real Windows surfaces, zero capsule moves/resizes, animation reversal, select/focus, keyboard, style switching');
    app.quit();
  } catch (error) { console.error(error); app.exit(1); }
});
