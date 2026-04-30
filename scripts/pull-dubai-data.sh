#!/bin/bash
# Pull TP data for the 56 Dubai athletes from Gerhard's coach view.
# Saves raw responses to scripts/raw/dubai/<athlete_id>.json.
# Idempotent: skips athletes whose output file already exists with valid JSON.
# Throttled: batches of 10, 15s sleep between batches (slow + invisible to TP).

set -e
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
RAW_DIR="$REPO_ROOT/scripts/raw/dubai"
DUBAI_FILE="$REPO_ROOT/scripts/dubai-athletes.json"
mkdir -p "$RAW_DIR"

LOG_DIR="$HOME/tp-dashboard/logs"
mkdir -p "$LOG_DIR"
LOG_FILE="$LOG_DIR/pull-dubai-$(date +%Y-%m-%d-%H%M%S).log"

if [ ! -f "$DUBAI_FILE" ]; then
  echo "ERROR: $DUBAI_FILE not found" | tee -a "$LOG_FILE"
  exit 1
fi

TODAY=$(date +%Y-%m-%d)
RANGE_START=$(date -v-14d +%Y-%m-%d)
RANGE_END=$(date -v+7d +%Y-%m-%d)

echo "=== Dubai Pull $(date) ===" | tee -a "$LOG_FILE"
echo "Range: $RANGE_START → $RANGE_END" | tee -a "$LOG_FILE"
echo "Output: $RAW_DIR" | tee -a "$LOG_FILE"

# Get all IDs as a space-separated list
IDS=$(jq -r '.athletes[].id' "$DUBAI_FILE" | tr '\n' ' ')
NAMES_BY_ID=$(jq -c '.athletes' "$DUBAI_FILE")

# Split into batches of 10
BATCH_SIZE=10
BATCH_NUM=0
ID_ARRAY=($IDS)
TOTAL=${#ID_ARRAY[@]}

for ((i=0; i<TOTAL; i+=BATCH_SIZE)); do
  BATCH_NUM=$((BATCH_NUM + 1))
  BATCH_IDS="${ID_ARRAY[@]:i:BATCH_SIZE}"
  echo "" | tee -a "$LOG_FILE"
  echo "--- Batch $BATCH_NUM: $BATCH_IDS ---" | tee -a "$LOG_FILE"

  # Filter out IDs that already have valid output (idempotent)
  PENDING=""
  for id in $BATCH_IDS; do
    if [ ! -s "$RAW_DIR/$id.json" ] || ! jq -e '.fitness and .workouts' "$RAW_DIR/$id.json" >/dev/null 2>&1; then
      PENDING="$PENDING $id"
    else
      echo "  SKIP $id (already pulled)" | tee -a "$LOG_FILE"
    fi
  done
  PENDING=$(echo $PENDING | xargs)

  if [ -z "$PENDING" ]; then
    echo "  Whole batch already complete" | tee -a "$LOG_FILE"
  else
    echo "  Fetching: $PENDING" | tee -a "$LOG_FILE"

    PROMPT="Pull TP data for these athlete IDs from Gerhard's MCP: $PENDING.

For each ID, call BOTH:
  1. mcp__trainingpeaks-gerhard__tp_get_fitness(athlete: '<id>', days: 84)
  2. mcp__trainingpeaks-gerhard__tp_get_workouts(athlete: '<id>', start_date: '$RANGE_START', end_date: '$RANGE_END', type: 'all')

Run all calls in parallel (single message with multiple tool_use blocks).

Then for each ID, lookup the athlete name from $DUBAI_FILE and write a combined JSON file to $RAW_DIR/<id>.json with this exact shape:
{
  \"id\": <numeric id>,
  \"name\": \"<name>\",
  \"pulled_at\": \"$TODAY\",
  \"fitness\": <full fitness response>,
  \"workouts\": <full workouts response>
}

Output only one final line: 'Wrote N files'."

    claude -p "$PROMPT" \
      --allowedTools "mcp__trainingpeaks-gerhard__*,Read,Write,Bash" \
      >> "$LOG_FILE" 2>&1 || echo "  Batch $BATCH_NUM had errors (see log)" | tee -a "$LOG_FILE"
  fi

  # Sleep between batches (not after the last batch)
  if [ $((i + BATCH_SIZE)) -lt $TOTAL ]; then
    echo "  Sleeping 15s..." | tee -a "$LOG_FILE"
    sleep 15
  fi
done

echo "" | tee -a "$LOG_FILE"
echo "=== Pull complete $(date) ===" | tee -a "$LOG_FILE"
WRITTEN=$(find "$RAW_DIR" -name '*.json' | wc -l | xargs)
echo "Files in $RAW_DIR: $WRITTEN / $TOTAL" | tee -a "$LOG_FILE"
