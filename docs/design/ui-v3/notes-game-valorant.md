# Valorant — round 5 (agent-val)

All changes are uncommitted: desktop in `upforge-wt/rework`, AI in `upforge-wt/ai-fixes`. **No API changes**, because the API passes `match_data` straight through to the AI. Production was read-only.

## What shipped

### 1. Hit regions + 10-player economy kept, and new focus metrics
- **Desktop.** `electron/main/match-data-payload.ts` gains `slimRoundDetails()`.
  - `matchDetailsLite.rounds[]` now carries, per round, for all 10 players: `loadoutValue` / `spent` / `remaining` and every damage row with `headshots` / `bodyshots` / `legshots`.
  - Missing economy is `null` and missing hit counts are `0`; nothing is invented.
  - Test: `match-data-payload-round-details.test.ts`.
- **AI facts** (`services/match_report_facts.py`):
  - `hits`: own head/body/leg counts, shares, the same broken down by buy type, and a lobby rank by headshot share. Players with fewer than 10 hits are excluded from the lobby rank.
  - `buy_matchups`: team average loadout vs enemy average, split into anti-eco, eco vs full, half vs full and full vs full, with the rounds won. Pistols are skipped.
  - Both are `None` when the upload has no per-round data (older desktops).
- **New focus metrics:**
  - `headshot_hit_rate`: higher is better, linked to the `aim` finding.
  - `leg_hit_rate`: lower is better, linked to the `aim_legs` finding.
  - Without data they are `None`, never `0`.
- **Coach-note findings** (`services/match_report_notes.py`): `aim`, `aim_legs` and `buy_matchups`, only when the data exists.
  - The summaries say plainly that Riot counts hits that landed, not shots fired, so these are never presented as accuracy.
  - Every number in a claim is checked by `check_notes`.
- **Tests:** `tests/test_match_report_hits.py` (5): no-data case, shares, lobby rank, matchups, claim checking, and the focus suggestion.

### 2. Round story for the duel reviewer (golden cases first)
- **Bug found.** `build_moment_ground_truth` read `roundSummaries[].buyType`, which the desktop never sends; it sends `playerLoadoutValue` / `playerSpent`. So the reviewer was never told the round's buy.
- **Golden cases.** `tests/fixtures/coaching_claims/round_story_context.json` has 3 cases. All 3 failed `pytest -m claim_contract` first:
  - a full buy must not read as an eco
  - an opening duel must be named
  - "last alive" may only be said when the kill counts prove it
- **Fix** (`services/moment_context.py`):
  - `_round_buy()` classifies the buy from Riot economy via `classify_round_buy`.
  - `_round_story()` adds one of:
    - "this was the opening duel of the round (5v5)"
    - "XvY when you died"
    - "you were the last alive on your team (1vN)", only when every teammate is recorded dead first
- **Claim detection.** `services/claim_contracts.py` adds the `opening_duel` code and reads `round buy:` text into the economy codes.

### 3. Honest "stats-based report" state
- The AI and API already flag it: `report_type: degraded_telemetry`, and the API returns `is_degraded` plus `limitations`. Only the old post-game screen showed it.
- New `statsOnlyNotice()` in `src/components/v3/matchpage/match-page-v3.ts` (with tests). It shows under the coach sentence in `MatchPageHeaderV3.vue` and inside the report in `ReviewDetailV3.vue`: "Stats-based report. The video couldn't be reviewed for this match, so this coaching uses the match data only." plus the API's first listed limitation.
- No refund wording: the credit is currently kept for these reports (`VODAnalysisService` marks them completed). Refunding is a product decision for the lead.

### 4. Structured detectors
- `intelligence/events.py` adds `GameEvent.is_opening`, the first Riot kill of each round. It is `None` when there's no timing.
- `behaviours/valorant.yaml` gives `positioning` a real `rule` detector: two or more isolated deaths, which is spacing only and never claims "untraded". There are now 4 real detectors; `tests/test_intelligence_graduated.py` was updated on purpose.
- **Not done:** over-peeking and re-peeking have no Riot data; re-peek only exists as a Gemini claim guard. The live coaching tags still come from the locked regex tables, while the detectors run in shadow mode. Switching tags to detectors is its own change, because the catalogue tests pin the legacy tables.

### 5. Focus → drills, with before and since
- `focus-drills.ts`: the new metrics map to `head_height` + `microadjust` (headshot) and `head_height` + `sixshot` (legs).
- `focusBeforeAfter()` in `src/lib/focus.ts` (tested) feeds a new Practice line: "Before: 30% · Since: 15% over 2 games · better". It stays hidden until a game has been checked.

