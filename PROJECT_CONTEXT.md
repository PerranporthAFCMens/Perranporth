# Perranporth 2026/27 App — Project Context / Source of Truth

> **Purpose:** This file is the technical handover for continuing the Perranporth AFC 2026/27 match-data / voting / player portal project in a fresh ChatGPT conversation. **Read this file before making changes.**
>
> **Important:** Treat the live GitHub repo and the current Apps Script deployment as the source of truth. Do not rebuild features from scratch or revert to older layouts unless specifically asked.

## 1. Working style

- Use British spelling.
- Prefer direct, practical answers and avoid unnecessary explanation.
- **For code changes: provide / apply whole-file replacements, never fragments.**
- Keep changes incremental and avoid multiple unrelated edits at once.
- If a regression appears, inspect the current live file and previous known-good behaviour before changing architecture.
- GitHub is connected to ChatGPT and can be edited directly when requested.
- Apps Script still requires manual paste/update and redeploy unless another deployment workflow is added later.

## 2. Current architecture

Preferred architecture:

- **GitHub Pages = front end / visible UI**
- **Google Apps Script = backend/API/auth/business logic**
- **Google Sheets = database**

The migration to GitHub was done because Apps Script pages were visibly slower and flashed old Google/Match Centre screens between routes.

### GitHub

Repository:
- `ajtbenanbar/Perranporth`

Pages root:
- `https://ajtbenanbar.github.io/Perranporth/`

Key GitHub files currently in use:
- `index.html` — Control Centre
- `dashboard.html` — Season Dashboard
- `subs.html` — Subs Tracker
- `ghost.html` — Ghost Mode selector
- `player.html` — Player Portal
- `voting.html` — Voting Centre
- `vote.html` — player voting page
- `bridge-client.js` — GitHub → Apps Script JSONP RPC bridge
- `apple-touch-icon.png`
- `manifest.webmanifest`

### Apps Script

Current deployment URL:
- `https://script.google.com/macros/s/AKfycbyHHPOgGsImS9Kvr3SdZiKUGp3ZrbnOoJnIPUckm_Y9hH1K9b_j_Kgmw6UhzVMAyQ0q/exec`

Apps Script remains the backend and also still hosts the Match Centre.

Current intended routing:
- GitHub `/` → Control Centre
- GitHub `/dashboard.html` → Season Dashboard
- GitHub `/subs.html` → Subs Tracker
- GitHub `/ghost.html` → Ghost Mode
- GitHub `/player.html` → Player Portal
- GitHub `/voting.html` → Voting Centre
- GitHub `/vote.html` → Player voting
- Apps Script `?page=admin` → Match Centre

**Match Centre should remain on Apps Script for now.** It is write-heavy and tightly coupled to live match actions, timers, event logging, substitutions and admin state. Do not migrate it casually.

## 3. Data workbook

Main Google Sheet:
- `Perranporth Game Data 2026-27`
- Spreadsheet ID: `1GZrxajK6vApjG8kQeYKMZS_Dff7lZ52GgE_XFTKveM0`

Important tabs:
- Dashboard
- Matchday
- Voting Leaderboard
- Subs
- Matches
- Events
- Players
- Lineup Positions (hidden)
- Player Match Data (hidden)
- Zones (hidden)
- Lists (hidden)
- Match Report (hidden)
- Settings (hidden)
- Votes (hidden)
- Subs Confirmations (hidden / auto-created when needed)

Do **not** use the older duplicate workbook unless explicitly asked.

## 4. Apps Script API / bridge

GitHub cannot use `google.script.run`, so the GitHub-hosted pages use Apps Script as an API.

The current bridge approach is **JSONP**, not an iframe.

`bridge-client.js` points at the Apps Script deployment and calls:
- `?api=rpc&callback=...&payload=...`

Reason for JSONP:
- avoids browser CORS restrictions
- avoids embedding the Google Apps Script web app in a hidden iframe
- hidden iframe approach caused Safari / iOS issues and visible Google navigation behaviour

