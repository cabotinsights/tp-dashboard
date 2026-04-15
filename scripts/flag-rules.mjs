// Flag rules for the coach view.
// Each rule is a pure function: (athlete) -> {severity, reason} | null
// Thresholds tuned for "lean more alarms" — easier to dial back than to find missed issues.

const MOOD_REGEX = /\b(tired|sore|sick|exhausted|bad sleep|pain|injured)\b/i;

function daysBetween(aIso, bIso) {
  const a = new Date(aIso + 'T00:00:00Z');
  const b = new Date(bIso + 'T00:00:00Z');
  return Math.floor((b - a) / 86400000);
}

function flattenSessions(athlete) {
  const out = [];
  for (const [, sessions] of Object.entries(athlete.sessions_by_week || {})) {
    for (const s of sessions) out.push(s);
  }
  return out;
}

function sessionsInLastNDays(athlete, n) {
  const asOf = athlete.asOf;
  return flattenSessions(athlete).filter(s => {
    const d = daysBetween(s.date, asOf);
    return d >= 0 && d < n;
  });
}

const missedSessionsRule = {
  type: 'missed_sessions',
  evaluate(athlete) {
    const recent = sessionsInLastNDays(athlete, 7);
    const missed = recent.filter(s => s.status === 'missed').length;
    if (missed >= 3) {
      return { severity: 'red', reason: `${missed} missed sessions in the last 7 days` };
    }
    if (missed >= 2) {
      return { severity: 'amber', reason: `${missed} missed sessions in the last 7 days` };
    }
    return null;
  },
};

// Placeholders filled in by later tasks
const fatigueRiskRule = {
  type: 'fatigue_risk',
  evaluate(athlete) {
    const tsb = athlete.current_fitness?.tsb;
    if (tsb == null) return null;
    if (tsb <= -25) {
      return { severity: 'red', reason: `TSB ${tsb.toFixed(0)} — deep fatigue, overtraining risk` };
    }
    if (tsb <= -15) {
      return { severity: 'amber', reason: `TSB ${tsb.toFixed(0)} — accumulating fatigue` };
    }
    return null;
  },
};
const trainingGapRule = {
  type: 'training_gap',
  evaluate(athlete) {
    const sessions = flattenSessions(athlete)
      .filter(s => s.status === 'completed')
      .sort((a, b) => b.date.localeCompare(a.date));
    const last = sessions[0];
    const gap = last ? daysBetween(last.date, athlete.asOf) : 999;
    if (gap >= 6) {
      return { severity: 'red', reason: last ? `No workouts logged for ${gap} days` : 'No workouts logged' };
    }
    if (gap >= 4) {
      return { severity: 'amber', reason: `No workouts logged for ${gap} days` };
    }
    return null;
  },
};
const moodKeywordRule = {
  type: 'mood_keyword',
  evaluate(athlete) {
    const hits = [];
    for (const s of flattenSessions(athlete)) {
      if (!s.comments || s.comments.length === 0) continue;
      const gap = daysBetween(s.date, athlete.asOf);
      if (gap < 0 || gap > 14) continue;
      for (const c of s.comments) {
        if (c.author_role === 'athlete' && MOOD_REGEX.test(c.text || '')) {
          hits.push({ date: s.date, text: c.text });
        }
      }
    }
    if (hits.length >= 2) {
      return { severity: 'red', reason: `${hits.length} mood-warning comments in the last 14 days` };
    }
    if (hits.length >= 1) {
      return { severity: 'amber', reason: `Mood warning: "${hits[0].text.slice(0, 40)}"` };
    }
    return null;
  },
};
const raceNotReadyRule = {
  type: 'race_not_ready',
  evaluate(athlete) {
    const ev = athlete.focus_event;
    if (!ev || !ev.ctl_target || !ev.date) return null;
    const daysOut = daysBetween(athlete.asOf, ev.date);
    if (daysOut < 0 || daysOut > 28) return null;
    const ctl = athlete.current_fitness?.ctl || 0;
    const pct = ctl / ev.ctl_target;
    if (daysOut <= 14 && pct < 0.8) {
      return {
        severity: 'red',
        reason: `${ev.name} in ${daysOut}d — CTL ${ctl.toFixed(0)} / target ${ev.ctl_target}`,
      };
    }
    if (daysOut <= 28 && pct < 0.85) {
      return {
        severity: 'amber',
        reason: `${ev.name} in ${daysOut}d — CTL ${ctl.toFixed(0)} / target ${ev.ctl_target}`,
      };
    }
    return null;
  },
};

export const RULES = [
  missedSessionsRule,
  fatigueRiskRule,
  trainingGapRule,
  moodKeywordRule,
  raceNotReadyRule,
];

export function evaluateFlags(athlete) {
  const out = [];
  for (const rule of RULES) {
    const res = rule.evaluate(athlete);
    if (res) {
      out.push({
        type: rule.type,
        severity: res.severity,
        reason: res.reason,
        triggered_at: athlete.asOf,
      });
    }
  }
  return out;
}

export function rollupStatus(flags) {
  if (flags.some(f => f.severity === 'red')) return 'needs_checkin';
  if (flags.some(f => f.severity === 'amber')) return 'watch';
  return 'on_track';
}

// Exported for tests
export const _helpers = { daysBetween, flattenSessions, sessionsInLastNDays, MOOD_REGEX };
