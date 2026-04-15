#!/usr/bin/env node
// Generates a 40-athlete dummy roster with varied profiles.
// Output: scripts/dummy/athletes.json
// Run: node scripts/generate-dummy-roster.mjs
// Deterministic: uses a seeded PRNG so re-runs produce stable output.

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Deterministic PRNG (mulberry32)
function rng(seed) {
  return function () {
    let t = (seed += 0x6D2B79F5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = rng(20260415);
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
const randInt = (lo, hi) => Math.floor(rand() * (hi - lo + 1)) + lo;

const FIRST = ['Alex', 'Sam', 'Morgan', 'Jamie', 'Taylor', 'Casey', 'Jordan', 'Riley',
  'Cameron', 'Avery', 'Quinn', 'Rowan', 'Sage', 'Drew', 'Finley', 'Harper', 'Emerson',
  'Blake', 'Parker', 'Reese', 'Phoenix', 'River', 'Sky', 'Dakota', 'Lennox', 'Peyton',
  'Remy', 'Tatum', 'Wren', 'Arden', 'Bailey', 'Charlie', 'Ellis', 'Frankie', 'Gray',
  'Hayden', 'Indigo', 'Kai', 'Luca', 'Marley'];
const LAST = ['Murphy', 'Kelly', 'Byrne', 'Ryan', "O'Brien", 'Walsh', 'Kennedy', 'Daly',
  'Collins', 'Moore', 'Brady', 'Doyle', 'Dunne', 'Fitzgerald', 'Gallagher', 'Healy',
  'Higgins', 'Keane', 'Lynch', 'Martin', 'McCarthy', 'Nolan', "O'Connor", 'Power',
  'Quinn', 'Reilly', 'Shea', 'Sullivan', 'Walsh', 'Wilson', 'Yates', 'Young', 'Allen',
  'Bell', 'Clarke', 'Davis', 'Evans', 'Foster', 'Green', 'Hall'];

const PROFILES = [
  { type: 'building', ctlBase: [70, 95], tsb: [-12, -3], compliance: [85, 100] },
  { type: 'peaking', ctlBase: [90, 120], tsb: [-5, 8], compliance: [90, 100] },
  { type: 'recovering', ctlBase: [55, 75], tsb: [5, 18], compliance: [80, 100] },
  { type: 'overreaching', ctlBase: [85, 105], tsb: [-30, -18], compliance: [70, 95] },
  { type: 'injured', ctlBase: [40, 60], tsb: [5, 20], compliance: [20, 60] },
  { type: 'detrained', ctlBase: [30, 55], tsb: [-5, 10], compliance: [50, 80] },
  { type: 'steady', ctlBase: [75, 90], tsb: [-8, 3], compliance: [80, 100] },
];

const SPORTS = ['Run', 'Bike', 'Swim'];
const SESSION_TITLES = {
  Run: ['Easy Run', 'Tempo Run', 'Long Run', 'Intervals', 'Fartlek', 'Recovery Jog'],
  Bike: ['Z2 Base', 'Threshold Bike', 'Long Ride', 'Sweet Spot', 'VO2 Bike', 'Recovery Spin'],
  Swim: ['Technique Swim', 'Main Set 400s', 'Endurance Swim', 'Sprints', 'Open Water'],
};
const MOOD_HITS = [
  'Legs really tired today, might need easy tomorrow',
  'Felt sore from Sunday long run',
  'Bit under the weather, slept badly',
  'Slight pain in left knee — monitoring',
  'Exhausted — tough week at work too',
];
const NEUTRAL_COMMENTS = [
  'Good session, felt strong',
  'Pace felt sustainable',
  'Windy on the ride, adjusted target watts',
  'Hit all the splits',
  'Solid effort',
  'Recovery was easy as planned',
];

const RACES = [
  { name: 'Dublin Marathon', date: '2026-10-25' },
  { name: 'IM Cork 70.3', date: '2026-05-13' },
  { name: 'Athlone Sprint Tri', date: '2026-06-07' },
  { name: 'Lost Sheep Triathlon', date: '2026-09-05' },
  { name: 'Cork City Marathon', date: '2026-06-07' },
  { name: 'IM Barcelona', date: '2026-10-04' },
  { name: 'Challenge Mallorca', date: '2026-10-18' },
  { name: 'Connemarathon', date: '2026-04-26' },
];

function pad(n) { return n < 10 ? '0' + n : '' + n; }
function toIso(d) { return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate()); }
function addDays(iso, n) {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return toIso(d);
}
function weekStart(iso) {
  const d = new Date(iso + 'T00:00:00Z');
  const day = d.getUTCDay();
  const offset = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + offset);
  return toIso(d);
}

const TODAY = '2026-04-15';

function genFitnessHistory(profile) {
  const out = [];
  const [lo, hi] = profile.ctlBase;
  const startCtl = randInt(lo - 5, hi - 10);
  const endCtl = randInt(lo, hi);
  for (let i = 0; i < 84; i++) {
    const t = i / 83;
    const ctl = +(startCtl + (endCtl - startCtl) * t + (rand() - 0.5) * 2).toFixed(1);
    const atl = +(ctl + (profile.type === 'overreaching' ? randInt(15, 30) : randInt(-10, 15)) + (rand() - 0.5) * 3).toFixed(1);
    const tsb = +(ctl - atl).toFixed(1);
    out.push({ date: addDays(TODAY, -(83 - i)), ctl, atl, tsb });
  }
  const [tsbLo, tsbHi] = profile.tsb;
  const target = randInt(tsbLo, tsbHi);
  const final = out[out.length - 1];
  final.tsb = target;
  final.atl = +(final.ctl - target).toFixed(1);
  return out;
}

function genSessionsForWeek(wkStart, profile, personIdx) {
  const targetCount = randInt(5, 8);
  const sessions = [];
  const missRate = (100 - randInt(profile.compliance[0], profile.compliance[1])) / 100;
  for (let i = 0; i < targetCount; i++) {
    const day = randInt(0, 6);
    const date = addDays(wkStart, day);
    const sport = pick(SPORTS);
    const title = pick(SESSION_TITLES[sport]);
    const tssPlanned = randInt(40, 130);
    const duration = +(tssPlanned / 55).toFixed(2);
    const dateIso = date;
    let status, tssActual, comments = [];
    if (dateIso > TODAY) {
      status = 'upcoming';
      tssActual = null;
    } else if (rand() < missRate) {
      status = 'missed';
      tssActual = null;
    } else {
      status = 'completed';
      tssActual = Math.round(tssPlanned * (0.85 + rand() * 0.3));
      const r = rand();
      if (profile.type === 'overreaching' && r < 0.3) {
        comments.push({ author: `athlete${personIdx}`, author_role: 'athlete', text: pick(MOOD_HITS), created_at: dateIso });
      } else if (profile.type === 'injured' && r < 0.5) {
        comments.push({ author: `athlete${personIdx}`, author_role: 'athlete', text: pick(MOOD_HITS), created_at: dateIso });
      } else if (r < 0.35) {
        comments.push({ author: `athlete${personIdx}`, author_role: 'athlete', text: pick(NEUTRAL_COMMENTS), created_at: dateIso });
      }
      if (r > 0.85) {
        comments.push({ author: 'coach', author_role: 'coach', text: 'Nice work', created_at: dateIso });
      }
    }
    sessions.push({
      id: `s-${personIdx}-${wkStart}-${i}`,
      date: dateIso,
      title,
      sport,
      duration_hours: duration,
      tss_planned: tssPlanned,
      tss_actual: tssActual,
      status,
      description: `${title} — target TSS ${tssPlanned}`,
      comments,
    });
  }
  sessions.sort((a, b) => a.date.localeCompare(b.date));
  return sessions;
}

function genAthlete(i) {
  const profile = PROFILES[i % PROFILES.length];
  const firstName = FIRST[i % FIRST.length];
  const lastName = LAST[(i * 7) % LAST.length];
  const name = `${firstName} ${lastName}`;
  const id = `dummy-${i + 1}`;
  const hist = genFitnessHistory(profile);
  const final = hist[hist.length - 1];

  const thisWk = weekStart(TODAY);
  const lastWk = addDays(thisWk, -7);
  const nextWk = addDays(thisWk, 7);

  const sessions_by_week = {
    [lastWk]: genSessionsForWeek(lastWk, profile, i),
    [thisWk]: genSessionsForWeek(thisWk, profile, i),
    [nextWk]: genSessionsForWeek(nextWk, profile, i),
  };

  for (const s of sessions_by_week[nextWk]) {
    s.status = 'upcoming';
    s.tss_actual = null;
    s.comments = [];
  }

  let focus_event = null;
  let next_event = null;
  if (rand() < 0.75) {
    const race = pick(RACES);
    const daysOut = Math.floor((new Date(race.date) - new Date(TODAY)) / 86400000);
    if (daysOut > 0) {
      const ctlTarget = randInt(90, 120);
      focus_event = {
        name: race.name,
        date: race.date,
        days_out: daysOut,
        ctl_current: final.ctl,
        ctl_target: ctlTarget,
      };
      next_event = { name: race.name, date: race.date, days_out: daysOut };
    }
  }

  return {
    id,
    name,
    avatar_initials: (firstName[0] + lastName[0]).toUpperCase(),
    is_real: false,
    profile_type: profile.type,
    current_fitness: { ctl: final.ctl, atl: final.atl, tsb: final.tsb, status: 'generated' },
    fitness_history: hist,
    sessions_by_week,
    focus_event,
    next_event,
  };
}

function main() {
  const athletes = [];
  for (let i = 0; i < 40; i++) {
    athletes.push(genAthlete(i));
  }
  const out = { generated_at: TODAY, count: athletes.length, athletes };
  const path = join(__dirname, 'dummy', 'athletes.json');
  writeFileSync(path, JSON.stringify(out, null, 2));
  console.log(`Wrote ${athletes.length} dummy athletes to ${path}`);
}

main();