Dashboard uses JSONP directly for public read-only data, including endpoints such as:
- `api=dashboardCurrent`
- `api=dashboardHistoric`

Subs uses RPC functions such as:
- `openSubsWithPin`
- `resumeSubs`
- `getSubsTrackerData`
- `setSubsStatus`
- `logoutAdminSession`

The latest Subs optimisation combined startup calls so it does not serially do verify → settings → tracker every time.

## 5. Authentication rules

Management pages use a 24-hour admin session stored in local storage under:
- `pmd_admin_auth`

Do **not** put management PINs, player PINs, dates of birth, payment-account details, safeguarding details or other sensitive/personal data into this public repository or context file.

Player Portal supports player-specific PINs and a first-login “choose your own 4-digit PIN” flow.

Ghost Mode is management-only and read-only.

## 6. Dashboard — CRITICAL zone-map requirement

This has regressed more than once. **Do not replace the zone maps with a full-pitch diagram.**

The correct visual is an **attacking half-pitch only**, with the goal line at the top and halfway line / outer half-pitch boundary at the bottom.

### Required zone layout

- **Zones 1–5 are entirely inside the 18-yard penalty area.**
- Zones 1–3 are stacked vertically in the centre.
- Zones 1–3 share the central / 6-yard-box-width channel.
- Zone 4 sits left of Zones 1–3 inside the 18-yard box.
- Zone 5 sits right of Zones 1–3 inside the 18-yard box.
- Zone 6 is outside the 18-yard box on the upper-left side.
- Zone 7 is outside the 18-yard box on the upper-right side.
- Zone 8 is central immediately outside the penalty area.
- Zone 9 is the left-side deeper channel.
- Zone 10 is the central deeper area.
- Zone 11 is the right-side deeper channel.

Known-good approximate CSS proportions:

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

Correct pitch markings are drawn with SVG, not CSS circles/arcs. The intended SVG includes:
- goal line at top
- 18-yard box around Zones 1–5
- 6-yard box centrally
- goal mouth
- penalty spot
- a proper penalty arc outside the penalty area

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

The zone tiles should display:
- the **count as the large number**
- `Z1`, `Z2`, etc. underneath as the small label

The current target appearance is the supplied mobile reference image: half-pitch heat maps titled Goal Locations and Assist Locations, with Zones 1–5 visibly enclosed by the penalty-area boundary.

## 7. Dashboard behaviour

Dashboard shows live current-season event data and historic comparison.

Important behaviours:
- Current season: 2026/27
- Historic comparison season: 2025/26
- Same-stage comparison is the default: compare the first `min(current games, historic games)` matches.
- An “all available games” comparison option also exists.
- Trial/Test/Demo matches must be excluded.
- A completed match only appears in the detailed dashboard when event data exists for it.

Clean-sheet rule:
- Clean Sheets belongs on “My Season”.
- Any player who actually appeared in a match where Perranporth conceded 0 gets a clean sheet — not goalkeeper-only.

## 8. Subs Tracker semantics

£3 per played match.

Status meanings:
- **Confirmed Paid** = green, payment confirmed by management
- **Claims Paid** = yellow, player claims they paid but management has not confirmed
- **Not Paid** = red
- **Unconfirmed** = grey
- **N/A** = not due

Payment rules:
- A player payment link includes only `Not Paid` + `Unconfirmed` items.
- `Claims Paid` is excluded from the amount to avoid double payment.
- Management confirmation is stored separately in `Subs Confirmations`.

Admin “By Player” view should show:
- unpaid matches
- exact amount due
- one combined payment link
- copyable match/payment summary
- Claims Paid listed as awaiting confirmation but excluded from amount due

## 9. Subs Tracker — CURRENT UNRESOLVED ISSUE

Current reported problem:

> “the subs tracker is still taking me through apps script”