### 6. `/vod-review` Bind fixture route: not built
The Bind fixture has no video and no `matchDetails`, so it can't drive the player. Dev › VOD library already loads production fixtures; it downloads data, so I didn't use it.

## Checks
- **Desktop:**
  - `npm run type-check` is clean.
  - `npx eslint` is clean on all changed files.
  - `npm test`: 1,557 passed, 9 skipped.
- **AI:**
  - `pytest`: 858 passed, 29 skipped.
  - `pytest -m claim_contract`: 320 passed, 3 skipped.
  - Run with a dummy `ANTHROPIC_API_KEY` and the main checkout's venv.
- **API:** no files changed, so it wasn't re-run. I didn't need the AI symlink.

## Deploy order
1. **AI first.** It reads `matchDetailsLite.rounds` when present and returns `None` otherwise, so it's safe with old desktops.
2. **Desktop** (version bump + tag) to start sending `rounds`.

There are no migrations and no API changes. Payload size grows by roughly 50–80 KB per match in `match_data`, at 24 rounds × 10 players. The match-report path doesn't store `match_data`; the VOD path does.

## For the lead (shared files)
- **Plans** (`config/tiers.php`, `config/games.php`): remove the legacy "3 free" per-game quotas, and make Plus visibly deeper than Free, e.g. 8 moments or the stronger model. Map item 11.
- **Web twin:** `upforge-frontend/app/lib/match-report-facts.ts` doesn't compute `hits` or `buy_matchups`. Web reports won't show the new findings until it's ported; existing Bind numbers are unchanged.
- **Credit policy** for stats-only reports: refund, or keep with the honest label (current).

## Plan: whole-round review (the paid unit), not built
1. **Selection:** score rounds by impact (lost with the player alive at 30 s, first death in a lost round, a clutch). Offer the player the 3 most worth a credit, as in P6 "Rounds worth reviewing".
2. **Clip:** cut from round start to round end using `roundReplay` keyframes, adding Riot `killEvents` time anchors to the existing VOD offsets.
3. **Observe:** sample at 1 fps, raised to 4 fps in ±3 s windows around each kill. One Gemini pass per round with the round story from `_round_story()`, `buy_matchups` and all-10 positions at each kill.
4. **Write:** one Claude pass per round: what decided it, the player's 1–2 decisions, one fix. Guard it with the existing claim guards and new golden cases (rotations, utility timing).
5. **Price:** 1 credit per round. Plus 10 a month, Pro 30. Needs tier config, the lead's file.

Files: AI `pipelines/valorant_round_review.py` (new) and `config/valorant_coaching.py`; API job + tiers; desktop match page "Review this round" action on the rounds strip.

## Scores (honest, after this round)
| Step | Before | Now | Why |
|---|---|---|---|
| Setup & linking | 4 | 4 | Unchanged. The v3 onboarding steps after the capture check are still unverified with a real first run. |
| Detect & record | 5 | 5 | Unchanged. |
| Data | 4 | 5 | Hit regions and the 10-player economy now reach the AI. Nothing useful in Riot's match is dropped any more. |
| Coaching | 4 | 4.5 | The reviewer now gets the real buy, alive counts and the opening duel. Aim and buy-matchup findings are claim-checked, and there are 6 focus metrics. Still missing: whole-round review, and live tags from detectors. |
| What players see | 3 | 3.5 | Stats-only reports are labelled; Practice shows drills and before/since for every metric. The match page is still unproven on a real recording, and web doesn't show the new findings. |
| Paying | 3 | 3 | Needs the lead's tier clean-up and a stats-only credit policy. |
| **Overall** | 3.8 | **4.2** | |


---

# Valorant — round 6 (agent-val)

All uncommitted: API in `upforge-wt/api-fixes`, AI in `upforge-wt/ai-fixes`, desktop in `upforge-wt/rework`. Production was not touched (one read-only screenshot of a dev-only route).

## 1. Stats-only reports return the credit (decision: refund, still deliver)
- **API** `app/Services/VODAnalysisService.php`:
  - `refundStatsOnlyCredit()` runs in `processCompletedJob` before the poll payload is built.
  - It refunds when: game is Valorant, the credit was reserved, it hasn't been refunded already, and `isDegradedTelemetryReport()` is true.
  - It goes through the existing `GameQuotaService::release()` path and stores `credit_refunded: true` plus `credit_refund_reason: stats_only_report` on the job.
  - **Idempotent:** guarded by the `credit_refunded` flag, and `processCompletedJob` returns early once a log exists.
  - Paid Deep Scan payment intents are not refunded here; only the analysis credit.
