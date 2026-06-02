import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isUsableRaw, buildCurrentFitness } from './build-dubai-roster.mjs';

const GOOD_RAW = {
  id: 5241165,
  name: 'Mariam Al Ali',
  fitness: { current: { ctl: 67.7, atl: 67.6, tsb: 7.5 }, daily_data: [] },
  workouts: { workouts: [] },
  recovery: [],
};

// The exact shape written during the 2026-06-02 DNS incident.
const ERROR_RAW = {
  id: 3317440,
  name: 'Marc Bardsley',
  fitness: { isError: true, error_code: 'NETWORK_ERROR', message: 'Network error: [Errno 8] ...' },
  workouts: { isError: true, error_code: 'NETWORK_ERROR' },
  recovery: [],
};

test('isUsableRaw: accepts a raw with numeric current CTL', () => {
  assert.equal(isUsableRaw(GOOD_RAW), true);
});

test('isUsableRaw: rejects an isError fitness payload', () => {
  assert.equal(isUsableRaw(ERROR_RAW), false);
});

test('isUsableRaw: rejects raw with no usable current CTL', () => {
  assert.equal(isUsableRaw({ fitness: { current: null }, workouts: { workouts: [] } }), false);
});

test('buildCurrentFitness: returns null for an isError payload (no NaN CTL)', () => {
  assert.equal(buildCurrentFitness({ isError: true }), null);
});
