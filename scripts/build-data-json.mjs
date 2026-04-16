// Stage B: pure Node build — reads raw MCP pulls and dummy data,
// produces the final data.json consumed by the dashboard.
// No network, no MCP, no side effects — deterministic.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { evaluateFlags, rollupStatus } from './flag-rules.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..');

export function buildDataJson({ realAthletes, dummyAthletes, asOf }) {
  const athletes = {};
  const roster = [];
  const allComments = [];
  let complianceSum = 0;
  let complianceCount = 0;
  const rosterSummary = { total: 0, needs_checkin: 0, watch: 0, on_track: 0, avg_compliance_pct: 0 };
  const weeklyTotals = {};

  const merged = [...realAthletes, ...dummyAthletes];

  for (const a of merged) {
    // Real athletes (the dashboard viewer's own record) are included in
    // `athletes` for Personal-view drilldown but excluded from the coach
    // roster and flag evaluation — they're not coached athletes.
    const isViewer = a.is_real === true;

    const athleteWithAsOf = { ...a, asOf };
    const flags = isViewer ? (a.flags || []) : evaluateFlags(athleteWithAsOf);
    const status = isViewer ? 'on_track' : rollupStatus(flags);

    // Build flag history by re-evaluating at 4 sample points within the past 28 days
    const history = [];
    if (!isViewer) {
      const seen = new Set();
      for (let offset = 0; offset <= 28; offset += 7) {
        const histAsOf = shiftIso(asOf, -offset);
        const histFlags = evaluateFlags({ ...a, asOf: histAsOf });
        for (const f of histFlags) {
          const key = f.type + '|' + histAsOf;
          if (!seen.has(key)) {
            seen.add(key);
            history.push({ ...f, triggered_at: histAsOf });
          }
        }
      }
      history.sort((x, y) => x.triggered_at.localeCompare(y.triggered_at));
    }

    const thisWeekStart = weekStartIso(asOf);
    const thisWeekSessions = a.sessions_by_week?.[thisWeekStart] || [];
    const planned = thisWeekSessions.length;
    const completed = thisWeekSessions.filter(s => s.status === 'completed').length;
    const compliance_pct = planned > 0 ? Math.round((completed / planned) * 100) : (a.compliance_pct || 0);
    if (planned > 0 && !isViewer) {
      complianceSum += compliance_pct;
      complianceCount++;
    }

    const weeklyTssTrend = buildWeeklyTrend(a.sessions_by_week || {});

    athletes[a.id] = {
      ...a,
      flags,
      flag_history: isViewer ? (a.flag_history || []) : history,
      status,
      compliance_pct,
      weekly_tss_trend: weeklyTssTrend.length > 0 ? weeklyTssTrend : (a.weekly_tss_trend || []),
    };

    if (!isViewer) {
      roster.push({
        id: a.id,
        name: a.name,
        avatar_initials: a.avatar_initials,
        status,
        compliance_pct,
        flags,
        weekly_tss_trend: weeklyTssTrend,
        next_event: a.next_event ? a.next_event.name : null,
        days_to_event: a.next_event ? a.next_event.days_out : null,
        ctl: a.current_fitness?.ctl ?? null,
        tsb: a.current_fitness?.tsb ?? null,
      });

      rosterSummary.total++;
      rosterSummary[status]++;
    }

    for (const [, sessions] of Object.entries(a.sessions_by_week || {})) {
      for (const s of sessions) {
        for (const c of (s.comments || [])) {
          allComments.push({
            athlete_id: a.id,
            athlete_name: a.name,
            session_id: s.id,
            session_title: s.title,
            sport: s.sport,
            date: s.date,
            text: c.text,
            author: c.author,
            author_role: c.author_role,
            created_at: c.created_at,
            mood_flag: flags.some(f => f.type === 'mood_keyword'),
          });
        }
      }
    }

    for (const [wk, sessions] of Object.entries(a.sessions_by_week || {})) {
      if (!weeklyTotals[wk]) {
        weeklyTotals[wk] = { sessions_planned: 0, sessions_completed: 0, tss_planned: 0, tss_actual: 0 };
      }
      for (const s of sessions) {
        weeklyTotals[wk].sessions_planned++;
        weeklyTotals[wk].tss_planned += s.tss_planned || 0;
        if (s.status === 'completed') {
          weeklyTotals[wk].sessions_completed++;
          weeklyTotals[wk].tss_actual += s.tss_actual || 0;
        }
      }
    }
  }

  rosterSummary.avg_compliance_pct = complianceCount > 0 ? Math.round(complianceSum / complianceCount) : 0;

  const recentCommentsFeed = allComments
    .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''))
    .slice(0, 20);

  return {
    generated_at: asOf + 'T00:00:00Z',
    me: realAthletes[0]?.id || (dummyAthletes[0]?.id ?? null),
    athletes,
    roster,
    roster_summary: rosterSummary,
    recent_comments_feed: recentCommentsFeed,
    weekly_totals: weeklyTotals,
  };
}

function weekStartIso(iso) {
  const d = new Date(iso + 'T00:00:00Z');
  const day = d.getUTCDay();
  const offset = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
}

function shiftIso(iso, days) {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function buildWeeklyTrend(sessionsByWeek) {
  const weeks = Object.keys(sessionsByWeek).sort();
  return weeks.slice(-7).map(wk => {
    const total = (sessionsByWeek[wk] || [])
      .filter(s => s.status === 'completed')
      .reduce((acc, s) => acc + (s.tss_actual || 0), 0);
    return total;
  });
}

// CLI
if (import.meta.url === `file://${process.argv[1]}`) {
  const dummyPath = join(__dirname, 'dummy', 'athletes.json');
  const dummyAthletes = existsSync(dummyPath)
    ? JSON.parse(readFileSync(dummyPath, 'utf8')).athletes
    : [];

  // Real athletes come from two sources:
  //   scripts/raw/ — live MCP pulls (gitignored, regenerated by pull-tp-data.sh)
  //   scripts/seed/ — committed fallback data used when raw/ is empty or stale
  const { readdirSync } = await import('node:fs');
  const readAthletesFrom = (dir) => {
    const out = [];
    if (!existsSync(dir)) return out;
    for (const file of readdirSync(dir)) {
      if (!file.endsWith('.json')) continue;
      try {
        out.push(JSON.parse(readFileSync(join(dir, file), 'utf8')));
      } catch (e) {
        console.error(`Failed to parse ${join(dir, file)}:`, e.message);
      }
    }
    return out;
  };

  const rawAthletes = readAthletesFrom(join(__dirname, 'raw'));
  const seedAthletes = readAthletesFrom(join(__dirname, 'seed'));
  const rawIds = new Set(rawAthletes.map(a => a.id));
  const realAthletes = [
    ...rawAthletes,
    ...seedAthletes.filter(a => !rawIds.has(a.id)),
  ];

  const asOf = new Date().toISOString().slice(0, 10);
  const out = buildDataJson({ realAthletes, dummyAthletes, asOf });
  const outPath = join(REPO_ROOT, 'data.json');
  writeFileSync(outPath, JSON.stringify(out, null, 2));
  console.log(`Wrote ${Object.keys(out.athletes).length} athletes (${realAthletes.length} real + ${dummyAthletes.length} dummy) to ${outPath}`);
}
