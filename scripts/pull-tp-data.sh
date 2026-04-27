#!/bin/bash
# Stage A: Pull raw TP MCP data for reachable athletes.
# Writes to scripts/raw/<athlete_id>.json.
# Currently only pulls for Stephen (cookie-authed account).
# DBT's 40 athletes remain dummy until his cookie is shared.

set -e
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
RAW_DIR="$REPO_ROOT/scripts/raw"
mkdir -p "$RAW_DIR"

LOG_DIR="$HOME/tp-dashboard/logs"
mkdir -p "$LOG_DIR"
LOG_FILE="$LOG_DIR/pull-$(date +%Y-%m-%d).log"

echo "=== TP Pull $(date) ===" >> "$LOG_FILE"

# Invoke Claude Code in non-interactive mode to use the TP MCP tools
# and dump raw output into scripts/raw/stephen-bates.json
claude -p "You are pulling TP data for the coach dashboard. Do this silently:

1. Use TP MCP tools to pull for Stephen Bates:
   - tp_get_fitness(days: 84)
   - tp_get_workouts for the last 7 days (type all)
   - tp_get_workouts for the current week (type all)
   - tp_get_workouts for the next 7 days (type planned)
   - tp_get_next_event and tp_get_focus_event
   - For each workout in the last 14 days, tp_get_workout_comments(workout_id)
   - tp_get_metrics(start_date: today minus 30 days, end_date: today) for sleep/HRV/RHR

2. Build a recovery array (one entry per date) from the metrics response.
   Each metric record's 'details' holds labelled values: 'Sleep Hours' (type 6),
   'Time in Deep Sleep' (46), 'Time in Light Sleep' (48), 'Time in REM Sleep' (47),
   'Time Awake' (50), 'HRV' (60), 'Pulse' (5).
   Some dates have multiple entries (split records or naps). For each date, pick
   the SINGLE detail-group with the largest 'Sleep Hours' value and use that
   group's deep/light/rem/awake/HRV/pulse. Skip dates that have no detail-group
   with Sleep Hours > 0. Sort ascending by date.

3. Assemble into this shape and write to $RAW_DIR/stephen-bates.json:
{
  \"id\": \"stephen-bates\",
  \"name\": \"Stephen Bates\",
  \"avatar_initials\": \"SB\",
  \"is_real\": true,
  \"current_fitness\": { ctl, atl, tsb, status },
  \"fitness_history\": [{date, ctl, atl, tsb}, ...],
  \"sessions_by_week\": {
    \"<ISO Monday>\": [
      {id, date, title, sport, duration_hours, tss_planned, tss_actual, status, description, comments: [...]}
    ]
  },
  \"focus_event\": {...} or null,
  \"next_event\": {...} or null,
  \"recovery\": [
    {\"date\": \"YYYY-MM-DD\", \"sleep_hours\": <num>, \"deep\": <num>, \"light\": <num>, \"rem\": <num>, \"awake\": <num>, \"hrv\": <num>, \"resting_hr\": <num>}
  ]
}

Output only a one-line summary of what was written." --allowedTools "mcp__trainingpeaks__*,Read,Write,Bash" >> "$LOG_FILE" 2>&1

echo "Finished: $(date)" >> "$LOG_FILE"
