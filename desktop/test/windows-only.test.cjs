'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { PassThrough, Writable } = require('node:stream');
const { EventEmitter } = require('node:events');
const { CodexClient, normalizeRateLimits } = require('../src/codex-client.cjs');
const { loadPreferences, savePreferences } = require('../src/preferences.cjs');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

test('malformed usage is unknown; over/underflow is clamped; legacy fallback works', () => {
  const snapshot = normalizeRateLimits({ rateLimitsByLimitId: {}, rateLimits: {
    primary: { usedPercent: 125, windowDurationMins: 300 },
    secondary: { usedPercent: -4, windowDurationMins: 10080, resetsAt: null },
  }});
  assert.equal(snapshot.buckets[0].primary.usedPercent, 100);
  assert.equal(snapshot.buckets[0].secondary.usedPercent, 0);
  assert.equal(snapshot.buckets[0].primary.resetsAt, null);
  for (const bad of [null, undefined, NaN, Infinity, '45']) {
    assert.equal(normalizeRateLimits({ rateLimits: { primary: { usedPercent: bad } } }).buckets.length, 0);
  }
  assert.equal(normalizeRateLimits({ rateLimitsByLimitId: { bad: null } }).buckets.length, 0);
});
function fakeServer(reply) {
  const proc = new EventEmitter();
  proc.stdout = new PassThrough(); proc.stderr = new PassThrough();
  proc.stdin = new Writable({ write(chunk, _, done) {
    const message = JSON.parse(String(chunk));
    setImmediate(() => reply(message, result => proc.stdout.write(JSON.stringify(result) + '\n')));
    done();
  }});
  proc.kill = () => { proc.stdout.end(); proc.stderr.end(); proc.emit('exit', 0); };
  return proc;
}
test('initialize precedes reads, repeated start is shared, refresh and close clean up', async () => {
  const messages = [];
  const proc = fakeServer((msg, send) => {
    messages.push(msg.method);
    if (msg.id) send({ id: msg.id, result: msg.method === 'initialize' ? {} : {
      rateLimits: { primary: { usedPercent: 25, windowDurationMins: 300, resetsAt: 1900000000 } },
    }});
  });
  const client = new CodexClient({ command: 'fake', spawnImpl: () => proc });
  const snapshots = [];
  client.on('snapshot', value => snapshots.push(value));
  await Promise.all([client.start(), client.start()]);
  assert.equal(client.ready, true);
  assert.deepEqual(messages.slice(0,3), ['initialize', 'initialized', 'account/rateLimits/read']);
  assert.equal(messages.filter(m => m === 'initialize').length, 1);
  assert.equal(snapshots[0].buckets[0].primary.usedPercent, 25);
  await client.refresh();
  assert.equal(snapshots.length, 2);
  client.close();
  assert.equal(client.ready, false);
  assert.equal(client.pending.size, 0);
});
test('server errors reject, disconnect cancels pending requests without leaked timers', async () => {
  const proc = fakeServer((msg, send) => { if (msg.method === 'initialize') send({ id: msg.id, error: { message: 'login required' } }); });
  const client = new CodexClient({ command: 'fake', spawnImpl: () => proc });
  await assert.rejects(client.start(), /login required/);
  const pending = client.request('account/rateLimits/read');
  proc.emit('exit', 1);
  await assert.rejects(pending, /连接已断开/);
  assert.equal(client.pending.size, 0);
  assert.equal(client.ready, false);
  client.close();
});
test('preferences survive restart, invalid and obsolete settings are discarded', () => {
  const dir = fs.mkdtempSync(path.join(__dirname, 'quota-test-'));
  const file = path.join(dir, 'preferences.json');
  try {
    savePreferences(file, { style: 'pill', theme: 'dark', refreshSeconds: 30, alwaysOnTop: false, remoteUrl: 'ignored' });
    assert.deepEqual(loadPreferences(file), { style: 'pill', theme: 'dark', refreshSeconds: 30, alwaysOnTop: false });
    fs.writeFileSync(file, '{"style":"unknown","theme":"bad","refreshSeconds":-1}');
    assert.equal(loadPreferences(file).style, 'apple');
    fs.writeFileSync(file, 'broken');
    assert.equal(loadPreferences(file).refreshSeconds, 60);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
