#!/usr/bin/env python3
"""
Fast Dubai pull: speaks MCP JSON-RPC directly to tp-mcp-gerhard.

Replaces pull-dubai-data.sh which spawned `claude -p` per batch (~80s/athlete).
This script keeps ONE MCP subprocess alive for the whole pull (~1-2s/athlete).

Idempotent: skips athletes whose output file already has both fitness + workouts.
Throttled: 15s sleep between batches of 10 athletes (matches the shell version).
"""

import json
import os
import subprocess
import sys
import time
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
RAW_DIR = REPO_ROOT / "scripts" / "raw" / "dubai"
DUBAI_FILE = REPO_ROOT / "scripts" / "dubai-athletes.json"
MCP_BIN = Path.home() / "trainingpeaks-mcp" / ".venv" / "bin" / "tp-mcp-gerhard"

BATCH_SIZE = 10
BATCH_SLEEP_S = 15
TODAY = time.strftime("%Y-%m-%d")
# Workouts window: 14 days back, 7 days forward
RANGE_START = time.strftime("%Y-%m-%d", time.localtime(time.time() - 14 * 86400))
RANGE_END = time.strftime("%Y-%m-%d", time.localtime(time.time() + 7 * 86400))
# Metrics window: 30 days back (sleep/HRV/RHR for Roster Health Pulse)
METRICS_START = time.strftime("%Y-%m-%d", time.localtime(time.time() - 30 * 86400))

# TP metric type ids — see pull-tp-data.sh for the canonical mapping.
METRIC_TYPE_SLEEP_HOURS = 6
METRIC_TYPE_HRV = 60
METRIC_TYPE_PULSE = 5
METRIC_TYPE_DEEP = 46
METRIC_TYPE_REM = 47
METRIC_TYPE_LIGHT = 48
METRIC_TYPE_AWAKE = 50


class MCPClient:
    """Thin JSON-RPC line-delimited client for an MCP stdio server."""

    def __init__(self, server_cmd):
        self.proc = subprocess.Popen(
            server_cmd,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            bufsize=1,
        )
        self._next_id = 1

    def _send(self, payload):
        self.proc.stdin.write(json.dumps(payload) + "\n")
        self.proc.stdin.flush()

    def _read_response(self, expected_id):
        # Read lines until we get a response matching our id (skip notifications)
        while True:
            line = self.proc.stdout.readline()
            if not line:
                stderr = self.proc.stderr.read()
                raise RuntimeError(f"MCP server closed unexpectedly. stderr:\n{stderr}")
            try:
                msg = json.loads(line)
            except json.JSONDecodeError:
                continue
            if msg.get("id") == expected_id:
                if "error" in msg:
                    raise RuntimeError(f"MCP error: {msg['error']}")
                return msg.get("result", {})

    def initialize(self):
        req_id = self._next_id
        self._next_id += 1
        self._send({
            "jsonrpc": "2.0",
            "id": req_id,
            "method": "initialize",
            "params": {
                "protocolVersion": "2024-11-05",
                "capabilities": {},
                "clientInfo": {"name": "pull-dubai-fast", "version": "1.0"},
            },
        })
        self._read_response(req_id)
        # Send initialized notification (no response)
        self._send({"jsonrpc": "2.0", "method": "notifications/initialized", "params": {}})

    def call_tool(self, name, arguments):
        req_id = self._next_id
        self._next_id += 1
        self._send({
            "jsonrpc": "2.0",
            "id": req_id,
            "method": "tools/call",
            "params": {"name": name, "arguments": arguments},
        })
        result = self._read_response(req_id)
        # MCP wraps tool output in {"content":[{"type":"text","text":"..."}]}
        # Most TP MCP tools return JSON-as-text; parse it back.
        content = result.get("content", [])
        if content and isinstance(content, list):
            text = content[0].get("text", "")
            try:
                return json.loads(text)
            except json.JSONDecodeError:
                return {"raw_text": text}
        return result

    def close(self):
        try:
            self.proc.stdin.close()
        except Exception:
            pass
        try:
            self.proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            self.proc.kill()


def already_pulled(athlete_id):
    """Skip an athlete only if their file is fresh AND has all three blocks."""
    f = RAW_DIR / f"{athlete_id}.json"
    if not f.exists() or f.stat().st_size == 0:
        return False
    try:
        data = json.loads(f.read_text())
        if "fitness" not in data or "workouts" not in data or "recovery" not in data:
            return False
        # Re-pull if the file is older than today, so daily cron picks up fresh data.
        return data.get("pulled_at") == TODAY
    except (json.JSONDecodeError, OSError):
        return False


