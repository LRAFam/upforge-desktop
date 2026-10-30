# League: round 5 notes (agent-league)

Nothing is committed or deployed, and production was not touched. The earlier fix pass already corrected the false death claims and the failed-analysis refund (see `api-fixes/FIXES-NOTES.md`).

## What changed

### 1. Rank sync (done)
Before this, coaching treated every player as Gold/Plat.

**API (`upforge-wt/api-fixes`):**
- Rank comes from Riot League-V4 through the new `LolRankService`, which calls `RiotLolService::getRankedEntries`.
- It is synced in two places:
  - when the account is linked (`ValidateLolRiotId`, after the PUUID resolves)
  - at the start of every analysis (`ProcessLoLAnalysis`)
- New table `lol_rank_snapshots` (migration `2026_10_30_180000`). It is its own table, so `users` is untouched. A row is written only when the rank changes.
- The analysis gets `tier` and `division` (existing columns), and `match_data.rank_at_match` gets a label such as "Silver I · 12 LP".
- That label is sent to the AI as `rank`. The AI already accepted `rank`, so the coach now uses the right rank bucket.
- `GET /api/lol/analyses` and `GET /api/lol/matches/recent` now also return `rank` and `rank_history` (oldest first, with a numeric `value` for charts). Neither makes a Riot call on the read path.

**Desktop (`rework`):**
- v3 Progress for League shows the current rank and a rank line once there are 2 or more snapshots.
- The code is in `src/lib/lol-progress.ts`, the League section of `GameProgress.vue` and `useGameData.ts`.
- **Needs lead IPC:** `lol:get-rank`. Until it exists, the screen shows "Unranked / no rank found" honestly.

**Bug fixed in `useGameData`:** it checked `riot_name` (Valorant) instead of `lol_riot_name`/`lol_riot_tag`. It now uses the League ID first, then falls back to the Valorant one, as the API does.

### 2. Lane metrics from the timeline (done; golden case written first)
**AI (`ai-fixes`):**
- Golden case `tests/fixtures/coaching_claims/lol_stats_lane_metrics.json` plus `tests/test_lol_stats_lane_metrics.py`. These failed before the fix and pass now.
- `services/lol_match_normalizer.py`:
  - `lane_metrics()` computes CS, gold difference and XP difference at 10:00 and 15:00 against the enemy in the same `teamPosition`, plus the time of the first death.
  - A minute the game never reached is not reported.
  - Without exactly one same-role enemy, there is no comparison, only the player's own CS.
- The context gets a `LANE vs <champion> (<role>)` block. The prompt says lane comparisons may only use the numbers in that block.

**API:** `LolMatchDataEnricher::laneMetrics()` is the same calculation. `tests/Unit/LolLaneMetricsTest.php` checks it against the same golden fixture, so the two sides can't drift apart.

### 3. Stats coaching in the desktop app (component and logic done; lead wiring needed)
- `src/components/v3/games/LolMatchCoaching.vue` takes a `matchId` prop.
  - It finds the analysis for that Riot match among the user's analyses (`window.api.lol.getAnalyses(50)`, an existing IPC call).
  - It shows the focus, summary, rank coached at, lane rows, "Fix next", moments and practice drills.
  - If there's no analysis yet, it offers "Get stats coaching". That asks first ("This uses 1 analysis from your plan") and only then calls `lol:analyze-match`.
  - It polls while the analysis is being written (at most 3 minutes).
- The data shaping is in `src/lib/lol-coaching.ts`, with tests.
- **Needs lead:** the IPC calls, plus mounting the component (diffs below).

### 4. Progress trends (done)
- The API recent-matches summary now includes `cs`, `cs_per_min`, `vision_score`, `vision_per_min` and `damage_share`, all from the cached Match-V5 payload.
- The list now holds up to 20 coachable matches instead of 10.
- Desktop: `lolTrends()` compares the earlier half of the last 20 games with the recent half, for CS/min, vision/min, damage share and deaths per game. It needs at least 6 games, and treats fewer deaths as better.
- **Not done:** "deaths before 14 min". That needs the timeline for each match (20 extra Riot calls per Progress load). Use `lane_metrics.first_death_sec` from analysed games instead (follow-up).

