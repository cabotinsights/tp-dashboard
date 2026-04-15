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
