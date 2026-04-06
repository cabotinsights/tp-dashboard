#!/bin/bash
# DBT Dashboard - Local Data Refresh
# Run: ./refresh.sh (or bash refresh.sh)
# Pulls fresh TP data via Claude Code MCP and pushes to GitHub

echo "🔄 Refreshing DBT Dashboard data..."
echo ""

claude --print "You are refreshing the DBT Dashboard data. Do these steps:

1. Pull fresh TrainingPeaks data using MCP tools:
   - tp_get_fitness(days: 90)
   - tp_get_workouts for the current TP week (Monday to Sunday) with type 'all'
   - tp_get_workouts for the next 7 days with type 'planned'
   - tp_get_weekly_summary for the current week
   - tp_get_weekly_summary for each of the previous 4 weeks
   - tp_get_next_event
   - tp_get_focus_event
   - tp_get_peaks for Bike power20min
   - tp_get_peaks for Run speed5K

2. Read /Users/stephenbates/tp-dashboard/dummy-athletes.json for dummy athlete data

3. Read the existing /Users/stephenbates/tp-dashboard/data.json to understand the structure

4. Build a new data.json with:
   - Real athlete data from TP (Stephen Bates, id: stephen-bates)
   - Compute: compliance_pct, by_sport breakdown, total_hours, total_tss
   - Compute flags: overreaching if TSB < -50, missed_2+ if 2+ planned not completed
   - Fitness history from the daily data (filter out zero-TSS days before training started)
   - Weekly trend from the weekly summaries
   - A coach_summary paragraph (2-3 sentences) interpreting the current training state
   - Determine if the data represents 'this week' or 'last week' based on today's date
   - All 5 dummy athletes merged in
   - roster_summary array for all 6 athletes
   - generated_at timestamp

5. Write the updated data.json to /Users/stephenbates/tp-dashboard/data.json

6. Commit and push:
   cd /Users/stephenbates/tp-dashboard
   git add data.json
   git commit -m 'data: refresh $(date +%Y-%m-%d_%H:%M)'
   GITHUB_TOKEN= git push origin main

7. Report what changed (new sessions, updated fitness numbers, etc.)
"

echo ""
echo "✅ Done. Dashboard will update on Netlify in ~1 minute."
