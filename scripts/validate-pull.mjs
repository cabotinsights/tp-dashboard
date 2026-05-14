#!/usr/bin/env node
// Validates that scripts/raw/stephen-bates.json looks like a fresh, sane TP pull.
// Run after pull-tp-data.sh's `claude -p` completes. Exits non-zero on failure so
// the cron's status rolls up to "error" and the n8n alert fires.

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const RAW_FILE = join(__dirname, 'raw', 'stephen-bates.json');

const errors = [];
const warnings = [];

if (!existsSync(RAW_FILE)) {
  errors.push(`raw file missing: ${RAW_FILE}`);
} else {
  let d;
  try {
    d = JSON.parse(readFileSync(RAW_FILE, 'utf8'));
  } catch (e) {
    errors.push(`raw file is not valid JSON: ${e.message}`);
  }
  if (d) {
    if (d.id !== 'stephen-bates') errors.push(`expected id="stephen-bates", got "${d.id}"`);
    if (d.is_real !== true) errors.push(`expected is_real=true, got ${d.is_real}`);
    const cf = d.current_fitness;
    if (!cf || !Number.isFinite(cf.ctl) || !Number.isFinite(cf.atl) || !Number.isFinite(cf.tsb)) {
      errors.push(`current_fitness missing/invalid (ctl=${cf?.ctl} atl=${cf?.atl} tsb=${cf?.tsb})`);
    } else if (cf.ctl <= 0) {
      // CTL=0 means TP returned no training data — almost certainly a bad pull, not reality
      errors.push(`current_fitness.ctl=${cf.ctl} — likely empty/failed TP response`);
    }
    if (!Array.isArray(d.fitness_history) || d.fitness_history.length < 30) {
      errors.push(`fitness_history too short: ${d.fitness_history?.length ?? 0} entries (need ≥30)`);
    } else {
      const last = d.fitness_history[d.fitness_history.length - 1];
      if (!last?.date) {
        errors.push('fitness_history last entry has no date');
      } else {
        const ageDays = (Date.now() - new Date(last.date + 'T00:00:00Z').getTime()) / 86400000;
        if (ageDays > 7) errors.push(`fitness_history is ${ageDays.toFixed(1)}d stale (last: ${last.date}) — TP cookie likely expired`);
      }
    }
    // sessions_by_week presence — at least the current week or last week must have something,
    // otherwise the pull skipped workouts (a common silent failure mode).
    const weeks = Object.keys(d.sessions_by_week || {});
    if (weeks.length === 0) {
      warnings.push('sessions_by_week is empty — no workouts pulled (could be legit if athlete is between blocks)');
    }
    // Events soft-check — both can be null legitimately
    if (d.focus_event && !d.focus_event.event_date && !d.focus_event.date) {
      warnings.push(`focus_event "${d.focus_event.name || '?'}" has no date field`);
    }
  }
}

if (errors.length > 0) {
  console.error(`pull validation FAILED (${errors.length} error(s)):`);
  for (const e of errors) console.error('  - ' + e);
  if (warnings.length > 0) {
    console.error(`(also ${warnings.length} warning(s):`);
    for (const w of warnings) console.error('  - ' + w);
  }
  process.exit(1);
}

if (warnings.length > 0) {
  console.warn(`pull validation OK with ${warnings.length} warning(s):`);
  for (const w of warnings) console.warn('  - ' + w);
} else {
  console.log('pull validation OK');
}
