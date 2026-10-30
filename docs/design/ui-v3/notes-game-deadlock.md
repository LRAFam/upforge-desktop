# Deadlock: round 5 (agent-deadlock)

Goal: get Deadlock as close to 5/5 as the data allows. Uncommitted in three worktrees:
desktop `upforge-wt/rework`, API `upforge-wt/api-fixes`, AI `upforge-wt/ai-fixes` (all from origin/main).
Builds on the round-4 fixes in `api-fixes/FIXES-NOTES.md` (player_steam_id, failure email).

## What changed, by improvement

### 1. Coach gets real comparisons before it writes (H/M), golden case first
- **Golden case:** `ai/tests/fixtures/coaching_claims/deadlock_lobby_claims.json` + `tests/test_deadlock_lobby_claims.py`.
  It failed first (no guard), now passes. Covers: no lobby data, so every "lobby average / lane opponent / expected X" number
  is stripped; lobby present, so wrong numbers are removed and right numbers and differences are kept; issues whose
  evidence is removed are dropped entirely.
- **Lobby block measured from the replay (AI `services/deadlock_analyzer.py`):** net worth of all 12 players at 10 and 20 min
  (only checkpoints the match reached) and at the end; your team, enemy team, lobby and lane-opponent averages (lane =
  enemies with the same `start_lane`); your rank in the lobby; hero damage vs lobby. Returns `None` with fewer than 4
  heroes measured, so no partial lobby is ever compared against. Better than deadlock-api `match_metadata`: same replay, exact.
- **Claim guard (`services/deadlock_claim_guard.py`):** runs on every coaching response in `routers/deadlock.py`.
  A comparison sentence with a souls-scale number must match a lobby value or difference (tolerance ±0.5% / 60), or it is removed.
  `claims_removed` is returned and stored.
- **Prompt (`services/deadlock_claude_coach.py`):** removed the invented examples ("16,500 for Abrams", "lobby average 36,300"),
  the "Mid Boss gives ~3,000 souls" and "60% last-hit efficiency" facts (no data for either). The coach is told what's unavailable.
- **API `ProcessDeadlock`:** before the AI call it now fetches rank (mmr → "Ritualist 3"), the hero from match metadata
  (so hero meta is known before the replay is parsed), hero meta (win rate, popular builds, counters) and the item
  catalogue with costs, and sends them as one `context_json` form field. Every lookup is optional: a deadlock-api outage
  still completes the analysis (tested). The post-coaching re-fetch is gone except when the hero only became known from the replay.

### 2. Items with costs, full timings, build comparison (M/S)
- `DeadlockService::getItems()` now keeps `cost` and `tier` (cache key bumped to `dl:items:v2`).
- Items: all of them with match clock, cost when the catalogue has it, upgrade flag (was: first 8, "cost unavailable").
- Abilities: every upgrade with its time (was: first 10 names, no times). Mid Boss: each kill with time and which team.
- Hero meta block: win rate near your rank, toughest matchups, items most common in popular builds, and **which of those
  you didn't buy**. The build parser collects `ability_id`/`item_id` anywhere in the build rows, because the
  hero-build-stats row shape isn't pinned in our code (verify against a live response).

### 3. Show souls, items, abilities, Mid Boss (H/M)
- **Desktop (done):** `src/components/v3/games/DeadlockReviewV3.vue` (UfDialog) opens from Progress, under "Replay reviews".
  It shows the coach's focus line, souls against lane, enemy team and lobby at 10 and 20 min and at the end (signed
  differences, win and loss colours), the souls curve with lobby-average markers, item and ability timelines, Mid Boss
  owner and your deaths. Shaping lives in `deadlock-review.ts` (tested).
- **Web (spec only; frontend not edited):** `/deadlock/results/[id]` should add the same four sections from
  `match_stats.lobby`, `match_stats.economy.souls_timeline`, `economy.items_bought` (cost + `time_seconds`),
  `abilities`, `mid_boss` (+ `match_stats.player_team` for "your team"), and `kill_events` deaths.
  Components: `DeadlockResultsEconomy` (curve + lobby table) and `DeadlockResultsTimeline` (items, abilities, Mid Boss, deaths).

### 4. Honest desktop timeline (H/L), partly done
- **Root cause confirmed:** `demofile` 2.10 only reads Source 1 (`HL2DEMO`). Deadlock replays are Source 2, so the local
  parse never returned kills. `demo-timeline.ts` now returns null for Deadlock with a log line, instead of parsing a
  100 MB file for nothing. `demo-header-peek.ts` has the same problem for Deadlock map/client names (left; low value).