- **Flags returned:**
  - Poll payload: `credit_returned`.
  - `/api/analysis/{id}` adds `report_type`, `coaching_source`, `limitations`, `is_degraded`, `credit_returned`.
  - `credit_returned` uses the indexed `analysis_log_id` lookup when the existing JSON lookup returns nothing (it needs MySQL JSON functions).
- **Desktop:**
  - `src/lib/analysis-enrichment.ts` now passes the flags through. Before this, enrichment dropped them, so the round-5 "Stats-based report" notice could never show on the v3 match page.
  - `statsOnlyNotice()` shows "We couldn’t review the video. Your credit was returned. This coaching uses the match data only." only when `credit_returned === true`. Older charged reports keep the neutral wording.
- **Tests:**
  - API `tests/Feature/StatsOnlyRefundTest.php` (3 tests: refund once and idempotent on a retried callback, a full video report keeps the credit, other games unaffected). With the refund call disabled, the main test failed.
  - AI `tests/test_stats_only_refund_contract.py`: the degraded result carries every flag the API reads, at top level and in the stored JSON.
  - Desktop: enrichment and notice tests.

## 2. Live coaching tags from the structured detectors
- **Catalogue:**
  - `behaviours/catalogue.py` adds a `tag_source` field (`regex` default | `detector`), validated: `detector` requires a detector block. It also adds `detector_tag_ids()`.
  - `behaviours/valorant.yaml` marks `untraded_death`, `crosshair` and `positioning` as `tag_source: detector`. Their detectors measure exactly the tag's claim.
  - `economy` stays on the regex: its detector is neutral (it counts light buys), so it doesn't measure "economy mistake".
- **Postprocess** `services/coaching_postprocess.py` → `_apply_detector_tags()`. In `live` mode, when detectors ran:
  - A detector-backed tag is kept only if measured.
  - A measured one the coach didn't word is added first.
  - Without match data, or in `shadow`/`off` mode (the rollback), the legacy regex tags are untouched.
  - Changes are logged as `Detector tags: added/removed`.
- **Tests:**
  - The pinned regex tables in `test_behaviour_catalogue.py` are unchanged; the patterns weren't touched.
  - New `tests/test_detector_tags.py` (6 tests). With the step disabled, 2 failed.
  - No claim text changes, so no golden case was needed.
- **Knock-on:** Laravel reads `coaching_tags` for category history. Prose-only "untraded" mentions on fully traded matches no longer count.

## 3. Dev fixture route for the v3 match page
- **Files:**
  - `src/dev/fixtures/valorant-bind-match.json`: a copy of the anonymised real Bind match from `upforge-frontend/tests/fixtures/valorant-match-report-bind.json`.
  - `src/dev/bind-fixture-timeline.ts`, with a test.
  - `src/views/DevMatchFixtureView.vue`.
  - Route `/dev/match-fixture`, registered only when `import.meta.env.DEV`. The view also redirects to Home outside dev.
- **What it does:** sets `pendingTimeline` and opens `/vod-review?timelineId=dev-bind-fixture`. It makes no network calls.
- **Events:** placed by game time. The player area shows "Dev fixture: real Bind match data with no recording attached." (`VodReviewBody` `noVideoHint`).
- **Checked on screen:** the header reads DEFEAT 9–13 on Bind as Jett, 11/18/3. The rounds strip shows 9 won of 22, and the round log shows real moments.
- **For the lead:** the play-button overlay sits on top of the "No video" placeholder text. This happens on any match without a recording, not only the fixture.
- Kill/death markers don't show on the seek bar without a video duration.

## 4. Whole-round review — first slice (flag off by default)
- `pipelines/valorant_round_review.py`. The flag is `VALORANT_ROUND_REVIEW_ENABLED=1`; otherwise it raises `RoundReviewDisabled`.
  - `build_round_review_context(match_data, round_number)` uses Riot data only:
    - the result, the buy, plant and defuse
    - every kill in order with alive counts after it
    - the player's death story (opening duel / NvM / last alive)
    - `allowed_claims`
  - `round_clip_windows()`: ±3 s around each of the player's kills and deaths, merged when overlapping, shaped like duel moments.
  - `run_round_review()`: the existing duel observer on those windows → one `generate_coaching` pass (pipeline `valorant_round_review`) → `guard_round_claims()`.
  - The guard drops any sentence claiming a round fact (opening duel, last alive, traded/untraded, buy type, including plain-prose "eco"/"full buy") not in `allowed_claims`.
