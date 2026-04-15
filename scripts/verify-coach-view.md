# Coach View Verification Checklist

Run this checklist on the **deployed Netlify URL** (not localhost, not screenshots) after every meaningful change to the coach view. Nothing ships until every box is ticked.

## Data Pipeline
- [ ] `node --test scripts/flag-rules.test.mjs scripts/build-data-json.test.mjs` exits 0
- [ ] `node scripts/build-data-json.mjs` regenerates `data.json` without errors
- [ ] `data.json` size is under 1 MB uncompressed (~200 KB gzipped is fine)
- [ ] `data.json` contains `roster`, `roster_summary` (object), `recent_comments_feed`, `weekly_totals`

## Triage Tab
- [ ] All 40 rows render
- [ ] Flagged-first sort: all `needs_checkin` rows appear before `watch` rows, which appear before `on_track`
- [ ] Search box filters the roster live
- [ ] Clicking a sport chip filters the table
- [ ] Clicking a flag chip filters the table
- [ ] Clicking an alert card filters the table by status
- [ ] "Why Flagged" column shows pills with readable text (not raw codes)
- [ ] Combining filters that match nothing shows the "No athletes match" empty state
- [ ] "Mark visible athletes as reviewed" updates the counter and persists across reload
- [ ] Clicking a row opens Athlete Detail

## Week View Tab
- [ ] Week picker defaults to the current week
- [ ] ◀ button steps back; ▶ is disabled on current week
- [ ] Four totals cards render with non-zero values
- [ ] Delta percentages render when stepping back at least one week
- [ ] Heatmap shows 40 × 7 grid
- [ ] Each cell shows a sport icon and a TSS number
- [ ] Hover tooltip shows session details (title, sport, TSS)
- [ ] Clicking a cell opens the correct athlete's detail
- [ ] Upcoming Races section groups into This Week / Next 2 Weeks / Within a Month / Later
- [ ] Recent Comments Feed shows at least 5 entries with athlete name, session title, sport tag
- [ ] At least one mood-flag icon appears in the comments feed

## Athlete Detail Tab
- [ ] Header shows name, status pill, and flag pills with hover reasons
- [ ] Row 1: Four fitness cards render (CTL, ATL, TSB, Compliance)
- [ ] Row 2: 12-week fitness trend chart draws with 3 datasets
- [ ] Row 3: Planned vs Actual bar chart draws with Mon-Sun labels
- [ ] Row 3: stat chips show compliance, TSS delivered, biggest gap
- [ ] Row 4: session rows expand inline on click
- [ ] Row 4: expanded panel shows description and comments (if any)
- [ ] Row 5: race countdown renders for athletes with a focus or next event
- [ ] Row 6: flag history dots appear for flagged athletes
- [ ] Back button returns to Triage

## Performance
- [ ] `data.json` loads in < 500 ms on Netlify
- [ ] Initial paint < 1 s
- [ ] Tab switching feels instant (no jank)
- [ ] No errors in browser console across all three tabs
- [ ] No errors on drill-down of any of 3 sampled athletes (one per status bucket)

## Smoke Test (dummy distribution)
- [ ] At least 3 athletes in `needs_checkin` bucket
- [ ] At least 3 athletes in `watch` bucket
- [ ] At least 3 athletes in `on_track` bucket
- [ ] At least one athlete exhibits each of the 5 flag types somewhere in the roster
- [ ] At least one mood-keyword flag visible in the recent comments feed
