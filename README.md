# Perranporth AFC Match Data App

A lightweight web app for managing and reviewing Perranporth AFC first-team match data for the 2026/27 season.

The project started as a Google Sheets + Apps Script tool and is being progressively moved to a faster GitHub-hosted front end, while keeping Google Sheets as the underlying data store and Apps Script as the backend/API layer.

## Live app

**Control Centre:**
https://ajtbenanbar.github.io/Perranporth/

## What it does

The app currently covers:

- Match management and live event entry
- Squads, lineups and substitutions
- Goals, assists, zones and match events
- Player minutes and appearances
- Season dashboard and historic-season comparison
- 3–2–1 player voting and Dick of the Day voting
- Voting admin and results
- Player Portal with individual season stats
- Ghost Mode for management to view a player's portal read-only
- Match subs tracking and payment confirmation
- Fixture import/sync from the Perranporth AFC calendar

## Architecture

The project uses three main layers:

### GitHub Pages

Hosts most of the visible front end for speed and smoother mobile use.

Current GitHub-hosted pages include:

- `index.html` — Control Centre
- `dashboard.html` — Season Dashboard
- `subs.html` — Subs Tracker
- `voting.html` — Voting Centre
- `vote.html` — Player voting
- `player.html` — Player Portal
- `ghost.html` — Ghost Mode
- `bridge-client.js` — browser-to-backend communication helper

### Google Apps Script

Handles backend logic, authentication, spreadsheet reads/writes and API responses.

The Match Centre remains on Apps Script for now because it is tightly coupled to live match writes, clocks, substitutions and event entry.

### Google Sheets

Acts as the database for fixtures, matches, events, players, minutes, votes, subs and settings.

Main workbook:

`Perranporth Game Data 2026-27`

## Dashboard zone model

The dashboard uses an 11-zone attacking half-pitch model.

Important layout rule:

- Zones **1–5 are entirely inside the 18-yard box**
- Zones **1–3 are stacked centrally**
- Zones **4 and 5 sit either side of Zones 1–3**
- The dashboard pitch is a **half-pitch**, not a full pitch

The pitch markings are drawn with SVG so the penalty area, goal area, penalty mark and arc stay aligned with the zone layout.

## Current development direction

The project is being moved incrementally from Apps Script-hosted pages to GitHub Pages where it makes sense.

The goal is:

**GitHub Pages = user interface**  
**Apps Script = backend/API/authentication**  
**Google Sheets = data store**

This improves loading speed while preserving the existing spreadsheet-based workflow.

## Project handover / technical context

For detailed implementation notes, current deployment state, known issues, non-obvious rules and regression warnings, see:

[`PROJECT_CONTEXT.md`](./PROJECT_CONTEXT.md)

That file is the technical source of truth for continuing development safely.

## Important development notes

- Do not put passwords, PINs or other secrets in this public repository.
- Avoid replacing working files with older Apps Script-era versions without merging newer GitHub/API changes.
- Preserve the 11-zone half-pitch layout described above.
- The Subs Tracker, Player Portal, Ghost Mode and Voting pages depend on the Apps Script backend even though their visible UI is hosted on GitHub.
- Changes should be tested on mobile as the app is used heavily from phones on matchdays.

## Status

Active development — 2026/27 season.
