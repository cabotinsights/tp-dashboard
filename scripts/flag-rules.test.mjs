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

test('fatigue_risk: TSB -10 → no flag', () => {
  const a = baseAthlete();
  a.current_fitness.tsb = -10;
  const flags = evaluateFlags(a);
  assert.equal(flags.filter(f => f.type === 'fatigue_risk').length, 0);
});

test('fatigue_risk: TSB -20 → amber', () => {
  const a = baseAthlete();
  a.current_fitness.tsb = -20;
  const flags = evaluateFlags(a);
  const f = flags.find(x => x.type === 'fatigue_risk');
  assert.ok(f);
  assert.equal(f.severity, 'amber');
});

test('fatigue_risk: TSB -30 → red', () => {
  const a = baseAthlete();
  a.current_fitness.tsb = -30;
  const flags = evaluateFlags(a);
  const f = flags.find(x => x.type === 'fatigue_risk');
  assert.ok(f);
  assert.equal(f.severity, 'red');
});

test('fatigue_risk: exactly -15 → amber (boundary)', () => {
  const a = baseAthlete();
  a.current_fitness.tsb = -15;
  const flags = evaluateFlags(a);
  const f = flags.find(x => x.type === 'fatigue_risk');
  assert.ok(f);
  assert.equal(f.severity, 'amber');
});

test('training_gap: 3 days silent → no flag', () => {
  const a = baseAthlete();
  a.asOf = '2026-04-15';
  a.sessions_by_week['2026-04-06'] = [
    { date: '2026-04-12', status: 'completed', tss_actual: 40 },
  ];
  const flags = evaluateFlags(a);
  assert.equal(flags.filter(f => f.type === 'training_gap').length, 0);
});

test('training_gap: 4 days silent → amber', () => {
  const a = baseAthlete();
  a.asOf = '2026-04-15';
  a.sessions_by_week['2026-04-06'] = [
    { date: '2026-04-11', status: 'completed', tss_actual: 40 },
  ];
  const flags = evaluateFlags(a);
  const f = flags.find(x => x.type === 'training_gap');
  assert.ok(f);
  assert.equal(f.severity, 'amber');
});

test('training_gap: 6 days silent → red', () => {
  const a = baseAthlete();
  a.asOf = '2026-04-15';
  a.sessions_by_week['2026-04-06'] = [
    { date: '2026-04-09', status: 'completed', tss_actual: 40 },
  ];
  const flags = evaluateFlags(a);
  const f = flags.find(x => x.type === 'training_gap');
  assert.ok(f);
  assert.equal(f.severity, 'red');
});

test('training_gap: no sessions at all → red', () => {
  const a = baseAthlete();
  a.asOf = '2026-04-15';
  const flags = evaluateFlags(a);
  const f = flags.find(x => x.type === 'training_gap');
  assert.ok(f);
  assert.equal(f.severity, 'red');
});

test('mood_keyword: no comments → no flag', () => {
  const a = baseAthlete();
  a.sessions_by_week['2026-04-13'] = [
    { date: '2026-04-14', status: 'completed', comments: [] },
  ];
  assert.equal(evaluateFlags(a).filter(f => f.type === 'mood_keyword').length, 0);
});

test('mood_keyword: 1 "tired" in last 14d → amber', () => {
  const a = baseAthlete();
  a.asOf = '2026-04-15';
  a.sessions_by_week['2026-04-13'] = [
    {
      date: '2026-04-14',
      status: 'completed',
      comments: [{ author: 'stephen', author_role: 'athlete', text: 'legs really tired today', created_at: '2026-04-14' }],
    },
  ];
  const f = evaluateFlags(a).find(x => x.type === 'mood_keyword');
  assert.ok(f);
  assert.equal(f.severity, 'amber');
});

test('mood_keyword: 2 hits in 14d → red', () => {
  const a = baseAthlete();
  a.asOf = '2026-04-15';
  a.sessions_by_week['2026-04-06'] = [
    {
      date: '2026-04-08',
      status: 'completed',
      comments: [{ text: 'feeling sick', author_role: 'athlete', created_at: '2026-04-08' }],
    },
    {
      date: '2026-04-12',
      status: 'completed',
      comments: [{ text: 'really exhausted', author_role: 'athlete', created_at: '2026-04-12' }],
    },
  ];
  const f = evaluateFlags(a).find(x => x.type === 'mood_keyword');
  assert.ok(f);
  assert.equal(f.severity, 'red');
});