Important facts already checked:
- live GitHub `index.html` links Subs to `./subs.html`
- live GitHub `subs.html` is GitHub-hosted
- `subs.html` loads `./bridge-client.js`
- `bridge-client.js` uses JSONP to the Apps Script backend
- the GitHub source does **not** intentionally navigate the visible browser to Apps Script

Therefore the next debugging step should **not** blindly rewrite Subs again.

Investigate whether:
1. an older iOS Home Screen / PWA shortcut is cached and still opening the pre-migration Apps Script route, or
2. a specific action inside Subs is causing visible navigation, or
3. Safari is following an Apps Script response unexpectedly.

Obtain the exact visible URL when the navigation happens, or reproduce by inspecting the live route. Do not assume the GitHub link itself is wrong unless verified.

## 10. Match Centre / event rules

Match Centre remains Apps Script.

Important event behaviour:
- double-submit protection exists for event save actions
- substitutions are the source of truth for minute calculations
- stoppage-time event timestamps are preserved
- a player playing the whole first half gets 45 minutes even if HT is 45+3
- a player playing the whole match gets 90 minutes even if FT is 90+5

Do not invent missing substitution times for historic games.

## 11. Voting

Voting is 3–2–1 plus Dick of the Day.

Voting Centre is intended to show:
- current voting match
- select match
- open / close voting
- player voting URL + copy
- ballots received
- Top 3
- Dick of the Day
- who has voted / still to vote

Countback ordering:
1. total points
2. number of 3-point votes
3. number of 2-point votes
4. number of 1-point votes
5. tied if still equal

## 12. Player Portal

Player Portal includes:
- personal stats
- My Season
- team dashboard summary
- voting when open
- subs/payment information
- historic / current comparison where appropriate

Ghost Mode must show the exact player portal read-only without requiring the player’s PIN.

Ghost selection key used in local storage:
- `pmd_ghost_player`

## 13. Player identity / naming rules

Do **not** list player names in this public context file.

The live player list and any aliases should be read from the Google Sheet / backend when needed.

Important implementation rule:
- preserve distinct player identities exactly as stored in the source data
- do not merge similarly named players
- historic aliases may exist and should be handled in code/data mapping rather than documented here

## 14. Match-data protection rules

Do **not** duplicate identifiable player-level match details in this public context file.

When changing or debugging match data:
- read the official current rows from the Google Sheet / Apps Script backend
- do not invent missing substitution times
- do not casually rework previously cleaned event/minute data
- preserve known official Match IDs and fixture records in the data source rather than copying them into this file

## 15. Test-data cleanup already completed

A previous test match dataset was fully removed from:
- Matches
- Subs
- Votes
- Settings voting selection

Do not reintroduce deleted test data into live views.

## 16. Things not to regress

Before any refactor, explicitly protect these:

1. GitHub front end remains fast and does not visibly bounce through Apps Script except Match Centre.
2. Dashboard zone maps are half-pitch, never full-pitch.
3. Zones 1–5 are inside the 18-yard box.
4. Dashboard data must remain live and not revert to `Season undefined` / zeros.
5. Subs statuses and payment semantics above must remain intact.
6. Ghost Mode is read-only.
7. Player Portal PIN selection/change flow must remain intact.
8. Trial/Test/Demo data stays out of normal dashboard/match lists.
9. Preserve distinct player identities; do not accidentally merge players.
10. Do not expose PINs, personal information or authentication secrets in GitHub.

## 17. Recommended workflow in a new chat

Start with:

> “Continue the Perranporth app project. Read `PROJECT_CONTEXT.md` in my GitHub repo first, then inspect the current live files before making any change.”

Then:
1. read this file
2. fetch the current GitHub file(s) involved
3. compare with the reported issue
4. make the smallest safe change
5. update GitHub directly where possible
6. if Apps Script changes are required, provide one complete replacement `Code.gs` / HTML file and exact redeploy instructions

Do not reconstruct the app from memory when live files are available.

---

Last updated: 14 Sep 2026
