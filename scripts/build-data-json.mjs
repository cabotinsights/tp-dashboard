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

const SPORT_MAP = { run: 'Run', running: 'Run', bike: 'Bike', cycling: 'Bike', swim: 'Swim', swimming: 'Swim' };
function normalizeSport(s) {
  const key = (s || '').toLowerCase();
  return SPORT_MAP[key] || 'Other';
}

function sessionStatus(session, today) {
  if (session.status === 'completed' || (session.tss_actual != null && session.tss_actual > 0)) return 'done';
  if (session.date < today) return 'missed';
  return 'upcoming';
}

function summarizeWeek(sessions, weekStart, today) {
  const end = shiftIso(weekStart, 6);
  const by_sport = { Bike: { hours: 0, tss: 0 }, Run: { hours: 0, tss: 0 }, Swim: { hours: 0, tss: 0 }, Other: { hours: 0, tss: 0 } };
  let planned = 0, completed = 0, missed = 0;
  let total_tss = 0, total_hours = 0;
  let planned_today = 0;
  const inlineSessions = [];
  for (const s of sessions) {
    const status = sessionStatus(s, today);
    const sport = normalizeSport(s.sport);
    planned++;
    if (status === 'done') {
      completed++;
      const h = s.duration_hours || 0;
      const tss = s.tss_actual || 0;
      total_hours += h;
      total_tss += tss;
      by_sport[sport].hours += h;
      by_sport[sport].tss += tss;
    } else if (status === 'missed') {
      missed++;
    }
    if (s.date === today) planned_today++;
    inlineSessions.push({
      date: s.date,
      title: s.title,
      sport,
      duration_hours: s.duration_hours,
      tss: s.tss_actual,
      tss_planned: s.tss_planned,
      _status: status,
    });
  }
  // Round to 2 decimals
  total_hours = Math.round(total_hours * 100) / 100;
  total_tss = Math.round(total_tss * 100) / 100;
  for (const k of Object.keys(by_sport)) {
    by_sport[k].hours = Math.round(by_sport[k].hours * 100) / 100;
    by_sport[k].tss = Math.round(by_sport[k].tss * 100) / 100;
  }
  const compliance_pct = planned > 0 ? Math.round((completed / planned) * 100) : 0;
  return {
    start: weekStart,
    end,
    sessions_planned: planned,
    sessions_completed: completed,
    sessions_missed: missed,
    sessions_planned_today: planned_today,
    compliance_pct,
    total_tss,
    total_hours,
    by_sport,
    sessions: inlineSessions,
  };
}

export function deriveViewFields(athlete, asOf) {
  // For real/viewer athletes: derive Personal-view fields from sessions_by_week
  // and fitness_history. Leaves other fields (pbs, race_history, recovery, etc.)
  // untouched so seed data continues to populate them.
  if (!athlete.sessions_by_week) return {};
  const thisWeekStart = weekStartIso(asOf);
  const lastWeekStart = shiftIso(thisWeekStart, -7);

  const thisWeekSessions = athlete.sessions_by_week[thisWeekStart] || [];
  const lastWeekSessions = athlete.sessions_by_week[lastWeekStart] || [];

  const thisWeek = summarizeWeek(thisWeekSessions, thisWeekStart, asOf);
  const lastWeek = summarizeWeek(lastWeekSessions, lastWeekStart, asOf);

  // Flatten this-week sessions into the three arrays the Personal view reads.
  const completed_sessions = [];
  const upcoming_sessions = [];
  const missed_sessions = [];
  for (const s of thisWeek.sessions) {
    const base = { date: s.date, title: s.title, sport: s.sport, duration_hours: s.duration_hours };
    if (s._status === 'done') {
      completed_sessions.push({ ...base, tss: s.tss });
    } else if (s._status === 'upcoming') {
      upcoming_sessions.push({ ...base, tss_planned: s.tss_planned });
    } else {
      missed_sessions.push({ ...base, tss_planned: s.tss_planned });
    }
  }

  // weekly_trend: one entry per week we have session data for, with ctl_end pulled
  // from fitness_history (last reading on/before week end).
  const historyByDate = {};
  for (const h of (athlete.fitness_history || [])) historyByDate[h.date] = h.ctl;
  const weekKeys = Object.keys(athlete.sessions_by_week).sort();
  const weekly_trend = weekKeys.map(wk => {
    const sessions = athlete.sessions_by_week[wk] || [];
    let tss = 0, hours = 0;
    for (const s of sessions) {
      if (s.status === 'completed' || (s.tss_actual != null && s.tss_actual > 0)) {
        tss += s.tss_actual || 0;
        hours += s.duration_hours || 0;
      }
    }
    // ctl_end: walk back up to 7 days from week end to find a fitness reading
    let ctl_end = null;
    const weekEnd = shiftIso(wk, 6);
    for (let i = 0; i <= 7 && ctl_end == null; i++) {
      const d = shiftIso(weekEnd, -i);
      if (historyByDate[d] != null) ctl_end = Math.round(historyByDate[d] * 10) / 10;
    }
    return {
      week_start: wk,
      tss: Math.round(tss),
      hours: Math.round(hours * 100) / 100,
      ctl_end,
    };
  });

  return {
    this_week: thisWeek,
    last_week: lastWeek,
    completed_sessions,
    upcoming_sessions,
    missed_sessions,
    weekly_trend,
  };
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
  const seedById = new Map(seedAthletes.map(a => [a.id, a]));
  const rawIds = new Set(rawAthletes.map(a => a.id));
  const asOf = new Date().toISOString().slice(0, 10);
  // For each raw athlete: start from seed (preserves pbs, race_history, recovery,
  // coach_summary, etc.), overlay raw fields (fresh fitness + events + sessions),
  // then overlay freshly derived view fields (this_week, last_week,
  // completed/upcoming/missed_sessions, weekly_trend) so stale seed values
  // don't win for weeks the fresh pull covers.
  const mergedRaw = rawAthletes.map(raw => {
    const seed = seedById.get(raw.id);
    const base = seed ? { ...seed, ...raw } : raw;
    return { ...base, ...deriveViewFields(base, asOf) };
  });
  const realAthletes = [
    ...mergedRaw,
    ...seedAthletes.filter(a => !rawIds.has(a.id)),
  ];
  const out = buildDataJson({ realAthletes, dummyAthletes, asOf });
  const outPath = join(REPO_ROOT, 'data.json');
  writeFileSync(outPath, JSON.stringify(out, null, 2));
  console.log(`Wrote ${Object.keys(out.athletes).length} athletes (${realAthletes.length} real + ${dummyAthletes.length} dummy) to ${outPath}`);
}