- **Golden cases first:** `tests/fixtures/coaching_claims/round_review_context.json` has 3 cases with new layers `round_review_context` and `round_review_guard` in `services/claim_contracts.py`. All 3 failed `pytest -m claim_contract` before the pipeline existed.
- **Tests:** `tests/test_valorant_round_review.py` (6): flag off, context, unknown round refused, window merging, no video anchors refused, guarded writer output.
- **Not in this slice:**
  - API job and route
  - pricing (1 credit per round; Plus 10 / Pro 30 is a proposal for `config/tiers.php`)
  - the desktop "Review this round" action on the rounds strip
  - round selection ("3 rounds worth a credit")
  - 1 fps whole-round sampling (it uses event windows today)

## 5. Web report port — spec only (frontend is the user's main checkout)
In `upforge-frontend`:
1. **`app/lib/match-report-facts.ts`:** port `hits` and `buy_matchups` from AI `services/match_report_facts.py` (round 5) with the same rules:
   - Hit counts come from `matchDetailsLite.rounds[].players[].damage[].{headshots,bodyshots,legshots}`.
   - The lobby rank excludes players with fewer than 10 hits.
   - Buy matchups compare team vs enemy average `loadoutValue` and skip pistols.
   - Both are `null` without per-round data.
2. **Coach notes:** add the `aim`, `aim_legs` and `buy_matchups` findings to the web coach-note list, with the "hits that landed, not shots fired" wording.
3. **Focus metrics on web:** `headshot_hit_rate` (higher is better) and `leg_hit_rate` (lower is better).
4. **Web Valorant results page:** when `analysis.is_degraded`, show "Stats-based report" and the first `limitations` entry. When `analysis.credit_returned`, add "Your credit was returned."
5. **Test:** extend the Bind fixture test so old uploads without `rounds` show nothing rather than zeros.

## Checks (round 6)
| Repo | Check | Result |
|---|---|---|
| AI | `pytest` | 883 passed, 9 failed, all in CS2 files another helper is editing (`test_cs2_demo_analyzer`, `test_cs2_demo_evidence`, `test_cs2_match_stats_v1_extract`, `test_cs2_scoreboard`) |
| AI | `pytest -m claim_contract` | 327 passed; 6 failures, all CS2 work in progress |
| API | full `php artisan test` (temporary `upforge-wt/upforge-ai-service → ai-fixes` symlink, removed after) | 1043 passed, 5 failed: the same 5 that fail on origin/main |
| Desktop | `npm run type-check` / `npx eslint` (changed files) / `npm test` | clean / clean / 1621 passed |

## Deploy order (round 6)
1. **AI:** detector tags (rollback: `INTELLIGENCE_FRAMEWORK=shadow`) and the round-review pipeline, which stays off.
2. **API:** the stats-only refund and the detail flags. No migrations.
3. **Desktop:** version bump and tag, for the refund wording and the enrichment pass-through. The dev route is not in production builds.

## Scores (honest, after round 6)
| Step | R5 | Now | Why |
|---|---|---|---|
| Setup & linking | 4 | 4 | Unchanged; the v3 onboarding steps after the capture check are still unverified on a real first run. |
| Detect & record | 5 | 5 | Unchanged. |
| Data | 5 | 5 | Unchanged. |
| Coaching | 4.5 | 4.5 | Tags now follow measurements for the three measured behaviours. Whole-round review exists but is off and unpriced, so it doesn't count yet. |
| What players see | 3.5 | 4 | The stats-only label now reaches the v3 screens (it was silently dropped) with honest refund wording. The v3 match page is checked on real match data via the dev fixture. Web still lacks the new findings (spec above). |
| Paying | 3 | 3.5 | Stats-only reports return the credit. Plus vs Free depth and legacy plans are still proposals. |
| **Overall** | 4.2 | **4.3** | |

## What's left for 5
- Price and ship whole-round review: API job, desktop rounds-strip action, round selection.
- Port the web report (spec above).
- Plans: make Plus visibly deeper than Free, and remove the legacy per-game quotas.
- A real first-run check of the v3 onboarding steps.
- Fix the play-button overlay over the "no recording" placeholder (lead, `VodReviewBody`).

