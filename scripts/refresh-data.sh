#!/bin/bash
# DBT Dashboard - Daily Refresh Orchestrator
# Called by launchd at 7am. Two stages: pull raw TP data, then build data.json.

set -e
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LOG_DIR="$HOME/tp-dashboard/logs"
mkdir -p "$LOG_DIR"
LOG_FILE="$LOG_DIR/refresh-$(date +%Y-%m-%d).log"

echo "=== DBT Dashboard Refresh $(date) ===" >> "$LOG_FILE"

# Stage A: pull raw data from TP MCP (non-fatal on failure — last-good raw is reused)
if ! "$REPO_ROOT/scripts/pull-tp-data.sh"; then
  echo "Stage A (pull) FAILED — continuing with last-good raw data" >> "$LOG_FILE"
fi

# Stage B: build data.json from raw + dummy (must succeed)
cd "$REPO_ROOT"
node scripts/build-data-json.mjs >> "$LOG_FILE" 2>&1

# Run tests before committing — if a rule broke, don't publish
node --test scripts/flag-rules.test.mjs scripts/build-data-json.test.mjs >> "$LOG_FILE" 2>&1 || {
  echo "Tests FAILED — not committing" >> "$LOG_FILE"
  exit 1
}

# Commit & push (only if data.json changed)
if ! git diff --quiet data.json; then
  git add data.json
  git commit -m "data: auto-refresh $(date +%Y-%m-%d)" >> "$LOG_FILE" 2>&1
  GITHUB_TOKEN= git push origin "$(git rev-parse --abbrev-ref HEAD)" >> "$LOG_FILE" 2>&1 || echo "Push failed" >> "$LOG_FILE"
else
  echo "No data.json changes to commit" >> "$LOG_FILE"
fi

echo "=== Done $(date) ===" >> "$LOG_FILE"