def parse_recovery(metrics_response):
    """Convert tp_get_metrics response into a per-day recovery array.

    Each day may have multiple parent records (e.g. nap + main sleep).
    For each calendar date, pick the parent record with the largest
    Sleep Hours, and read the rest of that group's labelled values.
    Skip dates with no group having Sleep Hours > 0.
    Returns a list sorted ascending by date.
    """
    if not metrics_response or "metrics" not in metrics_response:
        return []

    by_date = {}  # date -> list of {parent_id: {type: value}}

    for record in metrics_response.get("metrics", []):
        timestamp = record.get("timeStamp", "")
        if not timestamp:
            continue
        date = timestamp[:10]  # YYYY-MM-DD
        details = record.get("details", [])

        # Group details by parentId so we can pick the longest-sleep group.
        groups = {}
        for d in details:
            parent_id = d.get("parentId")
            if parent_id is None:
                continue
            if parent_id not in groups:
                groups[parent_id] = {}
            groups[parent_id][d.get("type")] = d.get("value")

        if date not in by_date:
            by_date[date] = []
        by_date[date].extend(groups.values())

    out = []
    for date in sorted(by_date.keys()):
        candidate_groups = by_date[date]
        # Pick group with largest Sleep Hours
        best = None
        best_sleep = 0
        for group in candidate_groups:
            sh = group.get(METRIC_TYPE_SLEEP_HOURS, 0) or 0
            if sh > best_sleep:
                best_sleep = sh
                best = group
        if best is None or best_sleep <= 0:
            continue
        out.append({
            "date": date,
            "sleep_hours": round(best.get(METRIC_TYPE_SLEEP_HOURS, 0) or 0, 2),
            "deep": round(best.get(METRIC_TYPE_DEEP, 0) or 0, 2),
            "light": round(best.get(METRIC_TYPE_LIGHT, 0) or 0, 2),
            "rem": round(best.get(METRIC_TYPE_REM, 0) or 0, 2),
            "awake": round(best.get(METRIC_TYPE_AWAKE, 0) or 0, 2),
            "hrv": best.get(METRIC_TYPE_HRV),
            "resting_hr": best.get(METRIC_TYPE_PULSE),
        })
    return out


def main():
    if not MCP_BIN.exists():
        print(f"ERROR: MCP binary not found at {MCP_BIN}", file=sys.stderr)
        sys.exit(1)
    if not DUBAI_FILE.exists():
        print(f"ERROR: {DUBAI_FILE} not found", file=sys.stderr)
        sys.exit(1)

    RAW_DIR.mkdir(parents=True, exist_ok=True)

    roster = json.loads(DUBAI_FILE.read_text())
    athletes = roster["athletes"]

    pending = [a for a in athletes if not already_pulled(a["id"])]
    print(f"=== Dubai fast pull {TODAY} ===")
    print(f"Range: {RANGE_START} → {RANGE_END}")
    print(f"Total: {len(athletes)}, already done: {len(athletes) - len(pending)}, pending: {len(pending)}")

    if not pending:
        print("Nothing to do.")
        return

    print(f"Starting MCP subprocess: {MCP_BIN}")
    client = MCPClient([str(MCP_BIN)])
    try:
        client.initialize()
        print("MCP initialized. Pulling...")
        t0 = time.time()
        for i, athlete in enumerate(pending):
            aid = str(athlete["id"])
            name = athlete["name"]
            t_athlete = time.time()
            try:
                fitness = client.call_tool("tp_get_fitness", {"athlete": aid, "days": 84})
                workouts = client.call_tool("tp_get_workouts", {
                    "athlete": aid,
                    "start_date": RANGE_START,
                    "end_date": RANGE_END,
                    "type": "all",
                })
                metrics_raw = client.call_tool("tp_get_metrics", {
                    "athlete": aid,
                    "start_date": METRICS_START,
                    "end_date": TODAY,
                })
            except RuntimeError as e:
                print(f"  [{i+1}/{len(pending)}] {aid} {name}: ERROR {e}")
                continue

            recovery = parse_recovery(metrics_raw)
            out = {
                "id": athlete["id"],
                "name": name,
                "pulled_at": TODAY,
                "fitness": fitness,
                "workouts": workouts,
                "recovery": recovery,
            }
            (RAW_DIR / f"{aid}.json").write_text(json.dumps(out, indent=2))
            elapsed = time.time() - t_athlete
            rec_count = len(recovery)
            print(f"  [{i+1}/{len(pending)}] {aid} {name}  ({elapsed:.1f}s, {rec_count}d recovery)")

            # Throttle: sleep between batches (not after the very last athlete)
            is_batch_end = (i + 1) % BATCH_SIZE == 0
            is_last = (i + 1) == len(pending)
            if is_batch_end and not is_last:
                print(f"  --- batch end, sleeping {BATCH_SLEEP_S}s ---")
                time.sleep(BATCH_SLEEP_S)

        total = time.time() - t0
        print(f"=== Done in {total:.1f}s ({total/len(pending):.1f}s/athlete avg) ===")
    finally:
        client.close()


if __name__ == "__main__":
    main()
