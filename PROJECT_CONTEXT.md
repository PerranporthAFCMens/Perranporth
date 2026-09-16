# Perranporth 2026/27 App — Technical Source of Truth

> **Purpose:** Technical handoff for continuing the live Perranporth AFC 2026/27 app safely in a fresh ChatGPT conversation.
>
> **Read first:** [`CURRENT_STATE_2026-09-16.md`](./CURRENT_STATE_2026-09-16.md)
>
> **Important:** Perranporth is now the live/reference implementation for Football PA. Productisation work belongs in `PerranporthAFCMens/Football-PA-Core`, not against the live Perranporth system.

## 1. Working style

- Use British spelling.
- Prefer direct, practical answers.
- For Apps Script changes, provide one complete replacement `Code.gs` rather than fragments.
- Keep live changes incremental.
- Inspect current GitHub/live source before changing behaviour.
- Do not reconstruct the app from memory when source is available.
- Mobile/iPhone use is the priority.
- Never expose PINs, hashes, session tokens, reset tokens, API keys, dates of birth or other sensitive player data.

## 2. Repositories and rollback

Live/reference repository:
- `PerranporthAFCMens/Perranporth`

Football PA product repository:
- `PerranporthAFCMens/Football-PA-Core`

Frozen reference branch created before productisation:
- `snapshot-2026-09-16-pre-productisation`

Do not delete or rewrite the frozen branch.

## 3. Current architecture

- **GitHub Pages** = visible/mobile UI
- **Google Apps Script** = API, business logic, sessions/authentication and data writes
- **Google Sheets** = live data store

Control Centre:
- `https://PerranporthAFCMens.github.io/Perranporth/`

Apps Script deployment:
- `https://script.google.com/macros/s/AKfycbyHHPOgGsImS9Kvr3SdZiKUGp3ZrbnOoJnIPUckm_Y9hH1K9b_j_Kgmw6UhzVMAyQ0q/exec`

Main workbook:
- `Perranporth Game Data 2026-27`
- Spreadsheet ID: `1GZrxajK6vApjG8kQeYKMZS_Dff7lZ52GgE_XFTKveM0`

Important workbook tabs include Dashboard, Matchday, Voting Leaderboard, Subs, Matches, Events, Players, Settings, Votes and hidden support tabs.

## 4. Current GitHub pages

Current user-facing pages include:
- `index.html` — Control Centre
- `match.html` — Match Centre
- `dashboard.html` — Season Dashboard
- `minutes.html` — Player Minutes
- `subs.html` — Subs Tracker
- `voting.html` — Voting Centre
- `vote.html` — Player voting
- `player.html` — Player Portal
- `ghost.html` — Ghost Mode
- `pins.html` — Player PIN tools
- `admin-panel.html` — Admin Panel
- `admin-reset.html` — management reset page
- `live.html` — public Live Spectator Board

Shared support includes:
- `bridge-live.js`
- other bridge helpers retained for compatibility/history
- `button-feedback.js`

### Important correction

Older handoffs said Match Centre remained Apps Script-hosted. That migration is complete: `match.html` is now the current GitHub-hosted Match Centre frontend.

`MC2_HANDOFF.md` is now historical documentation of the migration and test strategy.

## 5. Apps Script / bridge model

GitHub pages cannot use `google.script.run`, so front-end pages call Apps Script through JSONP/RPC bridges.

Key rules:
- normal RPC timeout is around 30 seconds
- Player Portal / Ghost data builds may legitimately use a longer timeout around 60 seconds
- do not mistake a slow historic/player-data build for failed authentication
- do not move UI-feedback concerns into the transport layer

### Backend source warning

The live backend has been updated by manually pasting/deploying complete `Code.gs` files during development.

Before changing backend code:
1. compare current deployed/latest local backend source with `apps-script/code.gs`
2. do not assume the GitHub backend copy is newer
3. protect Resend, management permissions and audit-log work from accidental overwrite

## 6. Authentication and management access

Current live Perranporth still uses custom PIN/session authentication.

Management sessions are persistent browser sessions and can be revoked/sign-out-everywhere.

The Admin Panel supports individual management users with granular access.

Current permission areas include:
- Match Centre
- Voting Centre
- Subs Tracker
- Season Dashboard
- Player Minutes
- Ghost Mode
- Player PINs
- Admin Panel

Preset roles may remain as shortcuts, but underlying permissions should be granular.

`Player access too` is separate from management access and can link a management identity to a Player Portal identity.

Linked player/management accounts use the same four-digit PIN and a reset updates both.

