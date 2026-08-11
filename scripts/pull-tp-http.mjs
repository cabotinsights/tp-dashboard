// Stage A (headless): pull raw TrainingPeaks data over plain HTTP.
//
// Replaces the old pull-tp-data.sh, which drove `claude -p` against a local MCP
// server and so only ran when Stephen's Mac was awake. This talks to the TP API
// directly, so it runs anywhere — including GitHub Actions.
//
// Auth: the Production_tpAuth cookie in TP_COOKIE. TP exchanges it for a short
// -lived bearer token; an expired cookie comes back as HTTP 200 with a null
// token, so that case is checked explicitly and exits non-zero.
//
// Usage:
//   TP_COOKIE=... node scripts/pull-tp-http.mjs
//   TP_COOKIE=... node scripts/pull-tp-http.mjs --probe   # dump response shapes

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const RAW_DIR = join(__dirname, 'raw');
const OUT_PATH = join(RAW_DIR, 'stephen-bates.json');

const TP_API = 'https://tpapi.trainingpeaks.com';
const PROBE = process.argv.includes('--probe');

const FITNESS_DAYS = 84;
const RECOVERY_DAYS = 30;
const SESSION_WEEKS_BACK = 1;
const SESSION_WEEKS_FORWARD = 1;

// Metric type ids, confirmed from the MCP's own captures.
const METRIC = {
  SLEEP_HOURS: 6,
  DEEP: 46,
  LIGHT: 48,
  REM: 47,
  AWAKE: 50,
  HRV: 60,
  PULSE: 5,
};

// workoutTypeValueId -> sport name the dashboard builder understands.
const SPORT_BY_TYPE_ID = {
  1: 'Swim',
  2: 'Bike',
  3: 'Run',
  4: 'Brick',
  5: 'Crosstrain',
  6: 'Race',
  8: 'MtnBike',
  9: 'Strength',
  11: 'XCSki',
  12: 'Rowing',
  13: 'Walk',
};

const iso = (d) => d.toISOString().slice(0, 10);
const shiftDays = (d, days) => new Date(d.getTime() + days * 86400000);

function mondayOf(d) {
  const out = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = out.getUTCDay();
  out.setUTCDate(out.getUTCDate() + (day === 0 ? -6 : 1 - day));
  return out;
}

function fail(message) {
  console.error(`FATAL: ${message}`);
  process.exit(1);
}

function fitnessStatus(tsb) {
  if (tsb > 25) return 'Very Fresh (detraining risk)';
  if (tsb > 10) return 'Fresh (race ready)';
  if (tsb > 0) return 'Neutral (normal training)';
  if (tsb > -10) return 'Tired (absorbing training)';
  if (tsb > -25) return 'Very Tired (high fatigue)';
  return 'Exhausted (overreaching risk)';
}

let bearer = null;

async function tpFetch(path, { method = 'GET', body = null } = {}) {
  const headers = { Accept: 'application/json', Authorization: `Bearer ${bearer}` };
  if (body) headers['Content-Type'] = 'application/json';

  const response = await fetch(`${TP_API}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (response.status === 401 || response.status === 403) {
    fail(`TrainingPeaks rejected the request (HTTP ${response.status}) on ${path}. The cookie has expired — re-run: tp-mcp auth`);
  }
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} on ${path}`);
  }
  return response.json();
}

// Exchange the cookie for a bearer token and resolve the athlete id.
async function authenticate(cookie) {
  const tokenResponse = await fetch(`${TP_API}/users/v3/token`, {
    headers: { Cookie: `Production_tpAuth=${cookie}`, Accept: 'application/json' },
  });

  if (!tokenResponse.ok) {
    fail(`Token request failed with HTTP ${tokenResponse.status}. Re-run: tp-mcp auth`);
  }

  const tokenData = await tokenResponse.json();
  // An expired cookie still returns 200 here, with "token": null.
  const accessToken = tokenData?.token?.access_token;
  if (!accessToken) {
    fail('TrainingPeaks returned no access token — the cookie has expired. Re-run: tp-mcp auth');
  }
  bearer = accessToken;

  const userData = await tpFetch('/users/v3/user');
  const user = userData?.user || {};
  const athleteId = user.athletes?.[0]?.athleteId || user.personId;
  if (!athleteId) fail('Could not resolve an athlete id from the user profile.');

  return { athleteId, email: user.email };
}