### 5. Drills and priority focus in the desktop review (done in the component above)
- **Web results page:** the frontend is your main checkout, so I didn't edit it. Spec: in `app/components/lol/LolResultsSummary.vue`, render `coaching.priority_focus` as the lead sentence and `coaching.drills[]` (`title`, `description`, `frequency`) as a list under it. These fields are already in the stored result.

### 6. Flex (440) and Normal Draft (400) (done)
- **Allowed queues:** `LolAnalysisReadinessService::SUPPORTED_QUEUE_IDS = [420, 440, 400]`. ARAM and other modes are still rejected, with clearer copy.
- **Recent matches:** `recentMatches` makes one Riot call for all queues and filters to the coachable ones. `getRecentMatchIds` now accepts `null` for "no queue filter".
- **AI prompt:** it is queue-aware (`_queue_note`).
  - **Flex:** coach the player's own decisions, not premade coordination.
  - **Normal Draft:** talk about habits, not LP.
- **System prompt:** it no longer says Solo/Duo only.

### 7. Clean-ups
- **`desktopDebrief`:** it posted to `/api/lol/debrief`, which never existed on the AI side, and nothing calls it. It now returns the deterministic stats line only, with no AI call (no unmetered spend). The test now asserts that nothing is sent.
- **Lead: the Matches note contradicts the analyse button.** `src/views/v3/MatchesV3.vue:81` says the coaching "uses only the local League snapshot, not video". But video review does watch clips (`analyse-modules/lol.ts`). Replace that `<p>` text with:
  > Video review watches up to 3 short clips from your recording alongside the captured League stats. Riot stats coaching (lane CS and gold vs your opponent, deaths, objectives, vision) is separate and appears on the match page. Screenshots and .rofl replay imports are not supported.
- **Lead: hard-coded web host** in `electron/main/ipc/gaming-ipc.ts:514-530`. Replace each `https://upforge.gg` with `${getFrontendBaseUrl()}`, imported from `../api-base`, so staging and local builds open their own site.

### 8. `knowledge/lol` (not done)
- I didn't add unsourced numbers. Per-rank CS and vision benchmarks and objective timers change by patch and need a cited source, such as Riot patch notes or a stats site export.
- Flag for review: `objectives.md` says "Herald… drop before 14:00 for two charges". That may be out of date for the current patch.

## Lead diffs (shared files)
```ts
// electron/main/auth-manager.ts (League block)
async fetchLolRank(): Promise<{ rank: unknown; rank_history: unknown[] } | null> {
  try { const res = await this._api.get('/api/lol/analyses?per_page=1'); return { rank: res.data?.rank ?? null, rank_history: res.data?.rank_history ?? [] } } catch { return null }
}
async fetchLolAnalysis(id: number): Promise<unknown | null> {
  try { return (await this._api.get(`/api/lol/analyses/${Number(id)}`)).data } catch { return null }
}
async analyzeLolMatch(matchId: string): Promise<{ ok: boolean; analysis_id?: number; error?: string }> {
  if (!/^[A-Z0-9]+_\d+$/i.test(matchId)) return { ok: false, error: 'Invalid match id' }
  try { const res = await this._api.post('/api/lol/analyze/match', { match_id: matchId }); return { ok: true, analysis_id: res.data?.analysis_id } }
  catch (e) { return { ok: false, error: (e as { response?: { data?: { message?: string; error?: string } } })?.response?.data?.message ?? 'Coaching could not be started.' } }
}
// electron/main/ipc/gaming-ipc.ts
ipcMain.handle('lol:get-rank', () => auth.fetchLolRank())
ipcMain.handle('lol:get-analysis', (_e, id: number) => auth.fetchLolAnalysis(Number(id)))
ipcMain.handle('lol:analyze-match', (_e, matchId: string) => auth.analyzeLolMatch(String(matchId)))
// electron/preload/index.ts, inside lol: { … }
getRank: () => ipcRenderer.invoke('lol:get-rank'),
getAnalysis: (id: number) => ipcRenderer.invoke('lol:get-analysis', id),
analyzeMatch: (matchId: string) => ipcRenderer.invoke('lol:analyze-match', matchId),
// src/env.d.ts, inside lol: { … }
getRank: () => Promise<import('./lib/lol-progress').LolRankPayload | null>
getAnalysis: (id: number) => Promise<unknown>
analyzeMatch: (matchId: string) => Promise<{ ok: boolean; analysis_id?: number; error?: string }>
```