Management-only accounts may use a 4–8 digit management PIN.

## 7. Transactional email

Management email uses **Resend** rather than `MailApp`.

Sender:
- `Football PA <support@footballpa.com>`

Domain:
- `footballpa.com`

The domain has been verified in Resend.

The Resend API key must remain in secure Apps Script Script Properties/server-side configuration and never in GitHub.

Current email flows:
- welcome email for linked player/management user
- welcome email for management-only user / create PIN
- management PIN reset

Admin Panel includes:
- Send Welcome Email
- Send PIN Reset
- Sign Out Everywhere
- Remove Management Access

Welcome emails should reflect the user’s current assigned access.

## 8. Management audit logging

A management audit/activity log has been introduced.

Expected meaningful events include:
- login/logout
- area/page opened
- management access changes
- welcome email sent
- PIN reset initiated
- sessions revoked
- voting state changes
- subs/payment status changes
- meaningful Match Centre actions

Expected hidden sheet:
- `Management Audit Log`

Never log credentials or auth tokens.

The Admin Panel should expose useful activity history to authorised Full Admin users.

## 9. Performance monitoring

A dedicated lightweight performance monitor is an agreed next requirement.

Desired measurements:
- page
- user where authenticated
- first usable render
- data loaded
- total load duration
- cached/uncached
- live refresh success/failure

Desired admin summary:
- average load time
- slowest page
- recent page loads
- flag slow loads (roughly above 3 seconds)

Verify the current live code before assuming this is fully implemented.

## 10. Dashboard loading behaviour

The dashboard was changed to a cached-first + live-refresh approach and the user confirmed it became much quicker.

Required behaviour:
- repeat visits may show the most recently cached current-season result immediately
- fresh live current-season data is still requested every time the dashboard opens
- the screen refreshes when the fresh response returns
- historic comparison must not block the initial current-season render
- do not turn this into stale-only caching

## 11. Dashboard — critical zone model

This has regressed before. Never replace it with a full-pitch diagram.

The visual is an **attacking half-pitch** with the goal line at the top.

### Required zones

- Zones 1–5 are entirely inside the 18-yard penalty area
- Zones 1–3 stack vertically in the central channel
- Zone 4 sits left of Zones 1–3 inside the box
- Zone 5 sits right of Zones 1–3 inside the box
- Zone 6 is upper-left outside the box
- Zone 7 is upper-right outside the box
- Zone 8 is central immediately outside the penalty area
- Zone 9 is the deeper left channel
- Zone 10 is the deeper central area
- Zone 11 is the deeper right channel

Known-good approximate CSS:

```css
.pitch{position:relative;background:#528844;border:3px solid #d9e8d2;border-radius:5px;aspect-ratio:1.30/1;overflow:hidden}
.z1{left:37%;top:0;width:26%;height:12%}
.z2{left:37%;top:12%;width:26%;height:11%}
.z3{left:37%;top:23%;width:26%;height:13%}
.z4{left:20%;top:0;width:17%;height:36%}
.z5{left:63%;top:0;width:17%;height:36%}
.z6{left:0;top:0;width:20%;height:36%}
.z7{left:80%;top:0;width:20%;height:36%}
.z8{left:20%;top:36%;width:60%;height:26%}
.z9{left:0;top:36%;width:20%;height:64%}
.z10{left:20%;top:62%;width:60%;height:38%}
.z11{left:80%;top:36%;width:20%;height:64%}
```

Pitch markings are drawn with SVG, including penalty area, six-yard box, goal mouth, penalty spot and arc.

Known-good marking geometry:

```html
<svg class="pitchSvg" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
  <line x1="0" y1="100" x2="100" y2="100" stroke="rgba(255,255,255,.72)" stroke-width="0.45"/>
  <rect x="20" y="0" width="60" height="36" fill="none" stroke="rgba(255,255,255,.72)" stroke-width="0.45"/>
  <rect x="36.5" y="0" width="27" height="12" fill="none" stroke="rgba(255,255,255,.72)" stroke-width="0.45"/>
  <rect x="44" y="0" width="12" height="2.2" fill="none" stroke="rgba(255,255,255,.82)" stroke-width="0.45"/>
  <circle cx="50" cy="24" r="0.55" fill="rgba(255,255,255,.9)"/>
  <path d="M 35.2 36 A 18.5 18.5 0 0 0 64.8 36" fill="none" stroke="rgba(255,255,255,.72)" stroke-width="0.45" stroke-linecap="round"/>
</svg>
```

