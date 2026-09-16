# Match Centre 2 — Historical Handoff / Migration Complete

> **Status:** The Match Centre 2 migration described in the older version of this document has now been completed. The GitHub-hosted Match Centre is part of the current Perranporth app. This file is retained as historical context and to preserve the migration/test logic.

For current development state, read first:
- [`CURRENT_STATE_2026-09-16.md`](./CURRENT_STATE_2026-09-16.md)
- [`PROJECT_CONTEXT.md`](./PROJECT_CONTEXT.md)

## What MC2 was

MC2 was the isolated migration path used to move the visible Match Centre away from Google Apps Script hosting and onto GitHub Pages while keeping Apps Script as the backend/API and Google Sheets as the live data store.

A separate test workbook and test deployment were used so the live Perranporth match system could not be damaged during migration.

## Current state

The live GitHub repository now contains:
- `match.html` — current GitHub-hosted Match Centre
- `bridge-live.js` — current live RPC bridge

The old description that the live Match Centre remains Apps Script-hosted is no longer current.

Perranporth remains the live/reference implementation while Football PA productisation happens separately in:
- `PerranporthAFCMens/Football-PA-Core`

A frozen pre-productisation branch exists at:
- `snapshot-2026-09-16-pre-productisation`

## Behaviour that came through MC2 and must remain protected

- management login/session restore
- match selection/opening
- creating trial/test matches
- squad setup/editing
- line-up builder
- formation presets
- default 4-2-3-1
- touch/mobile line-up behaviour
- starting-line-up save
- start match
- clock start/pause/resume
- refresh/re-entry during an active match
- goals/conceded goals
- assists/zones/touches/goal types
- yellow/red cards
- substitutions
- half-time and second-half restart
- full-time / finish-match flow
- Share Result only after the match is finished
- event editing and deletion
- player management functions used inside Match Centre
- duplicate-submit protection
- iPhone/mobile reliability

## Important current Match Centre rules

### Minutes
- a player who completes the whole first half gets **45 minutes**, even if half-time occurs in stoppage time
- a player who completes the whole match gets **90 minutes**, even if full-time occurs in stoppage time
- substitutions remain the source of truth for player minutes
- stoppage-time event timestamps must be preserved

### Events
- scorer and assister cannot be the same player
- No Assist remains valid
- events may be edited/deleted where supported
- repeated taps must not create duplicate events

### Match controls
- Half Time changes to End Game in the second half
- Pause should feel immediate in the UI
- Resume Live Match must restore the current live state
- newly added players must remain available across Match Centre / line-up / substitutes views

## Trial/test handling

Trial/Test/Demo matches must remain isolated from normal production lists/statistics unless deliberately included for testing.

Do not reintroduce old test fixtures into live dashboard, voting, subs or season statistics.

## Why this file remains

The MC2 process established an important development pattern that should continue into Football PA Core:

1. isolate risky architectural changes from production data
2. reproduce the working behaviour in a test environment
3. test the full matchday path on mobile
4. only cut over when the replacement is proven
5. keep a rollback/reference point

That same principle now applies to the Football PA Core migration.

## Fresh-chat instruction

Do **not** restart the old MC2 migration from this document.

Use instead:

> **Continue the Perranporth live app. Read `CURRENT_STATE_2026-09-16.md` and `PROJECT_CONTEXT.md` first, then inspect the current `match.html` and backend before making changes.**

For productisation:

> **Continue Football PA productisation. Read `PRODUCTISATION_HANDOFF.md` in `PerranporthAFCMens/Football-PA-Core` first.**

---

Last updated: **16 September 2026**
