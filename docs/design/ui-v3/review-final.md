# Final review: rounds 5–6, rank, sign-out, roster flow and leftovers (2026-10-30)

Scope: everything uncommitted against origin/main in
- desktop `upforge-wt/rework` (feat/ui-v3)
- API `upforge-wt/api-fixes` (fix/game-support-bugs, 57 files)
- AI `upforge-wt/ai-fixes` (fix/game-support-bugs, 52 files)

The review was read-only. Production was only browsed, and I didn't switch the title-bar game.

## Checks run
| Repo | Command | Result |
|---|---|---|
| Desktop | `npm run type-check` | clean |
| Desktop | `npm test` | 1,694 passed, 9 skipped |
| AI | `pytest` | 893 passed, 29 skipped |
| AI | `pytest -m claim_contract` | 333 passed, 3 skipped |
| API | `php artisan test` (temp symlink created, then removed) | 1,062 passed, 1 failed |

The API failure is `DeadlockSteamSearchTest`. It also fails on origin/main: a cached result leaks between tests.

Screenshots taken and looked at: `/dashboard`, `/stats`, `/squad`, `/recordings`, `/training`, `/settings` (in `scratchpad/rework-shots/final_*.jpg`).

---

## P1: fix before committing

### P1-1 · Money · Deadlock replay can be charged twice for one match
- **Where:** desktop `electron/main/index.ts` ~3990 and ~5683, and `electron/main/deadlock-review.ts:34`.
- **What happens:**
  - The match-end path (`uploadReplayInBackground`) already uploads, and charges for, every Deadlock replay it finds. This is existing behaviour, and it is not gated on `autoAnalyse`.
  - The `tryAutoUploadSourceReplay` path also uploads when `autoAnalyse` is on.
  - Neither path stores the job on the recording (`deadlockReviewJobId`).
  - So the new **Review replay** link is still offered on that recording, and it uploads again: a second credit for the same match.
  - The API only blocks a second upload while the first is in flight (30 min, `DeadlockDemoController.php:38`). It does not de-duplicate by match.
- **Fix:**
  1. In both auto-upload paths, call `captureStore.setDeadlockReviewJob(rec.id, jobId)` once `jobId` is known (find the recording by `matchId === String(lobbyMatchId)` or by session time).
  2. In the API `presign`/`confirm`: if the user already has a non-failed `DeadlockAnalysis` with the same `deadlock_match_id`, return that `job_id` with 200 instead of creating and charging a new one.
  3. Add a test for each side.

### P1-2 · Auth · Old tokens become valid again after deploy
- **Where:** API `config/sanctum.php:50`. The `expiration` changed from 30 days to `null`.
- **What happens:**
  - Existing tokens have no `expires_at`, so on main they expire 30 days after creation.
  - With `expiration => null`, any token older than 30 days that is still in the database becomes valid again.
  - `auth:prune-idle-tokens` only deletes tokens unused for 30+ days, and a token whose last successful use was less than 30 days ago (before it expired) survives the first prune.
  - Result: abandoned or leaked desktop and web tokens come back to life.
- **Fix:** in the same deploy, add a migration (or a one-off command run before the config change takes effect) that backfills `expires_at = created_at + 30 days` for every token where `expires_at IS NULL`. Old-expired tokens stay dead; live ones slide on next use through `ExtendAccessTokenExpiry`. Then the prune command can drop its `whereNull` branch. Add a test: a token created 45 days ago with no `expires_at` is rejected.

---

## P2: should fix

### P2-1 · Money · Stats-only refunds have no cap
- **Where:** API `app/Services/VODAnalysisService.php`, `refundStatsOnlyCredit`.
- **Problem:** a player can trigger the degraded stats-only path on purpose (for example a blank or unreadable video) and get free stats reports with no limit. Each still costs an AI call. The memory rule is "no unlimited compute".
- **Fix:** refund at most N stats-only reports per user per month (for example 3; count jobs with `credit_refund_reason=stats_only_report` this month). After that, deliver the report charged and say so in the copy.