**Mount the panel:**
- **Match page:** in `src/components/vod-review/VodReviewBody.vue`, directly after `<VodLeagueScoreboard …/>` in the v3 branch, add `<LolMatchCoaching v-if="uiV3" :match-id="timeline?.matchId ?? null" />`. Use whatever the body calls the recording's Riot match id.
- **Coaching reviews:** in `src/components/v3/reviews/ReviewDetailV3.vue`, for `game === 'lol'` rows that have a `match_id`, use the same component.
- **Import:** `import LolMatchCoaching from '../v3/games/LolMatchCoaching.vue'`.

## Deploy order
1. **AI service:** lane-metrics context, queue-aware prompt, lane-claim rule. Safe on its own: if `lane_metrics` is missing, there's no LANE block.
2. **API:** run `php artisan migrate` (`lol_rank_snapshots`), then deploy. The rank, lane metrics, Flex/Normal and debrief changes all live here.
3. **Desktop:** the lead IPC diffs above, the component mounts, and a version bump and tag.

## Tests
| Repo | Check | Result |
|---|---|---|
| AI | `pytest` | 858 passed, 29 skipped |
| AI | `pytest -m claim_contract` | 320 passed, 3 skipped |
| API | full `php artisan test` (with a temporary `upforge-wt/upforge-ai-service → ai-fixes` symlink, removed afterwards) | 1023 passed, 9 failed |
| API | League tests (`--filter='Lol\|RiotLol'`) | 81 passed |
| Desktop | `npm run type-check` | clean |
| Desktop | `npx eslint` on my files | clean |
| Desktop | `npm test` | 1563 passed, 9 skipped |

The 9 API failures are none of mine:
- **5 pre-existing on origin/main:** ValorantPlayerSnapshot, CoachingBrief ×2, DeadlockSteamSearch, RefreshValorantStats.
- **4 from CS2 work in progress:** CS2FaceitTargeting ×3 and FaceitEloRefresh.

**New tests:**
- **AI:**
  - `test_lol_stats_lane_metrics.py`
  - `test_lol_queue_awareness.py`
  - golden fixture `lol_stats_lane_metrics.json`
- **API:**
  - `LolRankSyncTest`
  - `LolLaneMetricsTest`
  - `LolQueueSupportTest`
  - the debrief test was rewritten
- **Desktop:**
  - `lol-progress.test.ts`
  - `lol-coaching.test.ts`
  - `LolMatchCoaching.test.ts`

## Scores (honest, after this round)
| Step | Before | Now | Why |
|---|---|---|---|
| Setup & linking | 4 | 4.5 | Rank is captured at link time and the desktop link check is fixed. Linking still happens on the web. |
| Detect & record | 3 | 3.5 | Flex and Normal Draft are now coachable. ARAM and other modes still get only the snapshot path. |
| Data | 2 | 4 | Rank and per-minute lane data are now used. Other players' items and objectives are still unused. |
| Coaching | 2 | 4 | Coaching is rank-adapted, lane-grounded behind a golden case, queue-aware, and has no false death claims. Desktop video review is still capped at 3 clips, and `knowledge/lol` is thin. |
| What players see | 2.5 | 3.5 once the lead wires it (3 until then) | Progress has a rank line and trends, and the match page shows stats coaching with drills and focus. The web results page still lacks drills (spec above). |
| Paying | 3 | 4 | Failed analyses refund. Spending in the desktop app always asks first. |
| **Overall** | **2.8** | **≈3.9** | |

