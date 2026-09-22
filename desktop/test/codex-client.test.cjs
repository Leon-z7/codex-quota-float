'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeRateLimits } = require('../src/codex-client.cjs');

test('normalizes multi-window Codex rate limits', () => {
  const now = new Date('2026-09-22T10:00:00Z');
  const result = normalizeRateLimits({
    rateLimitsByLimitId: {
      codex: {
        limitId: 'codex',
        primary: { usedPercent: 25, windowDurationMins: 300, resetsAt: 1800000000 },
        secondary: { usedPercent: 40, windowDurationMins: 10080, resetsAt: 1800500000 },
      },
    },
  }, now);
  assert.equal(result.updatedAt, now.toISOString());
  assert.equal(result.buckets.length, 1);
  assert.equal(result.buckets[0].primary.usedPercent, 25);
  assert.equal(result.buckets[0].secondary.windowDurationMins, 10080);
});

test('supports the backward-compatible single bucket', () => {
  const result = normalizeRateLimits({
    rateLimits: {
      limitId: 'codex',
      primary: { usedPercent: 7, windowDurationMins: 300, resetsAt: 1800000000 },
    },
  });
  assert.equal(result.buckets[0].limitId, 'codex');
  assert.equal(result.buckets[0].primary.usedPercent, 7);
});

