# Perranporth AFC Match Data App

Live/reference implementation of the Perranporth AFC Men’s first-team management system for the 2026/27 season.

This project is now also the **reference customer implementation for Football PA**. Productisation work is being developed separately in:

`PerranporthAFCMens/Football-PA-Core`

A frozen pre-productisation branch exists at:

`snapshot-2026-09-16-pre-productisation`

## Read this first

For current continuation state, recent changes and fresh-chat handoff instructions, read:

[`CURRENT_STATE_2026-09-16.md`](./CURRENT_STATE_2026-09-16.md)

For deeper historic implementation rules and regression warnings, also read:

[`PROJECT_CONTEXT.md`](./PROJECT_CONTEXT.md)

Do **not** make significant changes from memory when the current live files are available.

## Live app

**Control Centre:**
https://PerranporthAFCMens.github.io/Perranporth/

## Current architecture

- **GitHub Pages** — visible/mobile UI
- **Google Apps Script** — API, business logic, sessions/authentication and writes
- **Google Sheets** — live data store

Main workbook:

`Perranporth Game Data 2026-27`

## Current user-facing areas

- `index.html` — Control Centre
- `match.html` — Match Centre
- `voting.html` — Voting Centre
- `vote.html` — Player voting
- `subs.html` — Subs Tracker
- `dashboard.html` — Season Dashboard
- `minutes.html` — Player Minutes
- `ghost.html` — Ghost Mode
- `player.html` — Player Portal
- `pins.html` — Player PIN tools
- `admin-panel.html` — Management Admin Panel
- `admin-reset.html` — Management PIN reset
- `live.html` — public Live Spectator Board

Shared browser/API support includes `bridge-live.js`, other bridge helpers and `button-feedback.js`.

## What it currently does

- Match management and live event entry
- Squads, line-ups and substitutions
- Match clock, pause/resume and finish-match flow
- Goals, assists, cards, zones and event editing/deletion
- Player minutes and appearances
- Season dashboard and historic-season comparison
- Cached-first + live-refresh dashboard loading
- 3–2–1 player voting and Dick of the Day voting
- Voting admin/results
- Player Portal
- Ghost Mode
- Match subs tracking and payment confirmation
- Public spectator live board
- Individual management users
- Granular management permissions
- Welcome emails and PIN-reset emails through Resend
- Management audit/activity logging
- Session revocation / sign out everywhere

## Authentication / email

Perranporth still uses the current PIN/session model as the live reference implementation.

Management transactional email is sent through Resend using the verified `footballpa.com` domain.

Never commit or document:
- raw PINs
- PIN hashes
- session tokens
- reset tokens
- API keys
- sensitive player information

## Dashboard zone model

The dashboard uses an 11-zone **attacking half-pitch** model.

Critical visual rule:
- Zones **1–5 must remain entirely inside the 18-yard box**
- Zones 1–3 stack centrally
- Zones 4 and 5 sit either side inside the box
- the visual is a half-pitch, never a full-pitch replacement

See `PROJECT_CONTEXT.md` for the exact known-good geometry.

## Productisation boundary

Perranporth is now the stable reference implementation.

Do not use live Perranporth data/deployments as a sandbox for Football PA architecture experiments.

New platform work should happen in:

`PerranporthAFCMens/Football-PA-Core`

The intended Football PA direction includes:
- Supabase Auth
- multi-club / multi-team data model
- configuration-driven club branding/team setup
- granular memberships/permissions
- professional onboarding
- performance monitoring
- payment-provider abstraction

## Important development notes

- Mobile use is the priority.
- Inspect the current live files before changing architecture.
- Do not revert working GitHub-hosted flows back to older Apps Script-era versions.
- Do not assume `apps-script/code.gs` is newer than the currently deployed manually-pasted backend without checking.
- Preserve the 11-zone half-pitch rules.
- Preserve distinct player identities.
- Trial/Test/Demo data must stay out of normal live views.
- Ghost Mode remains read-only.
- Do not put secrets in GitHub.

## Fresh-chat continuation

Use:

> **Continue the Perranporth live app. Read `CURRENT_STATE_2026-09-16.md` and `PROJECT_CONTEXT.md` first, then inspect the current live files before changing anything.**

For Football PA productisation instead:

> **Continue Football PA productisation. Read `PRODUCTISATION_HANDOFF.md` in `PerranporthAFCMens/Football-PA-Core` first.**

## Status

Active live reference implementation — 2026/27 season.  
Football PA productisation started 16 September 2026.
