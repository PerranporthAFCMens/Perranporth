# Perranporth AFC App — Current State / Continuation Handoff

> **Purpose:** This is the current continuation note for the live Perranporth AFC implementation as at 16 September 2026. Read this before changing the live app in a fresh conversation.
>
> **Important:** Perranporth is now the live/reference implementation for the Football PA product. Productisation work should happen in `PerranporthAFCMens/Football-PA-Core`, not by experimenting against the live Perranporth system.

## 1. Repositories

Live/reference repo:
- `PerranporthAFCMens/Perranporth`

Productisation repo:
- `PerranporthAFCMens/Football-PA-Core`

Frozen pre-productisation reference branch:
- `snapshot-2026-09-16-pre-productisation`

Do not delete or rewrite that branch.

## 2. Current architecture

Live Perranporth remains:

- **GitHub Pages** — visible front end
- **Google Apps Script** — API, business logic, authentication/session handling and data writes
- **Google Sheets** — live data store

Control Centre:
- `https://PerranporthAFCMens.github.io/Perranporth/`

Main workbook:
- `Perranporth Game Data 2026-27`

Spreadsheet ID:
- `1GZrxajK6vApjG8kQeYKMZS_Dff7lZ52GgE_XFTKveM0`

Current Apps Script deployment:
- `https://script.google.com/macros/s/AKfycbyHHPOgGsImS9Kvr3SdZiKUGp3ZrbnOoJnIPUckm_Y9hH1K9b_j_Kgmw6UhzVMAyQ0q/exec`

## 3. Important correction to older documentation

Older project documentation says the Match Centre remains Apps Script-hosted. That is no longer the current user-facing structure.

The current GitHub repo contains:
- `match.html` — Match Centre
- `bridge-live.js` — current live RPC bridge

The app now also includes:
- `admin-panel.html`
- `admin-reset.html`
- `minutes.html`
- `live.html`

When debugging routing, inspect the current live file before relying on older notes.

## 4. Current Control Centre areas

Current management/public areas include:

- Match Centre
- Voting Centre
- Subs Tracker
- Season Dashboard
- Player Minutes
- Ghost Mode
- Player Portal
- Player PINs
- Admin Panel
- Live Spectator Board

## 5. Match Centre current behaviour

Recently implemented / verified behaviour includes:

- Half Time button changes to End Game in the second half
- Share Result only appears after finishing a match
- scorer and assister cannot be the same person
- No Assist remains supported
- default formation is 4-2-3-1
- Save Lineup / starting-lineup flow
- Resume Live Match
- newly added players must remain visible across match/line-up/subs views
- Pause should register optimistically/immediately in UI
- events can be edited and deleted
- trial/test matches are excluded from normal match lists
- double-submit protection remains important
- stoppage-time event timestamps must be preserved
- playing a complete half counts as 45 minutes regardless of first-half stoppage time
- playing the complete match counts as 90 minutes regardless of second-half stoppage time

## 6. Dashboard current behaviour

The dashboard was recently optimised and the user confirmed it became **much quicker**.

Current intended loading model:
- use the most recent cached current-season dashboard for a fast repeat render
- still request fresh live data every time the page is opened
- replace/refresh the view when fresh data arrives
- historic data must not block the current-season initial render

Do not convert this into stale-only caching.

### Zone-map rule

This remains critical:
- attacking half-pitch only
- Zones 1–5 fully inside the 18-yard box
- zones 1–3 stacked centrally
- zones 4/5 either side inside the box
- SVG pitch markings

See `PROJECT_CONTEXT.md` for the full zone geometry.

## 7. Management users and access

The Admin Panel now supports individual management users and granular access.

Access is intended to map to Control Centre areas, including:
- Match Centre
- Voting Centre
- Subs Tracker
- Season Dashboard
- Player Minutes
- Ghost Mode
- Player PINs
- Admin Panel

Preset roles may exist for convenience, but the long-term underlying model is granular permissions.

There is also a separate **Player access too** option for linking a management user to a Player Portal identity.

## 8. Management PIN/reset behaviour

Current management reset design:
- management-only account can use a 4–8 digit management PIN
- linked Player Portal + management account uses the same 4-digit PIN for both
- resetting a linked account updates both
- reset links are one-time and expire
- sessions can be revoked / signed out everywhere

Never expose:
- raw PINs
- PIN hashes
- session tokens
- reset tokens
- API keys

## 9. Transactional email

Management emails are now sent using **Resend**, not `MailApp`.