async function getFitness(athleteId, startDate, endDate) {
  const path = `/fitness/v1/athletes/${athleteId}/reporting/performancedata/${startDate}/${endDate}`;
  const data = await tpFetch(path, {
    method: 'POST',
    body: { atlConstant: 7, atlStart: 0, ctlConstant: 42, ctlStart: 0, workoutTypes: [] },
  });
  return Array.isArray(data) ? data : [];
}

async function getWorkouts(athleteId, startDate, endDate) {
  const data = await tpFetch(`/fitness/v6/athletes/${athleteId}/workouts/${startDate}/${endDate}`);
  return Array.isArray(data) ? data : [];
}

async function getEvent(athleteId, which) {
  try {
    return await tpFetch(`/fitness/v6/athletes/${athleteId}/events/${which}`);
  } catch (e) {
    console.warn(`  ${which} unavailable: ${e.message}`);
    return null;
  }
}

async function getMetrics(athleteId, startDate, endDate) {
  const path = `/metrics/v3/athletes/${athleteId}/consolidatedtimedmetrics/${startDate}/${endDate}`;
  const data = await tpFetch(path);
  return Array.isArray(data) ? data : [];
}

function mapComment(c) {
  return {
    text: c.comment || '',
    author: c.commenterName || [c.firstName, c.lastName].filter(Boolean).join(' '),
    author_role: c.isCoach ? 'coach' : 'athlete',
    created_at: c.dateCreated || null,
  };
}

function mapWorkout(w) {
  const date = (w.workoutDay || '').split('T')[0];
  const durationHours = w.totalTime ?? w.totalTimePlanned ?? null;
  const tssActual = w.tssActual ?? null;
  // TP leaves `completed` null on every workout, so infer it: a workout is done
  // once actual data has landed against it.
  const isCompleted = Boolean(w.totalTime || tssActual);
  const distanceM = isCompleted ? (w.distance ?? w.distancePlanned ?? null) : (w.distancePlanned ?? null);

  return {
    id: String(w.workoutId ?? w.id ?? ''),
    date,
    title: w.title || '',
    sport: SPORT_BY_TYPE_ID[w.workoutTypeValueId] || null,
    duration_hours: durationHours,
    tss_planned: w.tssPlanned ?? null,
    tss_actual: tssActual,
    status: isCompleted ? 'completed' : 'planned',
    distance_km: distanceM != null ? Math.round((distanceM / 1000) * 100) / 100 : null,
    description: w.description || '',
    comments: (w.workoutComments || []).map(mapComment),
  };
}

