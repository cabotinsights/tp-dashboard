import { test } from 'node:test';
import assert from 'node:assert/strict';
import DataHealth from '../js/data-health.js';

const { computeDataHealth } = DataHealth;

// 2026-06-02T12:00:00Z as the "now" reference for age calculations.
const NOW = Date.parse('2026-06-02T12:00:00Z');

function roster(n, nullCtlCount) {
  return Array.from({ length: n }, (_, i) => ({
    id: String(i), name: 'A' + i, ctl: i < nullCtlCount ? null : 50,
  }));
}

test('healthy + fresh data is not degraded', () => {
  const h = computeDataHealth({
    generated_at: '2026-06-02T07:00:00Z',
    roster: roster(56, 0),
    validation: { warnings: [] },
  }, NOW);
  assert.equal(h.degraded, false);
  assert.equal(h.incompleteCount, 0);
});

test('null-CTL athletes mark data degraded with a coverage message', () => {
  const h = computeDataHealth({
    generated_at: '2026-06-02T07:00:00Z',
    roster: roster(56, 29),
    validation: { warnings: [] },
  }, NOW);
  assert.equal(h.degraded, true);
  assert.equal(h.incompleteCount, 29);
  assert.equal(h.total, 56);
  assert.match(h.message, /29 of 56/);
});

test('stale data (older than 28h) is degraded even when complete', () => {
  const h = computeDataHealth({
    generated_at: '2026-05-31T06:00:00Z', // ~54h before NOW
    roster: roster(56, 0),
    validation: { warnings: [] },
  }, NOW);
  assert.equal(h.stale, true);
  assert.equal(h.degraded, true);
});

test('null data does not throw and is not degraded', () => {
  const h = computeDataHealth(null, NOW);
  assert.equal(h.degraded, false);
  assert.equal(h.total, 0);
});
