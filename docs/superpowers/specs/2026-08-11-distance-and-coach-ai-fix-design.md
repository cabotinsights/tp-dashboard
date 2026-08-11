# Distance display + Coach AI fix

## 1. Distance not showing in This Week / Last Week tables

**Root cause:** `distance_km` is never fetched or mapped anywhere in the data
pipeline. The frontend already handles it correctly
(`s.distance_km ? s.distance_km + ' km' : '—'`); it always renders `—` because
the field never exists on the session objects it reads.

**Fix:**
- `scripts/pull-tp-http.mjs` → `mapWorkout()`: read `w.distance` (actual,
  meters) and `w.distancePlanned` (planned, meters) from the raw TrainingPeaks
  `fitness/v6` workout response. Field names confirmed against
  `~/trainingpeaks-mcp`'s client model, which hits the same TP endpoint.
  Output `distance_km` — actual when completed, else planned — rounded to 2dp,
  alongside the existing `duration_hours` / `tss_planned` / `tss_actual`.
- `scripts/build-data-json.mjs`: two places currently whitelist fields onto
  session objects and drop distance:
  - `inlineSessions.push(...)` inside `summarizeWeek()` — feeds
    `me.last_week.sessions` (Last Week table).
  - the `base = { date, title, sport, duration_hours }` object that builds
    `completed_sessions` / `upcoming_sessions` / `missed_sessions` — feeds
    `thisWeekSessions()` (This Week table).

  Add `distance_km: s.distance_km` to both.

No frontend changes needed. Takes effect on the next data refresh (scheduled
GitHub Actions run, or a manual `workflow_dispatch`).

## 2. Coach AI — fix broken response, add real back-and-forth

**Root cause (confirmed via a live test call against the production Netlify
API key):** `netlify/functions/ask-coach.js` is pinned to model id
`claude-sonnet-4-20250514`, which is retired — Anthropic returns
`not_found_error`, and the function's hardcoded fallback text
(`'Sorry, I could not generate a response.'`) is exactly what renders. The
current model also returns an extended-thinking block first in `content[]`
for this key, so `data.content[0].text` would still break after a plain model
swap — the code needs to select the actual text block, not assume index 0.

**Fix:**
- Swap model id to `claude-sonnet-5`.
- Parse response as `data.content.find(b => b.type === 'text')?.text` instead
  of `data.content[0].text`.
- Bump `max_tokens` 500 → 700 for thinking + answer headroom.
- **Add real conversation memory.** The frontend already keeps a
  `coachMessages` array and renders a running thread (capped at 8 = 4
  exchanges), but `askCoach()` only ever sends the current question — the
  model has no memory of earlier turns. Fix:
  - Frontend: when calling `/.netlify/functions/ask-coach`, send the last ~6
    prior messages from `coachMessages` (3 exchanges) as a `history` array of
    `{role, content}` pairs, alongside the existing `question` and
    `athleteData`.
  - Backend: build the Anthropic `messages` array as
    `[...history, {role: 'user', content: question}]` instead of a single
    user message. `athleteData` stays attached fresh in the system prompt on
    every call, so numbers never go stale mid-conversation.
  - History is in-memory only (`coachMessages` Alpine state) — resets on page
    reload, no localStorage, no "clear chat" control needed.
- `loadAiSummary()` (the auto-generated "Coach Analysis" paragraph at the top)
  is a separate one-shot call with no history — unaffected by the history
  change, but benefits from the model/parsing fix.

## Out of scope
- TrainingPeaks "Best Efforts" (read-only via MCP, not touched here).
- No new UI — the existing chat thread markup in `index.html` already
  supports rendering multiple messages.