- **AI returns `kill_events`** (your kills, deaths and assists with match-clock seconds and hero names, capped at 200) and
  `player_team`. The API stores both in `match_stats`.
- **Desktop builder (done, tested):** `electron/main/deadlock-cloud-timeline.ts` turns those events into the recording's
  `MatchData` with video offsets. It returns null when there are no events, so the Analyse lock stays on. With events it
  is genuinely rich (real replay kills), so the contract in AGENTS.md holds by design, not by accident.
- **Wiring (needs the lead, `index.ts` + `recordings-store`):** a cloud review costs a credit, so it must stay user-triggered:
  1. Store `deadlockReviewJobId?: string` on a recording when the user analyses its replay. `deadlock:upload-demo`
     already returns `jobId`; pass `recordingId` from the UI (match the replay to the recording by
     `getDeadlockLobbyMatchId()` / the time window, as `retrieveReplayTimelineForRecording` does).
  2. When that job completes (poll `GET /api/deadlock/demo/{jobId}/status`, or on `recordings:refresh-demo-timeline`):
     `const d = (await api.get(/api/deadlock/demo/${jobId})).data;`
     `const t = deadlockTimelineFromCloud({ events: d.match_stats?.kill_events, hero: d.hero, jobId, recordingStartTime: rec.timeline?.recordingStartTime ?? rec.recordedAt, matchStartTime: rec.timeline?.matchStartTime ?? null, durationMinutes: d.duration_minutes, result: d.match_result });`
     `if (t) recordingsStore.updateTimeline(rec.id, { ...rec.timeline, ...t })` then `mainWindow?.webContents.send('recordings:updated')`.
  3. Caveat: the match clock excludes pauses, so offsets can drift after a pause (`matchDetails.clock = 'match_seconds'`).

### 5. Profile numbers on Home and Progress (M/S)
- `deadlockStats`: KDA and average souls with "Higher than N% of players" (API `percentiles`), average souls, and
  **last hits and denies per match** from recent match history (the API already sends `last_hits`/`denies`, unused until now).
- Rank line: sorts `mmr_history` by `start_time` when present, so it no longer assumes order. When `mmr_history` is empty,
  as on the signed-in account today, it falls back to `ranked_display_badge` on recent matches, so ranked players get a
  **dated** line ("up from Arcanist 1 to Arcanist 2 since 12 Jun"). Axis labels show dates.
- "Strongest heroes this patch" (top meta) was already shown; percentiles and net worth were not.

### 6. Clean-ups
- Unified history status: no more `? 'completed' : 'completed'`; failed and processing jobs now show their real status (tested).
- KDA formula: the analyzer now uses `(K + A) / max(D, 1)`, the same as the API and desktop (was `(K + 0.5A) / D`).
- Desktop pipeline (`deadlock_desktop.py`): events labelled by match clock (`12:40 killed …`), not `R?` rounds.
- Hero names: `deadlockHeroLabel()` in `src/lib/deadlock.ts` maps the watcher's `hero_13` to the name from stats,
  or "Unknown hero", never the raw key. It still needs using where recordings show `agent` (see "For the lead").

## For the lead (shared files — exact changes)
1. `electron/preload/index.ts`, in the `deadlock:` block:
   `getAnalysisDetail: (jobId: string) => ipcRenderer.invoke('deadlock:get-analysis-detail', jobId),`
   (the handler is in `gaming-ipc.ts`; until this line lands, the review dialog falls back to "Open review" on the web).
2. `src/env.d.ts`:
   - `DeadlockProfileStats.summary`: add `total_matches: number; avg_net_worth?: number; percentiles?: { kda?: number; net_worth?: number }`.
   - `recent_matches[]`: add `last_hits?: number; denies?: number; ranked_display_badge?: number | null; hero_id?: number`.
   - `mmr_history`: `Array<{ rank: number | null; start_time?: number; match_id?: number }>`.
   - `deadlock`: `getAnalysisDetail: (jobId: string) => Promise<{ ok: true; detail: unknown } | { ok: false; error: string }>`.
   - `DeadlockAnalysisItem`: no change needed.
   `game-data.ts` reads these through local "Extra" types today, so nothing breaks before this lands.