### P2-2 · Auth · Browser tokens are uncapped
- **Where:** API `app/Support/AccessTokenLifetime.php`, `deviceName()`.
- **Problem:** `web-<id>` now gets its own token slot, but only desktop slots are capped (5). A script, or many browsers, can create unlimited tokens per user.
- **Fix:** add `capWebTokens` (for example the newest 10), called on web login. Test it.

### P2-3 · Data · Rank history disappears after a Riot ID rename
- **Where:** API `app/Http/Controllers/API/StatsController.php:~320`.
- **Problem:** the main-account filter matches `player_name` and `player_tag` against the user's current Riot ID. Snapshots are stored by name and there is no `puuid` column, so a player who renames sees an empty rank history and Progress chart.
- **Fix:** filter by every name this account has had (keep a `riot_accounts` name history), or add a `puuid` column to `valorant_stats_snapshots` and backfill from the active account. Until then, fall back to no filter when the filter returns 0 rows.

### P2-4 · UI · Progress range tabs don't match the chart
- **Where:** desktop `ProgressV3` / `StatsView` (screenshot `final_stats.jpg`).
- **Problem:** with **30D** selected, the header says "0 games in this range", but the chart and sentence cover "the last 361 days". Since v3 asks for `rrHistory('all')`, the range tabs don't filter the rank chart. The "Focus: De…" label is also clipped at the right edge.
- **Fix:** filter the rank series by the selected range on the client, or name the chart "All time" and hide the tabs for it. Keep the focus label inside the plot area, by right-aligning it to the marker's left when near the edge.

### P2-5 · Copy · Home coach line is wrong for accounts with matches
- **Where:** desktop `HomeV3` (screenshot `final_dashboard.jpg`).
- **Problem:** with 147 analysed matches it still says "Set up recording and play a match…". This was known from the speed notes.
- **Fix:** when there's no focus note or saved insight, use the last analysis's top issue or summary sentence. Otherwise say "Your last match: <result> on <map>", with the next step.

### P2-6 · Data · Matches rows don't show scores, and the status repeats
- **Where:** desktop `MatchRowV3` / `useFootageLibrary` (screenshot `final_recordings.jpg`).
- **Problem:** every row shows "No score yet", even for analysed matches (Home shows a coach score of 53 for the same Summit match). The status column says "Cloud" twice.
- **Fix:** join cloud rows to their analysis (`analysis_id`, or `job_id` → score) when building rows, and show the second status line only when it differs from the first.

### P2-7 · UI · Sidebar plan line differs between screens
- **Where:** desktop `SidebarV3.vue` (`/recordings` vs other screens).
- **Problem:** it says "Free · Usage unavailable" on Matches and "Admin · Unlimited analyses" elsewhere: the profile is refetched on every mount and fails or flickers.
- **Fix:** read it through `useStaleLoad('sidebar:plan', …)`; this exact change is already in `notes-speed.md`.

### P2-8 · Copy · Count and plural errors
- `src/components/settings/AccountUsagePanel.vue:80` and `:134`: "1 purchased report credits".
- `src/views/v3/SquadV3.vue:228`: "1 analyses".
- **Fix:** use one shared `plural(n, 'analysis', 'analyses')` helper.

### P2-9 · Data · Squad members show "No rank yet"
- **Where:** desktop `SquadV3` (screenshot `final_squad.jpg`).
- **Problem:** every member shows "No rank yet", including the signed-in Platinum 1 player.
- **Fix:** once the rank-snapshot endpoint ships, read the latest snapshot per member. Until then, show the user's own rank from `valorant-rank.json`.

### P2-10 · Data · Valorant rank is self-reported
- **Where:** API `ValorantRankController`.
- **Problem:** the rank comes from the desktop. It is validated and limited to linked accounts, but a modified client can send any tier.
- **Fix:** don't use it for anything competitive (leaderboards, coach matching) without Riot verification. Store `source='desktop_client'` on the snapshot so later features can tell it apart.

---

## P3: worth doing