**To reach 5:**
- **Data:** merge the two pipelines (stats coaching automatically attached to every desktop recording).
- **Coaching:** a sourced, per-patch knowledge base with benchmarks per rank.
- **What players see:** deaths before 14 min from timelines, plus lane-opponent context on the web results page.

---

# Round 6

## 1. Stats coaching linked to recordings at no extra cost (done)
- **Match page:** `LolMatchCoaching` already links an existing analysis for the recording's Riot match; this never spends anything.
  - `analysisForMatch` (`src/lib/lol-coaching.ts`) now also links recordings that only captured the numeric game id (live client). It matches the number part of `EUW1_7001`, but a region-prefixed id must match exactly, so ids never link across regions. Tested.
  - "Get stats coaching" (which spends 1 analysis, after asking) is only offered for a full Match-V5 id, so a numeric-only id can't produce an "Invalid match id" error.
- **Coaching reviews:** the API's `/api/analysis/recent` rows now include `match_id` (from `analysis_logs.match_id`, falling back to the desktop `match_data.matchId`), in `VODAnalysisService::getRecentAnalyses`. Test: `LeagueDesktopHistoryTest::test_league_history_rows_carry_the_riot_match_id_for_stats_coaching_links` (failed first).
- **Lead change needed** (shared files):
  ```ts
  // src/env.d.ts — AnalysisItem
  match_id?: string | null
  // src/env.d.ts — LolAnalysisItem
  early_deaths?: number | null
  first_death_sec?: number | null
  // src/components/v3/reviews/ReviewDetailV3.vue — after the review body for the selected analysis
  import LolMatchCoaching from '../games/LolMatchCoaching.vue'
  <LolMatchCoaching v-if="primaryGame === 'lol' && selectedAnalysis?.match_id" :match-id="selectedAnalysis.match_id" />
  ```
  (`primaryGame` from `usePrimaryGame()` if the component doesn't already have it.) Until this lands, reviews link to the match page, which shows the panel.

## 2. Deaths before 14:00 on Progress (done, no extra Riot calls)
- **API:** `/api/lol/analyses` rows add `early_deaths` (deaths before 14:00, counted from the stored `match_data.timeline_events.deaths`) and `first_death_sec` (from `lane_metrics`). Both are null, not 0, when the timeline wasn't stored. Test: `LolEarlyDeathsTest` (2).
- **Desktop:** `lolEarlyDeaths()` in `src/lib/lol-progress.ts` (3 tests). It needs 3 coached games with a stored timeline, and gives the average plus the median first-death time, e.g. "In your last 4 coached games you died 1.5 times before 14:00 on average. Your first death usually came at 5:00." Shown as "Early game" on League Progress. `useGameData` now loads the last 20 analyses instead of 8.
- 14:00 is used because that's when tower plates fall, the usual end of laning; it's a definition, not a game timer claim.

## 3. Knowledge base (partly done, by design)
- **Fixed the outdated Herald line.** "Drop before 14:00 for two charges" is gone; Herald is now described as a single summon, with no timer. Golden test first: `tests/test_lol_knowledge_currency.py` (claim_contract) failed on the old text and passes now.
- **No timers or benchmarks added.** I checked the official patch 26.1 notes and the League wiki (2026-10-30). Sources disagree on Voidgrub/Herald spawn times across 2026 patches, and the official notes I could reach don't state them. Following the "no unverified numbers" rule, `objectives.md` now says timers are omitted and the coach may only state a timer from the match timeline.
- **Not added:** per-rank CS/vision benchmarks (no official source). The existing "~8 CS/min" line in `lane-phase.md` is unsourced and predates this work; flag for review rather than relying on it.
- **Space limit:** the League knowledge is truncated to a fixed size, so the champion section drops out if earlier files grow. Keep additions short, or raise the limit in `knowledge_registry` (Valorant/shared owner).

## 4. ARAM and other modes (proposal only)
- **Today:** stats coaching accepts 420 (Solo/Duo), 440 (Flex), 400 (Normal Draft). ARAM (450), Swiftplay and Arena are rejected with clear copy; desktop video review still works for any recorded game.
- **Proposal:** add ARAM as a separate coaching profile, not the Summoner's Rift prompt: no lane metrics, no objectives, focus on positioning deaths, damage share, poke taken and build. It needs its own golden cases (no "lane"/"jungle"/"objective" claims). Swiftplay could reuse the SR prompt with a shorter-game note once its objective timers are verified. Arena isn't a fit for the current pipeline. Decision for the user: whether ARAM coaching is worth a credit to players.

## 5. Web drills
- Spec unchanged (Round 5, section 5): render `coaching.priority_focus` and `coaching.drills[]` in `app/components/lol/LolResultsSummary.vue`.

## Tests (round 6)
| Repo | Check | Result |
|---|---|---|
| AI | `pytest -m claim_contract` | 330 passed, 3 skipped |
| AI | `pytest` | 868 passed; 3 failures in CS2 tests (`test_cs2_demo_analyzer`) from another agent's in-progress work; League/knowledge all pass |
| API | `--filter='Lol\|RiotLol\|LeagueDesktop'` (temporary fixture symlink, removed after) | 87 passed |
| Desktop | `npm run type-check` | clean |
| Desktop | `npm test` | 1599 passed, 9 skipped |

## Scores after round 6 (honest)
| Step | Round 5 | Now | Why |
|---|---|---|---|
| Setup & linking | 4.5 | 4.5 | Unchanged. |
| Detect & record | 3.5 | 3.5 | Unchanged; ARAM is a proposal. |
| Data | 4 | 4.5 | Early deaths and first-death time now reach Progress; recordings link to coaching by numeric game id. Other players' items/objectives still unused. |
| Coaching | 4 | 4 | Herald misinformation removed; no sourced benchmarks or timers yet, so the knowledge base stays thin. |
| What players see | 3.5 | 4 (4.5 once the ReviewDetailV3 mount lands) | Early-game line on Progress; coaching links on more recordings; reviews panel needs the lead mount. Web drills still a spec. |
| Paying | 4 | 4 | Unchanged. |
| **Overall** | **≈3.9** | **≈4.1** | |

**To reach 5:** a sourced, patch-tagged knowledge base (needs an official or licensed data source for benchmarks and timers); auto-running stats coaching for every recording (a pricing decision: it spends analyses); web drills; ARAM profile if wanted.

# Round 7

## P2-03 Focus loop for League (done)
- **API (`api-fixes`):** `app/Services/LolFocusMetrics.php` measures 4 metrics per coachable match from the Match-V5 payload we already download (no timeline call, no AI, no quota): `deaths` (lower), `cs_at_10` (Riot `challenges.laneMinionsFirst10Minutes + jungleCsBefore10Minutes`; null without challenges or under 10 minutes), `vision_per_min`, `kill_participation` (Riot `challenges.killParticipation`).
- **Suggestion:** needs 5 games with a value. Picks the first metric (priority above) whose last 5 games are worse than the player's own window median, else the first with data. Target = a small step past their own median (deaths: one fewer, whole number; CS@10: +5; vision: +0.2/min; KP: +5 points). No outside benchmarks.
- **Loop:** `GET /api/lol/matches/recent` (already called by the desktop) checks each new coachable match against the active `game = 'lol'` focus via the existing `FocusService` (oldest first, idempotent per match, matches before the focus started never count), then starts a new focus from the suggestion when none is active. Response adds `focus` + `focus_event`. New read-only `GET /api/lol/focus` (240/h, no Riot calls). Valorant's focus is untouched (separate `game`).
- **Desktop:** IPC `lol:get-focus` (auth-manager, gaming-ipc, preload, env.d.ts — marked blocks). `useGameData` reads it after recent matches load. League Home (`GameHomeSummary`) shows "Focus · game N of 3", the goal, hit/miss slots and a subline. Wording in `src/lib/lol-focus.ts`: whole numbers in sentences ("Die 6 times or fewer", "Lately: 7 deaths a game").
- **Tests:** API `LolFocusLoopTest` (4: Riot-values-only metrics, suggestion target whole number, start + check once + Valorant untouched + focus endpoint, death damage split). Desktop `lol-focus.test.ts` (3).
- No new AI coach text, so no golden case needed for the focus loop itself.

## P2-05 LolMatchCoaching mounted (verified, no change needed)
- Mounted in `VodReviewBody.vue` (v3, League recordings, next to the scoreboard) and `ReviewDetailV3.vue` (League reviews with `match_id`). The audit's "not mounted" predates the lead wiring in round 6.

## P2-06 Death damage split (done, golden case first)
- **AI:** golden case `tests/fixtures/coaching_claims/lol_stats_death_damage.json` + `tests/test_lol_stats_death_damage.py` failed first. `services/lol_match_normalizer.py` now keeps Riot's `victimDamageReceived` as `damage_received` (physical/magic/true totals + top 3 sources) and each death line says e.g. "took 1,000 damage: 90% physical, 10% magic (mostly physical); top: Graves 900". "Mostly" only at 60%+. No line when Riot sent no breakdown. Coach prompt rule added: damage may only be described from that line.
- **API:** `app/Services/LolChallengeStats::deathDamage()` (same shape) stored on each death in `match_data.timeline_events.deaths[].damage_received`.

## P2-07 Challenges (done)
- `LolChallengeStats::from()` keeps Riot's own values only: CS at 10:00, kill participation, solo kills, turret plates, control wards, max CS lead on lane opponent (plus `vision_vs_lane`, stored but not displayed: its unit isn't documented). Added to recent-match summaries (`challenges`) and to `match_data.participant.challenges`.
- **Progress:** two new trends, CS at 10:00 and kill participation (`lol-progress.ts`), shown only when 6+ games have the value. Test added.

