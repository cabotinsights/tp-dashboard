#!/bin/bash
# DBT Dashboard - Daily Refresh Orchestrator
# Called by launchd at 7am. Two stages: pull raw TP data, then build data.json.
# Posts status JSON to $STATUS_WEBHOOK_URL (or ~/.config/tp-dashboard/status-webhook)
# at end of run so n8n can alert on failure.

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LOG_DIR="$HOME/tp-dashboard/logs"
mkdir -p "$LOG_DIR"
LOG_FILE="$LOG_DIR/refresh-$(date +%Y-%m-%d).log"

START_TS=$(date +%s)
echo "=== DBT Dashboard Refresh $(date) ===" >> "$LOG_FILE"

run_stage() {
  local name="$1"; shift
  local t0=$(date +%s)
  "$@" >> "$LOG_FILE" 2>&1
  local rc=$?
  local dur=$(( $(date +%s) - t0 ))
  eval "STAGE_${name}_RC=$rc"
  eval "STAGE_${name}_DUR=$dur"
  return $rc
}

# Stage A: pull raw TP data (non-fatal — last-good raw is reused)
run_stage "PULL_TP" "$REPO_ROOT/scripts/pull-tp-data.sh" || \
  echo "Stage A (pull) FAILED rc=$STAGE_PULL_TP_RC — continuing with last-good raw" >> "$LOG_FILE"

# Stage A.2: pull Gerhard's Dubai roster (non-fatal)
run_stage "PULL_DUBAI" python3 "$REPO_ROOT/scripts/pull-dubai-fast.py" || \
  echo "Stage A.2 (Dubai pull) FAILED rc=$STAGE_PULL_DUBAI_RC — continuing with last-good Dubai raw" >> "$LOG_FILE"

cd "$REPO_ROOT"

# Stage A.5: rebuild coach roster from Dubai raw
run_stage "BUILD_ROSTER" node scripts/build-dubai-roster.mjs

# Stage B: build data.json from raw + dummy (must succeed)
run_stage "BUILD_DATA" node scripts/build-data-json.mjs

# Stage C: tests (must succeed before commit)
run_stage "TESTS" node --test scripts/flag-rules.test.mjs scripts/build-data-json.test.mjs

GIT_PUSHED=false
GIT_RC=0
if [ "$STAGE_BUILD_DATA_RC" = "0" ] && [ "$STAGE_TESTS_RC" = "0" ]; then
  if ! git diff --quiet data.json; then
    git add data.json
    git commit -m "data: auto-refresh $(date +%Y-%m-%d)" >> "$LOG_FILE" 2>&1
    GITHUB_TOKEN= git push origin "$(git rev-parse --abbrev-ref HEAD)" >> "$LOG_FILE" 2>&1
    GIT_RC=$?
    if [ "$GIT_RC" = "0" ]; then GIT_PUSHED=true; else echo "Push failed rc=$GIT_RC" >> "$LOG_FILE"; fi
  else
    echo "No data.json changes to commit" >> "$LOG_FILE"
  fi
fi

# Roll up status
STATUS="ok"
if [ "$STAGE_BUILD_DATA_RC" != "0" ] || [ "$STAGE_TESTS_RC" != "0" ] || [ "$STAGE_BUILD_ROSTER_RC" != "0" ]; then
  STATUS="error"
elif [ "$STAGE_PULL_TP_RC" != "0" ] || [ "$STAGE_PULL_DUBAI_RC" != "0" ] || [ "$GIT_RC" != "0" ]; then
  STATUS="warning"
fi

# Raw-data freshness (age of stephen-bates.json in hours)
RAW_FILE="$REPO_ROOT/scripts/raw/stephen-bates.json"
if [ -f "$RAW_FILE" ]; then
  RAW_MTIME=$(stat -f %m "$RAW_FILE")
  RAW_AGE_HOURS=$(awk "BEGIN { printf \"%.1f\", ($(date +%s) - $RAW_MTIME) / 3600 }")
else
  RAW_AGE_HOURS="null"
fi

TOTAL_DUR=$(( $(date +%s) - START_TS ))
TIMESTAMP_UTC=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
HOST=$(hostname -s)

# Resolve webhook URL: env var > config file > skip
WEBHOOK_URL="${STATUS_WEBHOOK_URL:-}"
if [ -z "$WEBHOOK_URL" ] && [ -f "$HOME/.config/tp-dashboard/status-webhook" ]; then
  WEBHOOK_URL=$(tr -d '[:space:]' < "$HOME/.config/tp-dashboard/status-webhook")
fi

# Build status JSON. log_tail is last 80 lines, JSON-escaped.
LOG_TAIL=$(tail -n 80 "$LOG_FILE" | python3 -c 'import sys, json; print(json.dumps(sys.stdin.read()))')

STATUS_JSON=$(cat <<EOF
{
  "host": "$HOST",
  "timestamp_utc": "$TIMESTAMP_UTC",
  "status": "$STATUS",
  "duration_sec": $TOTAL_DUR,
  "stages": {
    "pull_tp":      {"rc": ${STAGE_PULL_TP_RC:-1},      "duration_sec": ${STAGE_PULL_TP_DUR:-0}},
    "pull_dubai":   {"rc": ${STAGE_PULL_DUBAI_RC:-1},   "duration_sec": ${STAGE_PULL_DUBAI_DUR:-0}},
    "build_roster": {"rc": ${STAGE_BUILD_ROSTER_RC:-1}, "duration_sec": ${STAGE_BUILD_ROSTER_DUR:-0}},
    "build_data":   {"rc": ${STAGE_BUILD_DATA_RC:-1},   "duration_sec": ${STAGE_BUILD_DATA_DUR:-0}},
    "tests":        {"rc": ${STAGE_TESTS_RC:-1},        "duration_sec": ${STAGE_TESTS_DUR:-0}},
    "git_push":     {"rc": ${GIT_RC:-0},                "pushed": $GIT_PUSHED}
  },
  "raw_age_hours": $RAW_AGE_HOURS,
  "log_tail": $LOG_TAIL
}
EOF
)

# Always write status to disk so we can inspect last run
echo "$STATUS_JSON" > "$LOG_DIR/last-run-status.json"

# Post to webhook if configured. Curl failure must not break the script.
if [ -n "$WEBHOOK_URL" ]; then
  curl -sS -m 30 -X POST -H "Content-Type: application/json" \
    -d "$STATUS_JSON" "$WEBHOOK_URL" \
    >> "$LOG_FILE" 2>&1 \
    || echo "Status POST to webhook failed" >> "$LOG_FILE"
else
  echo "No STATUS_WEBHOOK_URL configured — skipping status POST" >> "$LOG_FILE"
fi

echo "=== Done $(date) status=$STATUS ===" >> "$LOG_FILE"
