#!/usr/bin/env node
// Reads raw Dubai pulls from scripts/raw/dubai/*.json and produces
// scripts/dummy/athletes.json in the shape build-data-json.mjs expects.
// Replaces the synthetic dummy roster for the Gerhard demo.

import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..');
const RAW_DIR = join(REPO_ROOT, 'scripts', 'raw', 'dubai');
const OUT_DIR = join(REPO_ROOT, 'scripts', 'dummy');
const OUT_PATH = join(OUT_DIR, 'athletes.json');

function pad(n) { return n < 10 ? '0' + n : '' + n; }
function toIso(d) { return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate()); }
function weekStartIso(iso) {
  const d = new Date(iso + 'T00:00:00Z');
  const day = d.getUTCDay();
  const offset = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + offset);
  return toIso(d);
}

function initials(name) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(s => s[0]?.toUpperCase())
    .join('') || '??';
}

// TP workouts return sport=null often; infer from title/description keywords.
function inferSport(title, description) {
  const text = ((title || '') + '\n' + (description || '')).toLowerCase();
  if (/swim|open water|\bow\b|pool|\bpads\b|pull\s*buoy|paddles|backstroke|freestyle/.test(text)) return 'Swim';
  if (/\brun\b|running|hills|jog|fartlek|tempo run|easy run|long run|walk\s*\d+|5k|10k|marathon/.test(text)) return 'Run';
  if (/bike|cycl|riding|\bftp\b|torque|rpm|cadence|watts|aero|endurance.*hr|on\/?off|wattbike|spin|trainer|zwift/.test(text)) return 'Bike';
  if (/strength|s&c|gym|lift|squat|deadlift/.test(text)) return 'Other';
  if (/yoga|pilates|stretch|mobility|sauna|recovery: (full )?day off|day off|rest day/.test(text)) return 'Other';
  if (/brick/.test(text)) return 'Other';
  return 'Other';
}

function workoutToSession(w) {
  const tssActual = w.type === 'completed' ? (w.tss ?? null) : null;
  const tssPlanned = w.type === 'planned' ? (w.tss ?? null) : null;
  // For "completed" workouts, the planned-vs-actual is collapsed in this shape
  // (TP returns one record). Treat tss as actual when status=completed.
  const status = w.type === 'completed' ? 'completed' : 'planned';
  const duration = w.duration_actual ?? w.duration_planned ?? null;
  return {
    id: String(w.id),
    date: w.date,
    title: w.title || 'Workout',
    sport: inferSport(w.title, w.description),
    duration_hours: duration != null ? Math.round(duration * 100) / 100 : null,
    tss_planned: tssPlanned,
    tss_actual: tssActual,
    status,
    description: w.description || '',
    comments: [],
  };
}

function buildSessionsByWeek(workouts) {
  const out = {};
  for (const w of workouts) {
    if (!w.date) continue;
    const wk = weekStartIso(w.date);
    if (!out[wk]) out[wk] = [];
    out[wk].push(workoutToSession(w));
  }
  // Sort within each week by date ascending
  for (const wk of Object.keys(out)) {
    out[wk].sort((a, b) => a.date.localeCompare(b.date));
  }
  return out;
}

function buildFitnessHistory(fitness) {
  const daily = fitness?.daily_data || [];
  return daily.map(d => ({
    date: d.date,
    ctl: Math.round(d.ctl * 10) / 10,
    atl: Math.round(d.atl * 10) / 10,
    tsb: Math.round(d.tsb * 10) / 10,
  }));
}

function buildCurrentFitness(fitness) {
  const c = fitness?.current;
  if (!c) return null;
  return {
    ctl: Math.round(c.ctl * 10) / 10,
    atl: Math.round(c.atl * 10) / 10,
    tsb: Math.round(c.tsb * 10) / 10,
    status: c.fitness_status || null,
  };
}

function transform(raw) {
  const fitness = raw.fitness || {};
  const workouts = (raw.workouts && raw.workouts.workouts) || [];
  return {
    id: String(raw.id),
    name: raw.name,
    avatar_initials: initials(raw.name),
    is_real: false,
    current_fitness: buildCurrentFitness(fitness),
    fitness_history: buildFitnessHistory(fitness),
    sessions_by_week: buildSessionsByWeek(workouts),
    focus_event: null,
    next_event: null,
    recovery: [],
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  if (!existsSync(RAW_DIR)) {
    console.error(`No raw dir at ${RAW_DIR} — run scripts/pull-dubai-data.sh first`);
    process.exit(1);
  }
  const files = readdirSync(RAW_DIR).filter(f => f.endsWith('.json') && !f.startsWith('_'));
  const athletes = [];
  let skipped = 0;
  for (const f of files) {
    try {
      const raw = JSON.parse(readFileSync(join(RAW_DIR, f), 'utf8'));
      if (!raw.fitness || !raw.workouts) {
        console.warn(`Skipping ${f}: missing fitness or workouts`);
        skipped++;
        continue;
      }
      athletes.push(transform(raw));
    } catch (e) {
      console.error(`Failed to parse ${f}: ${e.message}`);
      skipped++;
    }
  }
  athletes.sort((a, b) => a.name.localeCompare(b.name));

  if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(OUT_PATH, JSON.stringify({ athletes }, null, 2));
  console.log(`Wrote ${athletes.length} Dubai athletes to ${OUT_PATH} (skipped ${skipped})`);
}

export { transform, buildSessionsByWeek, buildFitnessHistory, buildCurrentFitness, inferSport };
