import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDataJson } from './build-data-json.mjs';

test('buildDataJson: empty input produces skeleton', () => {
  const out = buildDataJson({ realAthletes: [], dummyAthletes: [], asOf: '2026-04-15' });
  assert.equal(out.generated_at, '2026-04-15T00:00:00Z');
  assert.equal(Object.keys(out.athletes).length, 0);
  assert.deepEqual(out.roster_summary, {
    total: 0, needs_checkin: 0, watch: 0, on_track: 0, avg_compliance_pct: 0,
  });
  assert.deepEqual(out.recent_comments_feed, []);
  assert.deepEqual(out.roster, []);
});

test('buildDataJson: passes dummy athletes through', () => {
  const dummy = [{
    id: 'd1',
    name: 'Test Dummy',
    avatar_initials: 'TD',
    is_real: false,
    current_fitness: { ctl: 80, atl: 80, tsb: 0 },
    fitness_history: [],
    sessions_by_week: { '2026-04-13': [] },
    focus_event: null,
    next_event: null,
  }];
  const out = buildDataJson({ realAthletes: [], dummyAthletes: dummy, asOf: '2026-04-15' });
  assert.equal(Object.keys(out.athletes).length, 1);
  assert.equal(out.athletes['d1'].name, 'Test Dummy');
  assert.equal(out.roster.length, 1);
  assert.equal(out.roster[0].id, 'd1');
});

test('buildDataJson: recent_comments_feed is newest-first and capped at 20', () => {
  const sessionsByWeek = { '2026-04-06': [] };
  for (let i = 0; i < 25; i++) {
    sessionsByWeek['2026-04-06'].push({
      id: `s${i}`,
      date: `2026-04-${String(10 + (i % 5)).padStart(2, '0')}`,
      title: `Workout ${i}`,
      sport: 'Run',
      status: 'completed',
      tss_planned: 50, tss_actual: 50,
      comments: [{
        text: `comment ${i}`,
        author: 'a',
        author_role: 'athlete',
        created_at: `2026-04-${String(10 + (i % 5)).padStart(2, '0')}T${String(i).padStart(2, '0')}:00:00Z`,
      }],
    });
  }
  const out = buildDataJson({
    realAthletes: [],
    dummyAthletes: [{
      id: 'x', name: 'X', avatar_initials: 'XX', is_real: false,
      current_fitness: { ctl: 80, atl: 80, tsb: 0 },
      sessions_by_week: sessionsByWeek,
    }],
    asOf: '2026-04-15',
  });
  assert.equal(out.recent_comments_feed.length, 20);
  assert.ok(out.recent_comments_feed[0].created_at >= out.recent_comments_feed[19].created_at);
});

test('buildDataJson: weekly_totals aggregates planned and actual TSS', () => {
  const out = buildDataJson({
    realAthletes: [],
    dummyAthletes: [{
      id: 'x', name: 'X', avatar_initials: 'XX', is_real: false,
      current_fitness: { ctl: 80, atl: 80, tsb: 0 },
      sessions_by_week: {
        '2026-04-13': [
          { id: 's1', date: '2026-04-14', title: 'Run', sport: 'Run', status: 'completed', tss_planned: 100, tss_actual: 95, comments: [] },
          { id: 's2', date: '2026-04-15', title: 'Bike', sport: 'Bike', status: 'missed', tss_planned: 80, tss_actual: null, comments: [] },
          { id: 's3', date: '2026-04-16', title: 'Swim', sport: 'Swim', status: 'upcoming', tss_planned: 40, tss_actual: null, comments: [] },
        ],
      },
    }],
    asOf: '2026-04-15',
  });
  assert.ok(out.weekly_totals['2026-04-13']);
  const wk = out.weekly_totals['2026-04-13'];
  assert.equal(wk.sessions_planned, 3);
  assert.equal(wk.sessions_completed, 1);
  assert.equal(wk.tss_planned, 220);
  assert.equal(wk.tss_actual, 95);
});

test('buildDataJson: roster sorted (or sortable) with correct status counts', () => {
  const mk = (id, tsb) => ({
    id, name: id, avatar_initials: id.slice(0, 2).toUpperCase(),
    is_real: false,
    current_fitness: { ctl: 80, atl: 80 + Math.max(0, -tsb), tsb },
    // minimal recent completed session so training_gap rule doesn't fire
    sessions_by_week: {
      '2026-04-13': [
        { id: `${id}-s1`, date: '2026-04-14', title: 'Run', sport: 'Run', status: 'completed', tss_planned: 50, tss_actual: 50, comments: [] },
      ],
    },
  });
  const out = buildDataJson({
    realAthletes: [],
    dummyAthletes: [mk('a', 0), mk('b', -20), mk('c', -30), mk('d', 5)],
    asOf: '2026-04-15',
  });
  assert.equal(out.roster_summary.total, 4);
  assert.equal(out.roster_summary.needs_checkin, 1);
  assert.equal(out.roster_summary.watch, 1);
  assert.equal(out.roster_summary.on_track, 2);
});