- **Missing sender checks.** Desktop `lol:analyze-match` (`ipc/gaming-ipc.ts`) and `cs2:attach-faceit-match` (`cs2-faceit-match.ts:177`) spend a credit but don't check the sender like `deadlock:review-replay` does (`isTrustedRendererUrl`). Only app windows load the preload, so this is defence in depth.
- **FACEIT match can be analysed twice.** `CS2FaceitController::analyzeMatch` has no de-duplication by `faceit_match_id`, so the same FACEIT match can be charged twice from web plus desktop. This is existing behaviour. Fix: return the existing non-failed analysis.
- **Cached user stores more than its comment says.** `electron/main/session-store.ts:72` says "no PUUIDs" but stores `riot_accounts` raw, along with Riot and League IDs. Fix: strip each account to `{id, riot_name, riot_tag, is_active}` and make the comment and the notes match what's stored.
- **Router guard lets signed-out users through on IPC failure.** `src/main.ts`: when the status IPC fails twice, it returns `true` for every route, including a signed-out user on a protected route. The API still enforces auth, but the screen may show broken data. Fix: only continue when a cached session exists.
- **Unhandled rejection in the onboarding gate.** `src/main.ts`, `onboardingCampaignRedirect`: if `getOnboardingCampaign()` rejects after the 1.5 s race, `void check.then(...)` is an unhandled rejection. Fix: add `.catch(() => null)` to `check`.
- **Valorant aim and buy-matchup claims lack golden cases.** They're tested in `tests/test_match_report_hits.py` but not marked `claim_contract` and not in `tests/fixtures/coaching_claims/`. Add a golden case for consistency with the other games.
- **Sidebar focus ring sticks.** It stays on "Matches" or "Coach" after navigating, so two items look selected in `final_dashboard`, `final_stats` and `final_squad`. Fix: blur the button after `router.push`, or use `:focus-visible` only.
- **Rank chart is crowded.** A rank badge on every point overlaps at 360 days. Show badges only where the rank changes.
- **Practice recommendations repeat.** "Recommended from your matches" lists three "Flick" rows with prompt-like scenario names. Group them by drill and show the scenario as a sub-line.

---

## Verified as fine
- **Refunds are idempotent:**
  - The stats-only refund only runs when `free_analysis_reserved && !credit_refunded`, and it writes `credit_refunded` before later param writes, which re-read `$job->params`.
  - League `failAnalysis` refunds only when `quota_reserved`.
  - Admin and onboarding sources aren't refunded.
- **League rank:**
  - Riot entries are filtered to Solo/Duo (`RiotLolService.php:116`).
  - Rank sync failure is caught and the analysis continues.
  - `tier` and `division` columns exist.
- **401 handling:** only a 401 for the token the request carried ends the session, and errors are redacted (no Bearer in logs).
- **Rank snapshot endpoint:** strict validation, limited to the user's linked accounts, 30 requests per hour.
- **Analyse contract:** CS2/Deadlock Analyse still needs real kills (the contract tests pass). The Deadlock local parser no longer pretends.
- **Upload size:** the bigger Valorant upload (50–80 KB) is far under `post_max_size`.
- **Old UI with `uiV3` off:**
  - Spot-checked changes are additive `v-if="uiV3"` branches.
  - Deliberate shared changes: the AchievementManager queue fix, the `useFootageLibrary` confirm injection (native default kept), router-guard resilience, the onboarding-gate cache, the play overlay hidden without video, and the open-notes analysis-id fix.

---

## Deploy checklist
1. **Fix P1-1 and P1-2 first**, with tests.
2. **AI service** (`ai-fixes`): deploy and restart. It accepts both old and new fields, so it's safe ahead of the API. `VALORANT_ROUND_REVIEW_ENABLED` stays off.
3. **API** (`api-fixes`):
   - Run `php artisan migrate`. This adds:
     - `faceit_connections.previous_elo`
     - `faceit_connections.faceit_steam_id`
     - the `lol_rank_snapshots` table
     - the P1-2 token backfill
   - Make sure the production scheduler runs `schedule:run` every minute. It's needed for `sanctum:prune-expired` and `auth:prune-idle-tokens`.
   - Clear the `getItems` cache key if the Deadlock notes ask for it.
4. **Desktop** (`rework`): bump `package.json` version, push main, and let `auto-tag.yml` tag and build. The UI v3 switch is still off in production (`uiV3` is dev-only), so the new design ships dark. The sign-out, rank and money fixes still apply, because they're in shared code.
5. **After the release**, watch `desktop_signed_out` reasons and Deadlock and CS2 job failure rates for a week.