## Round 7 (r7-val)
| Item | Status | What / where |
|---|---|---|
| P1-04 post-game focus pips | Done | `PostGameV3` reads the saved focus (`app.getFocus`, no network) and follows `focus:updated`. One pip per required game (hit / miss / open), sentence in whole numbers: "On target in 1 of your last 2 games, 3 needed." Helper `postGameFocusStrip()` + 3 tests. |
| P1-04 "Review this round" | Not done | PostGameV3 has no recording id/route; needs a `PostGameView` prop + navigation (switch file). Next round. |
| Board 4 Home rounds line | Already present | `HomeV3` renders `UfRoundsLine` from `focusLatest.rounds` (round 2). It only shows when the last synced report carries round facts — board-gap's "no rounds line" is a data gap (no synced report with `rounds` on this account), not missing UI. No mount needed from r7-platform. |
| P1-05 death clips | Done | New `trigger: 'death'`, Valorant only, setting `clipCapture.deaths` (default on, Settings › Recording "Your deaths"). `death-clips.ts` `pickDeathClips()` — opening deaths first, cap **4 per match**, skips deaths without a video offset (4 tests). Clip = 8 s before to 3 s after; title "Opening death · Round 7". Ranked below every highlight (`clipRank` → 20) so deaths never become top moments. Both extraction paths (match end + late retry). |
| P1-07 enemy habits | Done | `enemy-habits.ts` `computeEnemyHabits()` from the round replay (Riot per-kill position snapshots) → callout via `resolveCallout`; counts enemy kills + opening kills per callout, only callouts with ≥ 3 kills, top 5 (3 tests). Read-only IPC `valorant:enemy-habits` (`ipc/enemy-habits-ipc.ts`, registered in index.ts marked block) → `stats.enemyHabits(recordingId)`. `EnemyHabitsV3` on the match page (Valorant only). No AI text → no claim contract needed; copy states what is counted. |
| P1-02 FocusService excludes alts | Already done on `feat/match-account-tag` (upforge-wt/api) | `MatchReportService` skips `checkMatch`/`startFromSuggestion` when `!$isMain`; test `test_alt_account_matches_get_notes_but_do_not_check_the_focus`. **That branch must ship alongside api-fixes** (it isn't in api-fixes, which is origin/main-based). |
| P1-06 callouts/distance in round story | Not done | Round story already passes buy/alive/opening (round 6); callouts per death need the replay in the AI context — next round. |
| P1-11 coach memory (writable) | Not done | No write endpoint found beyond the knowledge-bank read used in round 6's "What keeps coming up". |
| Board 18b deep tabs | Partial | Enemy habits covers "Positions"; Rounds/Duels/Economy tabs not built this round. |

Checks: type-check clean; eslint clean on changed files; `npm test` 1784 passed / 9 skipped. API/AI untouched this round.

## Round 8 (r8-val)
1. **Board 18b deep tabs — done.** `src/components/v3/matchpage/valorant/` — `valorant-match-view.ts` (+7 tests) and `ValorantMatchTabsV3.vue`, mounted in the shared `MatchStatsDrawerV3` (same collapsible row as CS2/Deadlock). Rounds (ending, plant, buy band, opening kill / died first, your kills·deaths; click a round to seek), Duels (opening duels won, rounds won after your opening kill / after dying first, head/body/leg share of hits — "hits, not shots", kills by weapon), Economy (won X of Y by pistol/full/half/eco; same thresholds as AI `buy_type_for`: full ≥3,900, half ≥2,000, competitive rounds 1 and 13 = pistol). Hit regions read from raw `matchDetails` or the slim `matchDetailsLite.rounds` upload copy, own rows only. Missing data → "Not measured". Checked on the dev Bind fixture: 9–13 · ADR 98 · opening duels 1–8.
2. **"Review round N" from the post-game — done.** `PostGameView` computes the round from the local timeline (`reviewRoundFor`: your first opening death in a lost round) when uiV3 is on; `PostGameV3` shows "Review round N →" under the coach line; it hands off to `/vod-review?timelineId=<analysis>&round=N` (or `?id=<recording>&round=N` before analysis). `MatchPageV3` now honours `?round=N` (1-based, validated by `round-link.ts`, +2 tests) and seeks once the video knows its length.
3. **P1-06 callouts and distance in the round story — done (AI).** Golden cases first: `tests/fixtures/coaching_claims/round_story_callouts.json` (2 of 3 failed before the change). `moment_context._death_place` adds "you died at <callout>" only when the zone pack resolved a polygon (`callout_polygon`/`site_polygon`; never nearest-anchor guesses) and "killer N m away (at <callout>)" from Riot world units (cm), 1–150 m only. New claim codes `death_callout`, `killer_distance` in `claim_contracts.py`.
Checks: desktop type-check + eslint clean, `npm test` 1,803 passed; AI `pytest` 922 passed, `claim_contract` 345 passed.
Left: no output guard yet for distances the model might invent beyond the ground truth (ground truth only states measured ones); Valorant focus-to-round deep link from Home.
