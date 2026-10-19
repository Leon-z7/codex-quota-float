'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { resizeRequest } = require('../src/window-layout.cjs');
const { savePreferences, loadPreferences, DEFAULTS } = require('../src/preferences.cjs');
test('mini selection survives restart without replacing the existing default', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'quota-mini-'));
  try {
    const file = path.join(dir,'preferences.json');
    savePreferences(file, {...DEFAULTS, style:'mini'});
    assert.equal(loadPreferences(file).style, 'mini');
    assert.equal(DEFAULTS.style, 'apple');
  } finally { fs.rmSync(dir, {recursive:true, force:true}); }
});
test('mini resize accepts a compact bar and expanded panel; rejects malformed IPC', () => {
  assert.deepEqual(resizeRequest('mini', {width:155.2,height:60}), {width:156,height:60});
  assert.deepEqual(resizeRequest('mini', {width:324,height:650}), {width:324,height:650});
  for (const request of [null,55,{}, {width:NaN,height:60},{width:155,height:'60'}]) assert.equal(resizeRequest('mini', request), null);
  assert.deepEqual(resizeRequest('mini', {width:1e8,height:1e8}), {width:324,height:1000});
  assert.deepEqual(resizeRequest('apple',330), {width:376,height:330});
  assert.deepEqual(resizeRequest('pill',150), {width:540,height:150});
  assert.deepEqual(resizeRequest('fluent',400), {width:404,height:400});
});

test('percent style persists and resizes from a small capsule to the complete dropdown', () => {
  const { sanitize } = require('../src/preferences.cjs');
  assert.equal(sanitize({style:'percent'}).style, 'percent');
  assert.deepEqual(resizeRequest('percent', {width:97.1,height:60}), {width:98,height:60});
  assert.deepEqual(resizeRequest('percent', {width:324,height:750}), {width:324,height:750});
  for (const bad of [null,97,{}, {width:NaN,height:60}]) assert.equal(resizeRequest('percent', bad), null);
});
