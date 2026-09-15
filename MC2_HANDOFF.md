# Match Centre 2 — Handoff

> Purpose: continue the Match Centre migration safely in a fresh ChatGPT conversation. Read `PROJECT_CONTEXT.md` first, then this file.

## Goal

Move the visible Match Centre from Google Apps Script hosting to GitHub Pages while keeping Apps Script as the backend/API and Google Sheets as the database.

Do **not** switch the live Match Centre until MC2 has been tested thoroughly and Adam explicitly approves the cutover.

## Safety model

MC2 is a temporary parallel test environment, not a permanent second system.

Current live system remains untouched:
- Live Match Centre: Apps Script-hosted Admin
- Live workbook: `Perranporth Game Data 2026-27`
- Live spreadsheet ID: `1GZrxajK6vApjG8kQeYKMZS_Dff7lZ52GgE_XFTKveM0`

MC2 test environment:
- Test workbook: `Perranporth Match Centre 2 TEST Data`
- Test spreadsheet ID: `186mFZ-xXRPNbQQLhkuMFuMVjk0zBhsoUPmc1oi2LWa4`
- This workbook is a copy of the live workbook structure/data made specifically for isolated MC2 testing.

## MC2 package

A complete MC2 test package has been saved in ChatGPT Library at:
- `/Perranporth/Match_Centre_2_Test_Package.zip`

In a fresh chat, retrieve this exact Library file rather than asking Adam to upload it again.

Package contents:
- `match2.html` — GitHub Match Centre 2 front end, migrated from the current Admin baseline
- `bridge-mc2.js` — JSONP bridge for the MC2 test backend only
- `Code_MC2_TEST.gs` — test Apps Script backend pointing only to the MC2 test workbook
- `MC2_SETUP.md` — deployment instructions

## GitHub state

Repository:
- `PerranporthAFCMens/Perranporth`

`bridge-mc2.js` has already been added to GitHub.

Commit:
- `d071737166f5e7c03acac8abe82a8dc4acaaaf6a`

The full `match2.html` has **not** yet been published to GitHub because the MC2 Apps Script `/exec` URL is still needed first.

## What has already been done

- Created isolated MC2 test workbook.
- Generated MC2 backend from the current backend source.
- Changed backend `SPREADSHEET_ID` to the MC2 test workbook.
- Added Match Centre RPC functions to the GitHub JSONP whitelist.
- Converted the current Match Centre Admin UI away from `google.script.run` to the GitHub bridge pattern.
- Added separate MC2 browser storage keys (`pmd_admin_auth_mc2`, `pmd_session_mc2`).
- Added a prominent `MATCH CENTRE 2 — TEST ENVIRONMENT — NOT LIVE DATA` banner.
- Disabled in-admin Ghost Mode in MC2 so testing cannot cross into the live Player Portal.
- Checked that all Match Centre server calls used by MC2 are present in the RPC whitelist.
- Basic JavaScript syntax checks were run on the converted front end / bridge / backend.
- The live Match Centre and live workbook were not modified as part of MC2 setup.

## One manual step still required

Adam needs to create/deploy the MC2 Apps Script web app from the test workbook because ChatGPT cannot currently create/deploy a new Apps Script web app directly.

Steps:
1. Open `Perranporth Match Centre 2 TEST Data`.
2. Extensions → Apps Script.
3. Replace the script contents with `Code_MC2_TEST.gs` from the Library package.
4. Deploy → New deployment → Web app.
5. Execute as: Me.
6. Who has access: Anyone.
7. Copy the resulting `/exec` URL.
8. Give that URL to ChatGPT.

## Next actions after Adam supplies the MC2 `/exec` URL

1. Fetch current `bridge-mc2.js` from GitHub and update its placeholder backend URL.
2. Commit that change and record the commit SHA.
3. Publish the package's `match2.html` to GitHub as `match2.html`.
4. Do **not** change the existing Control Centre Match Centre button yet.
5. Test MC2 against the test workbook only.

## Test checklist before live cutover

At minimum test:
- management login and saved-session restore
- match selection and opening
- creating a test match
- squad setup/editing
- lineup builder, formation presets, drag/touch behaviour and save
- start match
- clock start/pause/resume and reload/session restore
- goals and conceded goals
- assists / zones / touches / goal types
- yellow/red cards
- substitutions
- half-time behaviour and stoppage-time timestamp handling
- second-half restart
- full-time
- reopening a completed match
- event edit/delete where supported
- past match view
- player management functions used inside Match Centre
- no duplicate submissions on repeated taps
- iPhone/mobile behaviour
- refresh/re-entry during an active match

Minutes rules must remain unchanged:
- whole first half = 45 minutes even if HT is in stoppage time
- whole match = 90 minutes even if FT is in stoppage time
- substitutions remain the source of truth for player minutes

## Cutover plan — only after successful testing and Adam approval

MC2 is intended to become the live Match Centre, not remain a second system.

The controlled cutover should be:
1. Point the proven GitHub Match Centre at the live backend/workbook using the chosen production backend arrangement.
2. Verify production login/read/write with a controlled test.
3. Change the Control Centre Match Centre link to the GitHub-hosted page.
4. Keep the old Apps Script Admin deployment available temporarily as fallback.
5. Retire the old Apps Script-hosted Match Centre only after real-world confidence.

Do not perform the live switch merely because MC2 loads. Adam must approve the cutover explicitly.

## New-chat starter prompt

Use:

> Continue the Perranporth app project. Read `PROJECT_CONTEXT.md` and `MC2_HANDOFF.md` in my GitHub repo first. Then retrieve `/Perranporth/Match_Centre_2_Test_Package.zip` from my ChatGPT Library. We are building Match Centre 2 as an isolated test environment before switching it live. Continue from the current handoff state; do not touch the live Match Centre or live workbook unless I explicitly approve the cutover.