Zone tiles show count as the large value and `Z1`, `Z2`, etc. underneath.

## 12. Dashboard/stat rules

- Current season: 2026/27
- Historic comparison: 2025/26
- same-stage comparison uses the first `min(current games, historic games)` matches
- an all-available-games comparison also exists
- Trial/Test/Demo matches must be excluded from normal views
- clean-sheet credit belongs in My Season
- a player who actually appeared in a match where Perranporth conceded zero receives a clean sheet; not goalkeeper-only

## 13. Match Centre rules

Current/required behaviour includes:
- default formation 4-2-3-1
- Half Time changes to End Game in the second half
- Share Result appears after Finish Match
- scorer cannot equal assister
- No Assist remains supported
- Save Lineup / starting-line-up flow
- Resume Live Match
- newly added players must remain available across match/line-up/subs views
- Pause should feel immediate/optimistic
- event edit and delete
- duplicate-submit protection

### Minutes
- complete first half = 45 minutes even with stoppage time
- complete match = 90 minutes even with stoppage time
- substitutions are the source of truth
- stoppage-time timestamps are preserved
- do not invent historic substitution times

## 14. Voting

Voting is 3–2–1 plus Dick of the Day.

Countback:
1. total points
2. number of 3-point votes
3. number of 2-point votes
4. number of 1-point votes
5. tied if still equal

Future preferred direction, if not already implemented:
- permanent voting link
- fixture/date validation
- open around scheduled kick-off
- close at midnight
- no voting on non-match days

Check live code before changing this flow.

## 15. Subs Tracker

Current Perranporth amount:
- £3 per played match

Statuses:
- Confirmed Paid
- Claims Paid
- Not Paid
- Unconfirmed
- N/A

Rules:
- payment amount includes Not Paid + Unconfirmed
- Claims Paid is excluded to prevent double payment
- management confirmation remains separate

The current Monzo-style link is a prototype/reference payment mechanism. Football PA Core will investigate a more professional low-cost Pay-by-Bank/Open-Banking style approach. Do not remove the working Perranporth mechanism until a tested replacement exists.

## 16. Player Portal / Ghost Mode

Player Portal includes personal stats, My Season, team summary, voting, subs/payment information and historic/current data where appropriate.

Ghost Mode must remain:
- management-only
- read-only
- equivalent to the selected player’s portal

Preserve distinct player identities exactly. Do not merge similarly named players.

## 17. Live spectator board

`live.html` is public and does not require management login.

It may show match score, clock, scorers/cards/interchanges/current line-up and live match updates, but must not expose protected management/player information.

## 18. UI interaction standard

- mobile first
- every tappable control should respond visually immediately
- long async actions should show busy/disabled state where practical
- success/failure must be obvious
- keep UI feedback separate from bridge/API transport logic

## 19. Productisation boundary

Football PA Core is the safe development environment for the saleable product.

Target direction:
- Supabase Auth
- Organisation → Club → Team → Season → Match / Player / Event
- one account can belong to multiple clubs/teams
- configuration-driven badge/colours/team/season
- self-service onboarding
- payment-provider abstraction
- performance and audit tooling
- gradual migration away from Sheets/Apps Script, not a big-bang rewrite

Read `PRODUCTISATION_HANDOFF.md` in `PerranporthAFCMens/Football-PA-Core` before product work.

## 20. Things not to regress

1. Fast GitHub-hosted mobile UI.
2. Current live dashboard data remains live.
3. Half-pitch zone visual; Zones 1–5 inside the box.
4. Match Centre minute/stoppage-time rules.
5. Duplicate-submit protection.
6. Trial/Test/Demo data excluded from normal views.
7. Subs status/payment semantics.
8. Voting countback.
9. Ghost Mode read-only.
10. Distinct player identities.
11. No secrets in GitHub/logs.
12. Resend email and granular management permission work.
13. Audit logging must not record credentials.

## 21. Fresh-chat workflow

For live Perranporth work, start with:

> **Continue the Perranporth live app. Read `CURRENT_STATE_2026-09-16.md` and `PROJECT_CONTEXT.md` in `PerranporthAFCMens/Perranporth` first. Inspect the current live files before making any change. Perranporth is the live reference implementation.**

Then:
1. fetch the current GitHub file(s)
2. compare with the reported issue
3. check current backend source/deployment if backend behaviour is involved
4. make the smallest safe change
5. test mobile behaviour
6. redeploy Apps Script only when required

For productisation, use the Football PA Core handoff instead.

---

Last updated: **16 September 2026**
