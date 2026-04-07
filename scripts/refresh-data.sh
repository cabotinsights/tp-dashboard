#!/bin/bash
# DBT Dashboard - Automated Data Refresh
# Called by launchd daily at 7am
# Logs to ~/tp-dashboard/logs/

LOG_DIR="$HOME/tp-dashboard/logs"
mkdir -p "$LOG_DIR"
LOG_FILE="$LOG_DIR/refresh-$(date +%Y-%m-%d).log"

echo "=== DBT Dashboard Refresh ===" >> "$LOG_FILE"
echo "Started: $(date)" >> "$LOG_FILE"

# Run Claude Code non-interactively
claude -p "You are refreshing the DBT Dashboard data. Do these steps silently and efficiently:

1. Use the TrainingPeaks MCP tools to pull fresh data:
   - tp_get_fitness(days: 90)
   - tp_get_workouts for the current TP week (Mon-Sun) with type all
   - tp_get_workouts for the next 7 days with type planned
   - tp_get_weekly_summary for current week
   - tp_get_next_event and tp_get_focus_event
   - tp_get_peaks for Bike power20min and Run speed5K
   - tp_get_metrics for the last 7 days (sleep/HRV data)

2. Read /Users/stephenbates/tp-dashboard/data.json and /Users/stephenbates/tp-dashboard/dummy-athletes.json

3. Rebuild data.json with:
   - Updated fitness numbers, sessions, compliance
   - Fresh sleep/recovery data
   - Updated coach_summary (2-3 sentences on current state)
   - All dummy athletes kept as-is
   - Updated roster_summary

4. Write to /Users/stephenbates/tp-dashboard/data.json

5. Run: cd /Users/stephenbates/tp-dashboard && git add data.json && git commit -m 'data: auto-refresh $(date +%Y-%m-%d)' && GITHUB_TOKEN= git push origin main

Only output a brief summary of what changed." --allowedTools "mcp__trainingpeaks__*,Read,Write,Bash,Edit,Glob,Grep" >> "$LOG_FILE" 2>&1

echo "Finished: $(date)" >> "$LOG_FILE"
echo "===" >> "$LOG_FILE"
