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
const trainingGapRule = { type: 'training_gap', evaluate() { return null; } };
const moodKeywordRule = { type: 'mood_keyword', evaluate() { return null; } };
const raceNotReadyRule = { type: 'race_not_ready', evaluate() { return null; } };

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