## What to tell users
"This update fixes random sign-outs (slow internet at launch, signing in on a second PC, and the 30-day logout), keeps your Valorant rank up to date, and returns your credit when we can't review your video."

---

## Fixes (final review) — fixer-desktop, desktop only
| Item | Fix | Tests |
|---|---|---|
| **P1-1 (desktop side)** | `uploadReplayInBackground` / `tryAutoUploadSourceReplay` take `onJobId`; all four Deadlock auto-upload paths (match-end with recording, demo-only, process-exit `finally`, post-game retry scan) call `linkAutoDeadlockReviewJob` → `setDeadlockReviewJob` on the match's recording(s) (match id first, else recordedAt within 10 min of the session start; never other games, other matches or already-linked rows) and start the same capped poller. The row then shows "Replay review in progress" instead of "Review replay". | `deadlock-auto-review-link.test.ts` (4) |
| P2-4 Progress range | Rank line follows the range tabs (`rankHistoryInRange`: in-range points, or one earlier anchor when the range has a single point); falls back to whole history only with a note saying so. Focus label anchors to the left of its marker near the right edge. | `rank-range.test.ts` (4) |
| P2-5 Home coach line | `coachLine` falls back to the real last analysed match ("Your last match was a win on Summit, 13–10." · "Open it to see what decided it.") — never "Set up recording" when matches exist. | `home-v3.test.ts` (+1 case) |
| P2-6 Matches rows | Rows with an `analysisId` take score/result/KDA from the server analysis (joined by id via `loadGameAnalyses`) when the timeline has none; storage line no longer repeats the status ("Cloud" twice); cloud-only rows show no "No score yet". | `match-row-analysis.test.ts` (4) |
| P2-7 Sidebar plan line | One cached source (`sidebar:user`); a failed refresh keeps the last plan; nothing shown until known. Also P3: mouse clicks drop the sticky focus ring. | — |
| P2-8 plurals | `src/lib/plural.ts`; applied to purchased report credits, Coach Credits (both Settings branches), Practice drills, Home "drills done", League trend games, round log rounds. | `plural.test.ts` |
| P3 | onboarding gate `.catch(() => null)`; cached user keeps only `{id, riot_name, riot_tag, riot_region, is_active}` per Riot account (no PUUIDs); sender checks on `lol:analyze-match` and `cs2:attach-faceit-match`. | `session-store.test.ts` (+1) |

**Deferred (lead: Teams / Squad / Rosters audit running):** P2-8 "1 analyses" in `SquadV3.vue:228`, P2-9 Squad "No rank yet", `RostersCoachPanel` "{n} members" plural.
**Not done here:** P2-6 for cloud-only rows needs data — `CloudStorageController@index` has no analysis link in its rows; API spec: join `archived_recordings.analysis_log_id` and return an optional `analysis: { won, rounds_won, rounds_lost, kills, deaths, assists }` per recording item (validated optional on the desktop `CloudFile`). P3 skipped: router guard on IPC failure (behaviour change in a sign-in path; needs its own review), rank chart crowding (badges are already only where rank changes; still dense — the focus label can overlap a badge), Practice recommendation grouping, Valorant golden cases (AI repo, not desktop).
**Checks:** type-check clean · eslint clean on changed files · `npm test` 1,728 passed, 9 skipped · screenshots `scratchpad/rework-shots/fixd_{dashboard,stats,recordings,settings,squad}.jpg` looked at (Home coach line ✓, plan line "Admin · Unlimited analyses" on every screen ✓, Matches single "Cloud" ✓, Progress 30D shows "last 25 days" ✓).
| P1-1 (API follow-up, desktop side) | `SourceReplayUploader.upload` treats presign `already_analysed: true` as success: no S3 upload, no confirm, progress 100, returns the first analysis `jobId` (`alreadyAnalysed: true`). Every caller already links that job to the recording (`onJobId` / Review replay `setJob`) and polls it to "complete" — no error toast. | `source-replay-uploader.test.ts` (2) |