## Board 19b League deep tabs (done)
- `src/lib/lol-deep-tabs.ts` + tests (5). In `LolMatchCoaching` (match page + reviews): tabs Coaching · Lane · Deaths · Objectives · Vision, from the same analysis payload (no extra request). Lane: CS/gold/XP at 10/15 vs opponent, best CS lead, plates, solo kills. Deaths: time, killer and assists by champion, damage split. Objectives: who took each dragon/baron/herald/tower/inhibitor. Vision: score per minute, wards, wards cleared, control wards. Missing values are left out, never shown as 0. MatchPageV3 not edited.

## Not done (and why)
- **P2-08 objective clips:** objective events already reach the match timeline as markers (`objectiveEvents` → `VodTimelineEventIcon`). Extracting objective clip *files* needs a new clip trigger: the API's clip upload only accepts `manual|kill|ace|clutch|hotkey|multikill` (`ClipController.php:232,353,538,637`), so it needs an API change + a capture setting toggle + renderer trigger labels. Plan: trigger `objective`, setting `clipCapture.objectives` (default on), cap 4 per match (dragon/baron/herald/inhibitor, 15 s before → 5 s after), local-only until the API accepts it.
- **P2-10 alts for League:** League has one linked account per user (`users.lol_riot_*`); alt support needs multiple linked League accounts (a `users`/new-table schema change — lead/user decision).
- AI coach does not yet use challenges (would need golden cases); web results unchanged (user's checkout).

## Checks (round 7)
| Repo | Check | Result |
|---|---|---|
| AI | `pytest` | 894 passed, 29 skipped |
| AI | `pytest -m claim_contract` | 334 passed, 3 skipped |
| API | `--filter=LolFocusLoopTest` + League tests | all pass |
| API | full `php artisan test` | 1084 passed, 6 failed: `DeadlockSteamSearchTest` (pre-existing) + 5 `KnowledgeBankServiceTest` in files another agent is changing right now (knowledge `game` column) — none mine |
| Desktop | type-check / eslint (my files) / `npm test` | clean / clean / 1789 passed |

## Scores (round 7)
| Step | R6 | R7 | Why |
|---|---|---|---|
| Coaching | 4 | 4.5 | Focus loop measured from Riot data each match; death damage split grounded by a golden case. |
| What players see | 4 | 4.5 | Focus on League Home, deep tabs on the match page, CS@10 and KP trends. |
| Data | 4 | 4.5 | Riot challenges now used. |
| Overall | ≈4.1 | ≈4.3 | |

## Round 8 — League alts and objective clips (r8-league)

### League alts (main + alts)
- **API (api-fixes):**
  - New table `user_lol_accounts` (migration `2026_10_30_230000_create_user_lol_accounts_table.php`). It backfills each existing `users.lol_riot_*` link as the main account and is safe to run twice.
  - New: `UserLolAccount` model, `User::lolAccounts()`, `LolAccountService`, `LolAccountController`.
  - Routes `GET/POST /api/lol-accounts`, `POST /api/lol-accounts/{id}/main`, `PATCH|DELETE /api/lol-accounts/{id}`, all throttled.
  - **Caps:** the same as Valorant accounts (`TierService::getMaxValorantAccounts`: 1 / 3 / 5). No new pricing.
  - **PUUID:** resolved at link time and unique across profiles (409 `account_in_use`).
  - **Mirror:** `users.lol_riot_name/tag/platform/puuid` always mirror the main account, so older clients and every single-link reader keep working.
  - **Old endpoints:** `POST /profile/lol-account` edits the main account. `DELETE` removes the main and promotes the oldest alt; removing the last account clears the link, as before. `ValidateLolRiotId` syncs the main row.
  - **Rank:** `LolRankService::syncAccount()` works per account, and snapshots are compared per PUUID. `history()` shows the main account only (legacy rows with no PUUID count as main).
  - **Coaching:** `ProcessLoLAnalysis` coaches the linked account that actually played (`LolAccountService::accountInMatch`, main first) and uses that account's rank. It stores `match_data.account.is_main` and `player_puuid`, and list items carry `is_alt`.
  - **Focus:** the loop stays main-only, because recent matches come from the main PUUID.
- **Desktop (rework):**
  - IPC `lol:list-accounts`, plus `lol:add-account`, `lol:set-main-account` and `lol:remove-account`, which are trusted-sender only.
  - `auth-manager` caches the list. `riotAccountRole()` now tags League rows against the League accounts.
  - **Matches:** ALT tag and the account filter work for League automatically.
  - **Settings › Account (v3):** League rows show Main/Alt, Make main, Remove (with confirm), Add account, the cap label and the limit/upgrade note. It falls back to the old single-link form when the API has no `/lol-accounts` yet.
  - **Progress:** the early-game line ignores `is_alt` analyses.
- **Tests:** API `LolAccountsTest` (11, including the migration backfill). Desktop `recordings-store-account-role.test.ts` (+2 League cases), `lol-accounts-parse.test.ts` (2), `lol-progress.test.ts` (+1).

### Objective clips
- **API:** `ClipController` accepts `death` and `objective` (shared `CLIP_TRIGGERS`). Migration `2026_10_30_230100_widen_clip_trigger_column.php` turns the `clips.trigger` enum into `string(20)`.
- **Bug fixed:** round 7's Valorant death clips would have been rejected on upload, because neither the allow-list nor the enum had `death`.
- **Test:** `ClipTriggerTypesTest` (3).
- **Desktop:** new `electron/main/objective-clips.ts`.
  - **What's clipped:** Baron, then Dragon, Herald, inhibitor, then tower; within a kind, ones you took come first. At most 4 per match, from 12 s before to 6 s after.
  - **Labels** use only what the Live Client reported, e.g. "Dragon (Infernal) · you took it · 12:34".
  - **Where it runs:** both extraction paths. New `objective` clip trigger, ranked below highlights. Settings › Recording › "Objectives" toggle, default on.
- **Not included:** voidgrubs. The Live Client event name for them couldn't be verified, so they're left out rather than guessed.

### Deploy
API: `php artisan migrate` (2 migrations), deployed before the desktop. Desktop: version bump and tag.
