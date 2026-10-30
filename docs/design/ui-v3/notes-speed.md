# Loading & speed — Home, Progress, game panels, post-game (agent-speed-home, round 4)

Measured on the user's real production account (read-only), dev app, via CDP: ms from route change to each
on-screen milestone. `window.api` is frozen (contextBridge), so calls can't be wrapped; per-call times come from a
parallel probe: profile.get 944 · refreshUser 718 · rrHistory 802 · cs2.* 1.2–1.6 s · deadlock/lol/accountUsage ≈2.5 s.

## Before
- Home waited for profile + analyses + playstyle + recordings together, **then** the auth refresh (sequential), before any match
  showed; the coach sentence (`lastInsight`) only arrived at the very end of mount, after ~8 more awaited calls.
  Cold: first match data **1,449 ms**. While loading it showed "Your coach is ready" / "No analysed matches yet" /
  "What happens next" — wrong for a user with matches — then jumped.
- Home also fetched CS2 + Deadlock + League link state in the background on every Valorant visit (≈6 extra slow calls).
- Progress: "Loading your progress…" text until analyses(100) + rank history both returned (cold **1,279–1,519 ms**), every visit.
- Focus panel: "Loading your focus…" on every visit.

## After
| | first ever (no cache) | repeat visit |
|---|---|---|
| Progress | skeleton at **8–12 ms**, data 1.3–1.5 s (network) | full content **7–13 ms** |
| Home | skeleton in shape (181 ms), focus 909 ms, matches ~1.5 s | cached content as soon as the route opens — **but see blocker** |

## Blocker (lead file `src/main.ts`)
`router.beforeEach` awaits `window.api.auth.getOnboardingCampaign()` (a server call) on **every** navigation to
`/dashboard`. Home can't draw until it returns: ~180 ms normally, **8.6 s** in one run here. Progress has no such gate (7 ms).
Fix: check the campaign once per session (cache `requires_onboarding` in memory after the first `ok` answer; re-check only on
sign-in), or don't block — navigate, and redirect to /onboarding if the answer says so.

## What changed
- `useDashboard({ cacheFirst })` (on for v3 only via DashboardView): Home hydrates from `home:<game>` + `home:profile` at
  creation; mount loads profile / analyses / playstyle / recordings independently (no waiting on the auth refresh);
  `lastInsight` from the settings already read at mount start; only the active game's link state; failed refresh keeps data
  (`refreshFailed` + `retryRefresh`); game switch draws that game's cache. Old dashboard path unchanged.
- `createFocusCardState(api, { initial })`: optional cached start (old callers unchanged). Focus cache `focus` shared by Home and Progress.
- `useGameData`: per-game snapshot cache `game:<g>`; a failed refresh keeps the last good CS2/Deadlock values.
- StatsView (v3 branch only): `progress:<game>` cache, quiet refresh, keep data on failure, and a game-switch reload (the view
  doesn't remount when the title-bar game changes — v3 Progress showed the previous game's stats before).
- Skeletons in the real shape: Home hero/score, stats, coach sentence, buttons, form row, recent rows, focus; Progress head,
  rank chart, columns, stat row; game summary/progress. `.uf-reveal` only on content that replaced a skeleton; `.uf-refreshing`
  1px line during background refresh; "Couldn't refresh · showing your last data · Retry".
- Post-game: unchanged — its "loading" is the live analysis progress pushed from the main process; nothing to fetch or cache.

## Found, not changed
- Home coach line for this account falls back to "Set up recording and play a match…" although the account has analysed
  matches: `coachLine` only uses the focus note or `lastInsight`; neither was set. Copy should not say "set up recording" when matches exist.
- `useGameData` League link check uses `riot_name` (as the old LolStatsPanel did), not `lol_riot_name`.

## agent-speed-rest — Practice, Team, Settings, Clips, Cloud storage (round 4)

Measured on the user's real production account by hash navigation from /dashboard (`scratchpad/analysis/speed-nav.mjs` under the shared window lock, `scratchpad/speed-locked.sh`). "content" = ms until the screen's root shows ≥50 % of its final text with no placeholder; "repeat" = second visit in the same session. Network varied between runs (first visits depend on API latency; repeat visits are the cache test).

| Screen | Before first | Before repeat | After first | After repeat | Visible change |
|---|---|---|---|---|---|
| Practice | 63 ms, hero swaps ~1–2 s later (focus + drills land) | 68 ms, swap again | 60 ms | 52 ms, no swap | cached focus + trainer data; trainer fetch starts at setup, not after achievements/settings awaits; Analytics "Loading history…" → row placeholders |
| Squad | 1,656 ms (4 grey bars, then jump) | 1,555 ms | 2,652 ms* (shaped placeholder) | **53 ms** | cache-first; waits only on getTeam (analyses/clips unused in v3); refresh = 1px line |
| Rosters (student) | 1,251 ms (5 grey bars) | 1,001 ms | ~shaped placeholder | **52 ms** | cache-first; window-focus refresh no longer flashes the skeleton; coach side cached + quiet too (form not overwritten on refresh) |
| Settings | 602 ms, settled 1,602 ms (sequential awaits) | — | **51 ms** | — | refreshUser / FACEIT / Deadlock link no longer block; profile request starts at mount; usage cached; "Loading…" → "Refreshing…" over data, placeholder rows otherwise |
| Clips | 1,252 ms "Loading clips…" | 401 ms | **52 ms** | **51 ms** | per-game clip list cached; placeholder tiles in grid shape |
| Cloud storage | 1,902 ms "Loading cloud files…", 2 jumps | 551 ms | 703 ms | 552 ms, 0 jumps | library page + usage cached (re-validated on read); allowance + file rows placeholders |
\* Squad's first visit after the change ran while the API was slow; the skeleton now matches the final layout, so the swap no longer moves the page.