test('mood_keyword: older than 14d → no flag', () => {
  const a = baseAthlete();
  a.asOf = '2026-04-15';
  a.sessions_by_week['2026-03-23'] = [
    {
      date: '2026-03-25',
      status: 'completed',
      comments: [{ text: 'tired', author_role: 'athlete', created_at: '2026-03-25' }],
    },
  ];
  assert.equal(evaluateFlags(a).filter(f => f.type === 'mood_keyword').length, 0);
});

test('race_not_ready: no focus event → no flag', () => {
  const a = baseAthlete();
  assert.equal(evaluateFlags(a).filter(f => f.type === 'race_not_ready').length, 0);
});

test('race_not_ready: race in 28d, CTL 80% of target → amber', () => {
  const a = baseAthlete();
  a.asOf = '2026-04-15';
  a.current_fitness.ctl = 80;
  a.focus_event = { name: 'IM Cork', date: '2026-05-13', ctl_target: 100 };
  const f = evaluateFlags(a).find(x => x.type === 'race_not_ready');
  assert.ok(f);
  assert.equal(f.severity, 'amber');
});

test('race_not_ready: race in 10d, CTL 75% of target → red', () => {
  const a = baseAthlete();
  a.asOf = '2026-04-15';
  a.current_fitness.ctl = 75;
  a.focus_event = { name: 'IM Cork', date: '2026-04-25', ctl_target: 100 };
  const f = evaluateFlags(a).find(x => x.type === 'race_not_ready');
  assert.ok(f);
  assert.equal(f.severity, 'red');
});

test('race_not_ready: race in 28d, CTL at target → no flag', () => {
  const a = baseAthlete();
  a.asOf = '2026-04-15';
  a.current_fitness.ctl = 95;
  a.focus_event = { name: 'IM Cork', date: '2026-05-13', ctl_target: 100 };
  assert.equal(evaluateFlags(a).filter(f => f.type === 'race_not_ready').length, 0);
});

test('race_not_ready: race 60 days away → no flag regardless of CTL', () => {
  const a = baseAthlete();
  a.asOf = '2026-04-15';
  a.current_fitness.ctl = 50;
  a.focus_event = { name: 'IM Cork', date: '2026-06-15', ctl_target: 100 };
  assert.equal(evaluateFlags(a).filter(f => f.type === 'race_not_ready').length, 0);
});

import { rollupStatus } from './flag-rules.mjs';

test('rollupStatus: no flags → on_track', () => {
  assert.equal(rollupStatus([]), 'on_track');
});

test('rollupStatus: only amber → watch', () => {
  assert.equal(rollupStatus([{ severity: 'amber' }]), 'watch');
});

test('rollupStatus: any red → needs_checkin', () => {
  assert.equal(rollupStatus([{ severity: 'amber' }, { severity: 'red' }]), 'needs_checkin');
});

test('all 5 rules fire on a maximally bad athlete', () => {
  const a = {
    id: 'worst',
    name: 'Worst Case',
    current_fitness: { ctl: 60, atl: 100, tsb: -30 },
    asOf: '2026-04-15',
    sessions_by_week: {
      '2026-04-06': [
        { date: '2026-04-07', status: 'missed', tss_planned: 80 },
        { date: '2026-04-09', status: 'missed', tss_planned: 80 },
        { date: '2026-04-12', status: 'missed', tss_planned: 80 },
        { date: '2026-04-08', status: 'completed', tss_actual: 50,
          comments: [{ text: 'feeling sick', author_role: 'athlete', created_at: '2026-04-08' }] },
        { date: '2026-04-04', status: 'completed', tss_actual: 50,
          comments: [{ text: 'very tired', author_role: 'athlete', created_at: '2026-04-04' }] },
      ],
    },
    focus_event: { name: 'IM Cork', date: '2026-04-22', ctl_target: 100 },
  };
  const flags = evaluateFlags(a);
  const types = new Set(flags.map(f => f.type));
  assert.ok(types.has('missed_sessions'));
  assert.ok(types.has('fatigue_risk'));
  assert.ok(types.has('mood_keyword'));
  assert.ok(types.has('race_not_ready'));
  assert.equal(rollupStatus(flags), 'needs_checkin');
});