3. Matches rows (`MatchRowV3`) and the match header: use `deadlockHeroLabel(rec.agent, stats.hero_stats)` for Deadlock rows.
4. `index.ts` wiring for the cloud timeline (section 4 above).
5. **Verify on prod data:** deadlock-api `mmr-history` order (the API's `getFullProfile` uses `[0]` as the current rank),
   and the hero-build-stats row shape used for "items common in popular builds".

## Deploy order
AI first (accepts the new `context_json` and still works without it), then API (sends it; `getItems` cache key bump), then
desktop. No migrations: everything new lives inside the existing `match_stats` JSON.

## Tests
- AI: `pytest` 858 passed, 29 skipped. `pytest -m claim_contract` 320 passed, 3 skipped. New: `test_deadlock_lobby_claims.py`
  (golden), `test_deadlock_lobby_context.py`, `test_deadlock_api_context.py`; `test_deadlock_router_identity.py` fakes updated.
- API: `--filter=Deadlock` 19 of 20 pass. The failure (`DeadlockSteamSearchTest` "keeps deadlock api ranked results") also fails on
  unchanged origin/main: a cached search result leaks between tests. Full suite: 1014 passed, 18 failed. The others are League
  fixture paths (`../upforge-ai-service` doesn't exist in the worktree layout), plus pre-existing failures
  (ValorantPlayerSnapshot, CoachingBrief ×2, RefreshValorantStats). None of them are in Deadlock files.
- Desktop: `npm test` 1563 passed, 9 skipped. `npx eslint` is clean on my files. `npm run type-check` has one error, in
  `VodReviewBody.vue` (another agent's in-progress file), and none in mine.
- Not screenshotted: switching the title-bar game to Deadlock saves the primary game to the real account (a production write).
  The dialog and Progress changes are covered by shaping tests only.

## Scores (honest, 1–5)
| Step | Before | Now | Why |
|---|---|---|---|
| Linking and search | 4 | 4 | Unchanged; desktop still links through the web. |
| Detection and recording | 3 | 3.5 | The kill timeline now has a real source (cloud replay) and a tested builder. Needs the lead's wiring to land on recordings; map still null. |
| Data sources | 4 | 4.5 | Item costs, rank and the hero from metadata are now used; last hits and denies surface. |
| Coaching | 2 | 4 | Player found (round 4), exact lobby comparisons, full item/ability timings, meta and skipped build items before writing, ungrounded comparisons removed by a guard with a golden case. Not 5: no positions or fight context, and build rows unverified on live data. |
| What players see | 2–3 | 4 | In-app replay review with lobby, souls curve, items, abilities, Mid Boss and deaths; percentiles, souls, last hits and a dated rank line. Web results still need the spec built. |
| Paying | 2 | 2 | Unchanged (shared pool, legacy plans); lead-owned config. |

## Lead wiring (done)
- **"Review replay" (user action only, costs 1 analysis):** Matches row action → `UfDialog` confirm ("This uses 1 analysis from your plan") → `deadlock:review-replay` (index.ts; trusted-renderer check, signed-in check). It finds the replay with `findLatestReplay('deadlock', matchSessionStart, …, { pollOnce: true })` (same session matching as replay retrieval), uploads through `SourceReplayUploader`, and stores `deadlockReviewJobId` on the recording (`RecordingsStore.setDeadlockReviewJob`, validated id, Deadlock rows only). A recording that already has a job never uploads again (no double charge); the row shows "Replay review in progress".
- **Linking the timeline:** `electron/main/deadlock-review.ts` polls `GET /api/deadlock/demo/{job}/status` (max 20 polls, 10 s → 60 s backoff, ~15 min; stops on sign-out), then reads the result and builds the timeline with `deadlockTimelineFromCloud`. Merge keeps fields the recording already knew (map, ids) when the review has nothing for them. `recordings:refresh-demo-timeline` also links a finished review, or resumes polling. No events → timeline untouched → Analyse stays locked (contract).
- **Hero names:** `src/lib/deadlock-hero-names.ts` loads hero names once per session from the stats the app already fetches; Matches rows and the match header show "Haze" (or "Unknown hero"), never `hero_13`.
- **Tests:** `deadlock-review.test.ts` (9: upload once, no double review, other games refused, missing replay, poll → link, cap, failure, no events, merge keeps known fields), `recordings-store-deadlock-review.test.ts` (3: persistence, validation, clear), `deadlock-hero-names.test.ts` (4), `deadlock-review-row.test.ts` (2). Full suite 1,595 passed, type-check and eslint clean.
- **Not done:** GameFiles' existing replay "Analyse" upload is unchanged (it isn't tied to a recording). Not exercised against production (it would spend a credit).

---

# Round 6 (2026-10-30)

## 1. Positions and fight context in coaching (done; golden case first)
- **Golden case:** `ai-fixes/tests/fixtures/coaching_claims/deadlock_fight_claims.json` + `tests/test_deadlock_fight_claims.py`. It failed first (no guard), passes now.
- **Analyzer** (`services/deadlock_analyzer.py::_fight_context`), all from boon `player_ticks` x/y + `kills`, same replay for all 12 heroes:
  - each death: teammates and enemies alive within 1,500 map units, "outnumbered" (enemies > you + teammates nearby), map side (your side / middle / enemy side, measured along the line between where each team spawned in this replay — no map geometry assumed), traded (a teammate killed your killer within 10 s);
  - kill participation = your kills + assists ÷ your team's kills.
  - Returns None when the replay has no positions; the context then says "Unavailable" and the guard strips every factual fight claim.
  - Lane and zone names are deliberately not derived (no verified map polygons). The prompt forbids naming them and converting units to metres.
- **Guard:** `guard_deadlock_fight_claims` in `services/deadlock_claim_guard.py`. A sentence about being alone / outnumbered / enemy side / traded / participation is a claim when it states a count or a fact; each count must match the measured value for that category (or total deaths). Advice ("Stop dying alone") is kept. Issues whose evidence is removed are dropped. Router runs it after the lobby guard; `claims_removed` counts both.
- **API:** `ProcessDeadlock` stores `match_stats.fight` (test extended).
- **Desktop:** the replay review shows a "Fights · measured from the replay" block (participation, alone / outnumbered / enemy side / traded counts) and each death with "0 teammates · 1 enemy nearby · enemy side · traded". Falls back to time + killer for older reviews. Tests in `deadlock-review.test.ts`.

## 2. Hero (and map) on recordings
- Finding: `setDeadlockHeroId` is never called, so recordings have no hero at all today (and "hero_N" only appears from other paths).
- **API:** `GET /api/deadlock/match/{id}` now also returns `player: { hero_id, hero_name, hero_icon, team }` for the signed-in account (`DeadlockService::playerFromMetadata`). Tests: `DeadlockMatchMetadataTest` (found / not in match).
- **Desktop:** `electron/main/deadlock-recording-hero.ts` — `resolveDeadlockRecordingHero(matchId, { fetchMatch })` retries at 1, 3 and 8 min after the match (metadata publishes late) and returns the hero; `recordingHeroLabel()` never stores a raw `hero_N`. Tests: `deadlock-recording-hero.test.ts`.
- **Map:** Deadlock has one map; deadlock-api metadata has no map name. Leave `map` null and show the game mode on the row instead of a map.
- **Lead wiring needed** (index.ts + auth-manager are yours):
  ```ts
  // auth-manager.ts
  async fetchDeadlockMatch(matchId: number): Promise<unknown | null> {
    if (!Number.isSafeInteger(matchId) || matchId <= 0) return null
    try { return (await this._api.get(`/api/deadlock/match/${matchId}`)).data } catch { return null }
  }
  // index.ts, after a Deadlock recording is saved with lobbyMatchId = getDeadlockLobbyMatchId():
  void resolveDeadlockRecordingHero(matchId, { fetchMatch: (id) => authManager.fetchDeadlockMatch(id) })
    .then(p => { const label = recordingHeroLabel(p, rec.agent ?? null); if (label) recordingsStore.update(rec.id, { agent: label }) })
  ```

## 3. Flagged assumptions (verified in code; no production calls)
- No real mmr-history or hero-build-stats sample exists in the repos, so ordering is now **explicit** instead of assumed:
  - `DeadlockService::newestFirst()` sorts mmr-history newest first by `start_time`, then `match_id`, keeping original order when neither exists; `getFullProfile`'s `[0]` is therefore the latest rank regardless of API order.
  - `getHeroBuildStats` ranks rows by a popularity field when present (`num_weekly_favorites`, `favorites`, `matches`…), else keeps API order. The AI side already collects item ids shape-agnostically.
  - Desktop rank line orders by `start_time`, then `match_id`, then falls back to reversing the (newest-first) API list.
  - Tests: `tests/Unit/DeadlockApiOrderingTest.php`, `game-data-deadlock.test.ts`.
- Still worth one look on live data: the popularity field name in hero-build-stats rows.

## 4. Paid-plan value moment (proposal only — pricing is the user's call)
- **Free:** stats, rank line, hero win rate vs meta, percentiles, souls/last hits — everything from the API, no replay parse.
- **The paid unit = "Replay review"** (1 credit from the shared pool): lobby souls comparison, fight context, item/ability timing vs popular builds, Mid Boss, all claim-guarded. This is the moment worth paying for because no free site shows "you died alone on the enemy side 4 of 7 times, 3 untraded".
- **Plus:** reviews draw on the shared monthly pool (numeric cap, e.g. same as other games); add a one-tap "Review this match" on the newest recording after each match.
- **Pro:** same per-review depth, more reviews (numeric cap), plus a "last 5 replays" trend (alone / outnumbered deaths over time). No unlimited tier.
- Retire the legacy `deadlock_starter` / `deadlock_pro` prices and the waitlist (config is lead-owned).

## Tests (round 6)
| Repo | Check | Result |
|---|---|---|
| AI | `pytest` | 883 passed, 9 failed — all 9 in CS2 files another agent is editing (`test_cs2_demo_*`, `test_cs2_match_stats_v1_extract`, `test_cs2_scoreboard`); every Deadlock test passes |
| AI | Deadlock + fight claim tests | pass (incl. golden `deadlock_fight_claims`) |
| API | `php artisan test` | 1043 passed, 5 failed — the same 5 that fail on origin/main |
| API | Deadlock tests | `DeadlockMatchMetadataTest`, `DeadlockApiOrderingTest`, `ProcessDeadlockJobTest` pass |
| Desktop | type-check / eslint (my files) / `npm test` | clean / clean / 1619 passed |

## Scores after round 6
| Step | R5 | R6 | Why |
|---|---|---|---|
| Linking and search | 4 | 4 | Unchanged. |
| Detection and recording | 3.5 | 4 | Hero name resolvable after each match (API + tested resolver); needs the lead's 2-line wiring. Map is single by design. |
| Data sources | 4.5 | 4.5 | Positions now used; build-stats popularity field still unverified live. |
| Coaching | 4 | 4.5 | Fight and position facts from the replay, guarded by a golden case. Not 5: no lane/zone names, no ability-usage-in-fight data. |
| What players see | 4 | 4.5 | Fight block and per-death context in the in-app review. Web results still need the spec built. |
| Paying | 2 | 2 | Proposal written; config is lead/user-owned. |
| **Overall** | **3.8** | **≈3.9** | Paying holds the average down; the product steps are at 4–4.5. |

## Round 7 (r7-demo-games)
**Taken:** P4-02 match page beyond the dialog (board 21).
- `DeadlockReviewV3.vue` split: the body is now `DeadlockReviewContentV3.vue` (props `active`, `jobId`, `hero`; emits `title`), used by the dialog (unchanged behaviour) and by the match page.
- `MatchStatsDrawerV3.vue` shows "Replay review" (souls vs lobby, souls curve, items, abilities, Mid Boss, deaths with fight context, fights, what to work on) in a collapsible row under the match-page header for Deadlock recordings that have a `deadlockReviewJobId`. Read-only; nothing charged; nothing shown without a review.
- **Not taken:** 04 focus loop / leave beta (M), 08 patch-aware (needs patch data), 06 death map (M), 10 ability-in-fight (M), 03/11 (data/$).
- Verified as above (tests 1,772 passed). Not seen on screen (no Deadlock recording here; no game switching).
- Scores: What players see 4.5 → 4.5 (now inside the match page too).

## Round 9
- **Ability use in fights (ai-fixes 647374f, rework c4f81b2):** when the replay has boon's `abilities` dataset (tick, hero, ability), each death records the abilities the player cast in the 8 s before it (movement and melee excluded) and the coach gets "Deaths with no ability used in the 8 s before: N of M". Without the dataset the context says it wasn't measured and the fight guard drops factual ability/cooldown claims. Golden case `deadlock_ability_claims` written first. The desktop review shows "used X, Y" or "no ability in the 8 s before" per death, and the count, only when measured.
- Assumption to verify on a real replay: the `ability` column's values (internal names vs ids). The label helper handles both; internal names are humanised (`citadel_ability_haze_sleep_dagger` → "Haze sleep dagger"), which is readable but not the in-game name. Mapping to official names via deadlock-api assets is the next step.
- **Lane/zone naming: skipped.** There is no verified lane geometry for the current map (City Never Sleeps changed lanes; deadlock-api assets have no lane polygons), so naming lanes from positions would be guessing. Map side vs each team's spawn (round 6) stays the only position claim.
