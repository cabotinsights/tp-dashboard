import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDataJson, freezeCoachView } from './build-data-json.mjs';

test('buildDataJson: empty input produces skeleton', () => {
  const out = buildDataJson({ realAthletes: [], dummyAthletes: [], asOf: '2026-04-15' });
  assert.equal(out.as_of_date, '2026-04-15');
  assert.match(out.generated_at, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
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

test('buildDataJson: computes days_out for curated key_races', () => {
  const out = buildDataJson({
    realAthletes: [{
      id: 'sb',
      name: 'Stephen Bates',
      is_real: true,
      current_fitness: { ctl: 50, atl: 50, tsb: 0 },
      key_races: [{ name: 'T100 Dubai', date: '2026-11-15', event_type: 'MultisportTriathlon' }],
    }],
    dummyAthletes: [],
    asOf: '2026-06-03',
  });
  const kr = out.athletes['sb'].key_races;
  assert.equal(kr.length, 1);
  assert.equal(kr[0].name, 'T100 Dubai');
  assert.equal(kr[0].days_out, 165);
});

test('buildDataJson: key_races defaults to empty array when absent', () => {
  const out = buildDataJson({
    realAthletes: [{ id: 'x', name: 'X', is_real: true, current_fitness: { ctl: 1, atl: 1, tsb: 0 } }],
    dummyAthletes: [],
    asOf: '2026-06-03',
  });
  assert.deepEqual(out.athletes['x'].key_races, []);
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

test('buildDataJson: populates flag_history for past 28 days by re-evaluating', () => {
  const a = {
    id: 'hist', name: 'Hist', avatar_initials: 'HH', is_real: false,
    current_fitness: { ctl: 80, atl: 80, tsb: 0 },
    sessions_by_week: {
      '2026-04-06': [{
        id: 's1', date: '2026-04-05', title: 'Run', sport: 'Run', status: 'completed',
        tss_planned: 50, tss_actual: 50,
        comments: [{ text: 'legs tired', author_role: 'athlete', created_at: '2026-04-05' }],
      }],
    },
  };
  const out = buildDataJson({ realAthletes: [], dummyAthletes: [a], asOf: '2026-04-15' });
  const entry = out.athletes['hist'];
  assert.ok(Array.isArray(entry.flag_history));
  assert.ok(entry.flag_history.length > 0, 'expected at least one historical flag entry');
});

test('freezeCoachView: keeps coach blocks from previous build, viewer from fresh', () => {
  const previous = {
    athletes: {
      'stephen-bates': { id: 'stephen-bates', is_real: true, current_fitness: { ctl: 10 } },
      'coach-1': { id: 'coach-1', is_real: false, current_fitness: { ctl: 80 } },
    },
    roster: [{ id: 'coach-1', status: 'on_track' }],
    roster_summary: { total: 1, needs_checkin: 0, watch: 0, on_track: 1, avg_compliance_pct: 90 },
    recent_comments_feed: [{ athlete_id: 'coach-1', text: 'good session' }],
    weekly_totals: { '2026-07-06': { sessions_planned: 4 } },
  };
  const fresh = buildDataJson({
    realAthletes: [{
      id: 'stephen-bates', name: 'Stephen Bates', avatar_initials: 'SB', is_real: true,
      current_fitness: { ctl: 99, atl: 60, tsb: 39 }, sessions_by_week: {},
    }],
    dummyAthletes: [],
    asOf: '2026-08-04',
  });

  const out = freezeCoachView(fresh, previous);

  assert.deepEqual(out.roster, previous.roster);
  assert.deepEqual(out.roster_summary, previous.roster_summary);
  assert.deepEqual(out.recent_comments_feed, previous.recent_comments_feed);
  assert.deepEqual(out.weekly_totals, previous.weekly_totals);
  assert.deepEqual(out.athletes['coach-1'], previous.athletes['coach-1']);
  assert.equal(out.athletes['stephen-bates'].current_fitness.ctl, 99, 'viewer must come from the fresh build');
  assert.equal(out.as_of_date, '2026-08-04');
});

test('freezeCoachView: returns the fresh build untouched when there is no previous data', () => {
  const fresh = buildDataJson({ realAthletes: [], dummyAthletes: [], asOf: '2026-08-04' });
  assert.deepEqual(freezeCoachView(fresh, null), fresh);
});