Sender:
- `Football PA <support@footballpa.com>`

Domain:
- `footballpa.com`

The domain has been verified in Resend.

The API key is stored server-side in Apps Script Script Properties under the Resend configuration. Never commit it or paste it into public documentation.

Email types:
- Welcome email — linked player/management account
- Welcome email — management-only account / create PIN
- Management PIN reset

Admin Panel includes a manual **Send Welcome Email** button and a separate **Send PIN Reset** button.

The welcome email lists the management areas currently assigned to that user.

Football PA branding/logo appears in the footer.

## 10. Management activity logging

A management audit log has been added/designed to record meaningful activity rather than every tap.

Expected examples:
- login/logout
- area/page opened
- welcome email sent
- PIN reset initiated
- access changes
- sessions revoked
- voting changes
- subs status changes
- meaningful match actions

A hidden sheet named:
- `Management Audit Log`

is used/expected for the audit data.

Do not log credentials or auth tokens.

The Admin Panel should expose an Activity Log to Full Admin users.

## 11. Performance monitoring

A dedicated page-speed/performance monitor has been agreed as a next requirement.

Desired metrics:
- page name
- user where authenticated
- first usable render
- data loaded
- total load time
- cache used or not
- live refresh success/failure

Desired admin summary:
- average load time
- slowest page
- recent loads
- flag slow loads (roughly >3 seconds)

Do not assume this is fully implemented until the current live code confirms it.

## 12. Voting

Voting remains 3–2–1 plus Dick of the Day.

Countback:
1. total points
2. number of 3-point votes
3. number of 2-point votes
4. number of 1-point votes
5. tie if still equal

The preferred future direction remains a permanent voting link with fixture/date validation, automatic opening around kick-off and automatic closing at midnight, but verify current implementation before assuming this is live.

## 13. Subs/payment semantics

Current match-subs amount in the Perranporth implementation remains £3 per played match.

Status meanings:
- Confirmed Paid
- Claims Paid
- Not Paid
- Unconfirmed
- N/A

Claims Paid must not be included again in the amount a player is asked to pay.

The current direct Monzo-style payment-link approach is considered **prototype-only** for Football PA productisation. Do not remove it from Perranporth until a replacement has been tested.

## 14. Player Portal / Ghost Mode

Player Portal currently provides personal stats, season information, voting/subs access and related player-specific information.

Ghost Mode must remain:
- management-only
- read-only
- equivalent to viewing that player’s portal

Do not merge similarly named players or alter player identities casually.

## 15. Live spectator view

`live.html` provides the public live-match view without management login.

It should remain separate from management authentication and must not expose protected admin/player information.

## 16. Football PA productisation decision

As of 16 September 2026, the decision is:

- keep Perranporth stable as the live/reference implementation
- build the saleable product in `Football-PA-Core`
- migrate authentication/data architecture there first
- only update Perranporth to the new Football PA platform when Core is proven

Target platform direction:
- proper Supabase authentication
- multi-club / multi-team structure
- configuration-driven branding and team setup
- central database rather than one copied spreadsheet/app per club
- professional onboarding
- payment-provider abstraction
- audit/performance tools

## 17. Supabase

The Supabase ChatGPT integration has been connected.

At the moment productisation started, the account had no Supabase projects yet.

Do not create a live-data migration blindly. Auth and schema should be introduced in the isolated Football PA Core environment first.

## 18. Backend source-of-truth warning

The user has manually pasted and deployed newer full `Code.gs` files during development.

Before making backend changes:
1. inspect the currently deployed/local latest backend source if available
2. compare it with `apps-script/code.gs` in GitHub
3. do not assume an older GitHub backend copy contains the latest email/audit/permission work
4. sync deliberately rather than overwriting newer live behaviour with an older GitHub file

This is particularly important for:
- Resend email sending
- management welcome emails
- granular permissions
- audit logging

## 19. Fresh-chat continuation

For Perranporth-specific work, start a new conversation with:

> **Continue the Perranporth live app. Read `CURRENT_STATE_2026-09-16.md` and `PROJECT_CONTEXT.md` in `PerranporthAFCMens/Perranporth` first. Inspect the current live files before making changes. Do not use Football PA Core experiments against live Perranporth data.**

For productisation work, use:

> **Continue Football PA productisation. Read `PRODUCTISATION_HANDOFF.md` in `PerranporthAFCMens/Football-PA-Core` first, then inspect the current Perranporth reference implementation.**

---

Last updated: **16 September 2026**