Files: SquadView.vue (+loadV3), v3/SquadV3.vue, RostersView.vue, v3/RostersV3.vue, rosters/useCoachRoster.ts, v3/team/CoachRosterV3.vue, ClipsView.vue, CloudStorageView.vue, composables/useAccountUsage.ts, composables/useSettings.ts, settings/AccountUsagePanel.vue, TrainingHubView.vue, v3/practice/usePracticeFocus.ts, v3/practice/PracticeAnalyticsV3.vue. Every change is behind `uiV3` except TrainingHubView's fetch/apply refactor (same calls, same order of effects for the old UI).

### For the lead
- **Sidebar plan line** (`SidebarV3.vue` onMounted) refetches `profile.get` + `settings.get` on every mount (~0.9 s → "Free · Usage unavailable" flicker before "Admin · Unlimited analyses"). Exact change: `const hit = readCache<ProfileData['user']>('sidebar:user'); if (hit) profileUser.value = hit.value` before the `Promise.all`, and `if (p?.user) writeCache('sidebar:user', p.user)` after it.
- **Session drops on a slow network (real bug, main process):** `auth-manager.ts` `fetchUser()` catch-all sets `_token = null` / `_user = null` on ANY failure, incl. timeouts after 3 retries. During the API timeouts this afternoon the renderer then showed /login although `auth.enc` was still on disk. Fix: only drop the session on 401/403; on network/5xx keep the token and return the cached `_user`.
- **Dev log is dead since 15:57:** the lead's `sed -i` redaction replaced `scratchpad/rework-dev.log`; the running app keeps writing to the deleted inode. Restart the dev app (or use `sed` without `-i` into a copy) to get logs back.
- **Don't reload the renderer** while testing (`Page.navigate`/`location.reload`): with the bug above, a reload during a slow API moment lands on /login. I restored the session with `auth.loadStored()` (reads the stored token; no credentials entered).
- Things seen on real data, not speed (owners: team/library): every Squad member shows "No rank yet"; "1 analyses"; Cloud storage "Size unavailable included" on an uncapped account; Cloud storage still flashes ~0.5 s of loading text from the Extra storage panel (`StorageAddonPicker`).

## agent-speed-matches — Matches, match page, coaching reviews (round 4)

Measured on production with the user's real account (read-only), Valorant Summit cloud recording (analysis 639).

### Why it was slow
- **Match page waterfall:** archive/timeline → analysis detail → coach review → annotations → playback URL ran one after another behind a "Loading match timeline…" line, then everything appeared at once.
- **Clicks looked dead:** opening an analysed match downloaded the whole timeline *before* navigating (`openAnalysisVodReview`).
- **Double fetch:** `analyses:get-timeline` and `analyses:get-detail` both GET `/api/analysis/{id}` (main process — lead file).
- **Coaching reviews flashed "No coaching reviews yet"** while reviews loaded (skeleton needed *both* sources loading).
- **Matches:** cloud list fetched all pages before showing; rows popped in later.

### Per-call times (two runs)
| Call | Run 1 | Run 2 |
|---|---|---|
| archive review | 2715 ms | 1900 ms |
| analysis detail | 1862 ms | 1005 ms |
| coach review | 176 ms | 161 ms |
| playback URL | 242 ms | 241 ms |
| analysis timeline (same GET as detail) | 1445 ms | 850 ms |

### Before → after (same match)
| Moment | Classic | v3 |
|---|---|---|
| Something on screen | blank + "Loading…" | **32–43 ms**: page-shaped skeleton; header shows map art, map, agent from the clicked row |
| Header + round log + player frame | 3873–5544 ms, all at once | **955–1981 ms** after a normal 1.2 s hover · 3360 ms cold link |
| Video ready | after everything | **2014–3132 ms** from a hovered row · 4293 ms cold |
| Coach sentence | with everything | last (3.4–6.5 s) into a same-size skeleton line |

Marks from `scratchpad/analysis/mp-ttfc.mjs` (DOM polling). The skeleton reserves the cloud strip and round-number row, so the body doesn't move when content fades in.

### What changed (v3 only; classic paths unchanged)
- `useVodReview`: `loadTimelineV3` draws as soon as the timeline exists; detail, coach review (+annotations) and playback refresh run in parallel (`detailLoading`); stale loads dropped (`loadSeq`); coach-notes seek still waits for the review.
- `composables/vod/match-prefetch.ts`: hover/focus on Matches or Coaching-review rows starts read-only GETs (archive review **without** the `analyse` flag, analysis timeline, detail). Shared in-flight, 90 s TTL, max 8, memory only, cleared on account change. The reviews detail pane shares the prefetched detail.
- `composables/vod/match-summary.ts`: row facts (result/score/KDA only when the row's match data has them) and last-visit facts cached per user → instant header.
- `MatchPageSkeletonV3` + `.uf-reveal` on header/body; coach line held behind a skeleton until detail lands.
- Opening an analysed match navigates immediately; `trackReportOpened` still fires.
- Matches: cloud list cache-first, row-shaped skeletons on first load only.
- Coaching reviews: cache-first per game, keeps list on failed refresh, no false empty state, shaped skeletons (list + detail).

### For the lead
- De-dupe `GET /api/analysis/{id}` in `auth-ipc.ts` (`get-timeline` + `get-detail`): saves ~1–2 s on analysis opens.
- `archiveReview` (`recordings-ipc.ts`) is the 1.9–2.7 s step — profile archive GET vs timeline build.
- The app was found signed out mid-session with nothing in the log; `AuthManager.logout()` doesn't log. Add `[Auth] logout()` logging.
