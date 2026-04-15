import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateFlags, RULES } from './flag-rules.mjs';

const baseAthlete = () => ({
  id: 'a1',
  name: 'Test Athlete',
  current_fitness: { ctl: 80, atl: 80, tsb: 0 },
  sessions_by_week: {},
  focus_event: null,
  asOf: '2026-04-15',
});

test('missed_sessions: 0 missed in last 7d → no flag', () => {
  const a = baseAthlete();
  a.sessions_by_week['2026-04-13'] = [
    { date: '2026-04-13', status: 'completed', tss_actual: 50 },
    { date: '2026-04-14', status: 'completed', tss_actual: 60 },
  ];
  const flags = evaluateFlags(a);
  assert.equal(flags.filter(f => f.type === 'missed_sessions').length, 0);
});

test('missed_sessions: 2 missed in last 7d → amber', () => {
  const a = baseAthlete();
  a.sessions_by_week['2026-04-13'] = [
    { date: '2026-04-13', status: 'missed', tss_planned: 80 },
    { date: '2026-04-14', status: 'missed', tss_planned: 60 },
    { date: '2026-04-15', status: 'completed', tss_actual: 50 },
  ];
  const flags = evaluateFlags(a);
  const missed = flags.find(f => f.type === 'missed_sessions');
  assert.ok(missed, 'expected missed_sessions flag');
  assert.equal(missed.severity, 'amber');
});

test('missed_sessions: 3 missed in last 7d → red', () => {
  const a = baseAthlete();
  a.sessions_by_week['2026-04-13'] = [
    { date: '2026-04-13', status: 'missed', tss_planned: 80 },
    { date: '2026-04-14', status: 'missed', tss_planned: 60 },
    { date: '2026-04-15', status: 'missed', tss_planned: 70 },
  ];
  const flags = evaluateFlags(a);
  const missed = flags.find(f => f.type === 'missed_sessions');
  assert.ok(missed);
  assert.equal(missed.severity, 'red');
});

test('RULES exposes expected rule types', () => {
  assert.deepEqual(
    RULES.map(r => r.type).sort(),
    ['fatigue_risk', 'missed_sessions', 'mood_keyword', 'race_not_ready', 'training_gap'].sort()
  );
});