// TP returns one record per metric write, so a date can carry several — a nap,
// a split night, a manual correction. Keep the group with the most sleep.
function mapRecovery(records) {
  const bestByDate = new Map();

  for (const record of records) {
    const date = (record.timeStamp || record.timestamp || '').split('T')[0];
    if (!date) continue;

    const values = {};
    for (const detail of record.details || []) {
      values[detail.type] = detail.value;
    }

    const sleepHours = values[METRIC.SLEEP_HOURS] || 0;
    if (sleepHours <= 0) continue;

    const existing = bestByDate.get(date);
    if (existing && existing.sleep_hours >= sleepHours) continue;

    bestByDate.set(date, {
      date,
      sleep_hours: sleepHours,
      deep: values[METRIC.DEEP] ?? null,
      light: values[METRIC.LIGHT] ?? null,
      rem: values[METRIC.REM] ?? null,
      awake: values[METRIC.AWAKE] ?? null,
      hrv: values[METRIC.HRV] ?? null,
      resting_hr: values[METRIC.PULSE] ?? null,
    });
  }

  return [...bestByDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

function mapEvent(event) {
  if (!event || !event.id) return null;
  return {
    id: event.id,
    name: event.name || '',
    date: (event.eventDate || '').split('T')[0] || null,
    type: event.eventType || null,
    priority: event.atpPriority || null,
    race_type_duration: event.raceTypeDuration || null,
  };
}

function probe(label, sample) {
  console.log(`\n--- ${label} ---`);
  if (!sample) return console.log('(null)');
  const first = Array.isArray(sample) ? sample[0] : sample;
  if (!first) return console.log('(empty array)');
  console.log('keys:', Object.keys(first).join(', '));
  console.log('sample:', JSON.stringify(first).slice(0, 900));
}

async function main() {
  const cookie = (process.env.TP_COOKIE || '').trim();
  if (!cookie) fail('TP_COOKIE is not set.');

  const { athleteId, email } = await authenticate(cookie);
  console.log(`Authenticated as ${email} (athlete ${athleteId})`);

  const today = new Date();
  const fitnessStart = iso(shiftDays(today, -FITNESS_DAYS));
  const fitnessEnd = iso(today);
  const weekStart = mondayOf(shiftDays(today, -7 * SESSION_WEEKS_BACK));
  const weekEnd = shiftDays(mondayOf(today), 7 * (SESSION_WEEKS_FORWARD + 1) - 1);
  const recoveryStart = iso(shiftDays(today, -RECOVERY_DAYS));

  const [fitness, workouts, metrics, focusEvent, nextEvent] = await Promise.all([
    getFitness(athleteId, fitnessStart, fitnessEnd),
    getWorkouts(athleteId, iso(weekStart), iso(weekEnd)),
    getMetrics(athleteId, recoveryStart, fitnessEnd),
    getEvent(athleteId, 'focusevent'),
    getEvent(athleteId, 'nextplannedevent'),
  ]);

  if (PROBE) {
    probe('fitness', fitness);
    probe('workouts', workouts);
    probe('metrics', metrics);
    probe('focusevent', focusEvent);
    probe('nextplannedevent', nextEvent);
    return;
  }

  const fitnessHistory = fitness
    .map((entry) => ({
      date: (entry.workoutDay || '').split('T')[0],
      ctl: Math.round((entry.ctl || 0) * 10) / 10,
      atl: Math.round((entry.atl || 0) * 10) / 10,
      tsb: Math.round((entry.tsb || 0) * 10) / 10,
    }))
    .filter((entry) => entry.date);

  if (fitnessHistory.length === 0) fail('No fitness history returned — refusing to write an empty pull.');

  const latest = fitnessHistory[fitnessHistory.length - 1];
  const currentFitness = {
    ctl: latest.ctl,
    atl: latest.atl,
    tsb: latest.tsb,
    status: fitnessStatus(latest.tsb),
  };

  const sessionsByWeek = {};
  for (const workout of workouts) {
    const session = mapWorkout(workout);
    if (!session.date) continue;
    const week = iso(mondayOf(new Date(`${session.date}T00:00:00Z`)));
    (sessionsByWeek[week] ||= []).push(session);
  }
  for (const week of Object.keys(sessionsByWeek)) {
    sessionsByWeek[week].sort((a, b) => a.date.localeCompare(b.date));
  }

  const out = {
    id: 'stephen-bates',
    name: 'Stephen Bates',
    avatar_initials: 'SB',
    is_real: true,
    current_fitness: currentFitness,
    fitness_history: fitnessHistory,
    sessions_by_week: sessionsByWeek,
    focus_event: mapEvent(focusEvent),
    next_event: mapEvent(nextEvent),
    recovery: mapRecovery(metrics),
  };

  mkdirSync(RAW_DIR, { recursive: true });
  writeFileSync(OUT_PATH, JSON.stringify(out, null, 2));

  const sessionCount = Object.values(sessionsByWeek).reduce((n, list) => n + list.length, 0);
  console.log(
    `Wrote ${OUT_PATH} — CTL ${currentFitness.ctl} / ATL ${currentFitness.atl} / TSB ${currentFitness.tsb}, ` +
    `${fitnessHistory.length} fitness days, ${sessionCount} sessions across ${Object.keys(sessionsByWeek).length} weeks, ` +
    `${out.recovery.length} recovery days`
  );
}

main().catch((e) => fail(e.message));
