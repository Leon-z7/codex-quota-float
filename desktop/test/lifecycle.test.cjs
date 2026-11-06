'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { PassThrough, Writable } = require('node:stream');
const { CodexClient } = require('../src/codex-client.cjs');
const { PercentPopup } = require('../src/percent-popup.cjs');

const usage = { rateLimits: { primary: { usedPercent: 25, windowDurationMins: 300 } } };
function processFixture(reply) {
  const proc = new EventEmitter();
  proc.stdout = new PassThrough(); proc.stderr = new PassThrough(); proc.kills = 0;
  proc.stdin = new Writable({ write(chunk, _, done) {
    const message = JSON.parse(String(chunk));
    setImmediate(() => reply(message, result => proc.stdout.write(JSON.stringify(result) + '\n')));
    done();
  }});
  // Keep streams alive to reproduce a late response from an old native process.
  proc.kill = () => { proc.kills++; };
  return proc;
}

test('initialization timeout releases the child and reader before retrying', async () => {
  const old = processFixture(() => {});
  const next = processFixture((msg, send) => { if (msg.id) send({ id: msg.id, result: msg.method === 'initialize' ? {} : usage }); });
  let calls = 0;
  const client = new CodexClient({ command: 'fixture', spawnImpl: () => calls++ ? next : old, timeoutMs: 30 });
  const first = client.start(), reader = client.lines;
  await assert.rejects(first, /请求超时/);
  assert.equal(old.kills, 1);
  assert.equal(reader.closed, true);
  assert.equal(client.proc, null);
  assert.equal(client.pending.size, 0);
  await client.start();
  assert.equal(client.ready, true);
  assert.equal(calls, 2);
  old.stdout.write(JSON.stringify({ method: 'account/rateLimits/updated' }) + '\n');
  assert.equal(client.refreshTimer, null, 'an old process cannot schedule a refresh');
  client.close();
});

test('first quota read failure leaves the client disconnected and retryable', async () => {
  const proc = processFixture((msg, send) => {
    if (msg.id) send({ id: msg.id, result: {} });
  });
  const client = new CodexClient({ command: 'fixture', spawnImpl: () => proc });
  await assert.rejects(client.start(), /未返回套餐额度/);
  assert.equal(client.ready, false);
  assert.equal(client.proc, null);
  assert.equal(proc.kills, 1);
});

class WindowFixture extends EventEmitter {
  constructor() {
    super(); this.dead = false; this.visible = false; this.failLoad = false;
    this.webContents = new EventEmitter();
    this.webContents.setWindowOpenHandler = () => {};
    this.webContents.executeJavaScript = async () => { this.alive(); };
    this.webContents.send = () => { this.alive(); };
    WindowFixture.instances.push(this);
  }
  alive() { if (this.dead) throw new Error('Object has been destroyed'); }
  isDestroyed() { return this.dead; }
  setAlwaysOnTop() { this.alive(); }
  async loadFile() { if (WindowFixture.failNextLoad) { WindowFixture.failNextLoad = false; throw new Error('load failed'); } }
  hide() { this.alive(); this.visible = false; }
  destroy() { this.alive(); this.dead = true; this.emit('closed'); }
  isVisible() { this.alive(); return this.visible; }
  getBounds() { this.alive(); return { x: 0, y: 0, width: 324, height: 624 }; }
  setBounds() { this.alive(); }
  showInactive() { this.alive(); this.visible = true; }
  focus() { this.alive(); }
}
WindowFixture.instances = [];
function popupFixture() {
  return new PercentPopup({ BrowserWindow: WindowFixture,
    screen: { getDisplayMatching: () => ({ workArea: { x: 0, y: 0, width: 1920, height: 1040 } }) },
    owner: () => ({ isDestroyed: () => false, getBounds: () => ({ x: 0, y: 0, width: 98, height: 60 }) }),
    settings: () => ({ alwaysOnTop: true }), dismiss: () => {} });
}
test('popup lifecycle tolerates an externally destroyed native window', async () => {
  const popup = popupFixture();
  await popup.setOpen(true, true);
  popup.window.destroy();
  assert.equal(popup.contains({ x: 20, y: 20 }), false);
  assert.doesNotThrow(() => popup.closed(popup.version));
  assert.doesNotThrow(() => popup.hide());
  assert.doesNotThrow(() => popup.destroy());
});

test('failed popup load is discarded so the next open creates a fresh window', async () => {
  const popup = popupFixture();
  WindowFixture.failNextLoad = true;
  await assert.rejects(popup.setOpen(true), /load failed/);
  const failed = WindowFixture.instances.at(-1);
  assert.equal(failed.isDestroyed(), true);
  assert.equal(popup.window, null);
  await popup.setOpen(true);
  assert.notEqual(popup.window, failed);
  assert.equal(popup.window.visible, true);
  popup.destroy();
});
