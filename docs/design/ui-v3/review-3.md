# UI v3 — review round 3

Scope: everything after review 2. Covers the round-3 helpers (vod, train, team, shell, library2, settings2, games), the lead's shell, nav and switch edits, and a coverage re-audit.
**Checks:** `npm run type-check` clean · `npx eslint` on all 130+ changed/new src+electron files clean · `npm test` 1,496 passed, 9 skipped, 0 failed.
**Screenshots (looked at):** /dashboard /recordings /clips /training /stats /squad /rosters /settings /cloud-storage. The app was on **League** for all of them (see P1-1).

## P1 — must fix
1. **The user's primary game was left on League.** Their real settings file (`~/Library/Application Support/upforge-desktop/settings.json`) has `"primaryGame": "lol"`, and the title bar shows "UpForge · LOL". agent-games reported switching back to Valorant, but the switch didn't stick.
   - **Risk:** a real user preference was changed by testing.
   - **Fix (lead):** confirm the original game with the user (Valorant per agent-games), then click it in the v3 title bar. Don't edit the settings file by hand.

## P2 — should fix
1. **Matches delete flow isn't on the v3 dialog pattern.**
   - **Where:** `src/views/v3/MatchesV3.vue:132-145` hand-rolls `.uf-dialog` / `.uf-dialog-back`. Separately, `src/components/v3/matches/useFootageLibrary.ts:209,218,248` uses native `window.confirm` for in-flight, plain and bulk delete, so v3 shows OS dialogs.
   - **Rule:** Round 3, "Every v3 modal uses UfDialog".
   - **Fix:**
     - Replace the hand-rolled block with `<UfDialog :open="pendingDelete?.variant === 'cloud'" title="Delete recording" @close="pendingDelete = null">`, with the three actions in `#actions`.
     - For the confirms, add an option `useFootageLibrary({ confirm?: (msg: string) => Promise<boolean> })` defaulting to `async m => window.confirm(m)`. The old RecordingsView shares this composable, so the default keeps the old UI byte-for-byte the same in behaviour.
     - Have MatchesV3 pass a UfDialog-backed confirm: a `confirmState` ref holding `{ text, resolve }`.
2. **The trainer-results empty state is still the old design.**
   - **Where:** `src/views/TrainerResultsView.vue:3`. The `v-if="uiV3 && result"` means that with no result, line 141's `<template v-else>` renders the old markup in v3.
   - **Fix:** change it to `v-if="uiV3"` and add a v3 empty state inside: "No drill result yet" (uf-t2) plus a link-style action "Back to Practice" (`router.push('/training')`).
3. **Red used as decoration on Cloud storage.**
   - **Where:** `src/components/shared/StorageAddonPicker.vue:176` (`.uf-sp { border-top: 2px solid var(--uf-red) }`). The same panel also holds the red primary "Continue · $4.99/month".
   - **Rule:** hard rule 4, red is for the one primary or the focus only.
   - **Fix:** use `border-top: 1px solid var(--uf-line-2)`.

## P3 — polish / notes
- **Off-scale sizes:**
  - **Agent files:** 14px control text in `components/v3/settings/settings-v3.css:40,72`, `views/PerformanceView.vue:803` and `views/ValorantCalibrationView.vue:213` → use 15px (`uf-t3` size). 20px avatar initials in `rosters/RosterSendSheet.vue:229` and `v3/team/CoachRosterV3.vue:180` → use 26px (`uf-d4`) or 16px.
  - **Lead base files:** `design/v3.css:181` 14px → 15, `design/v3.css:184` 18px → 26 or 16, `UfRoundsLine.vue:42` 10px → 12, `SidebarV3.vue:76` 14px → 15. Alternatively, add these to the rulebook as allowed control or label sizes.
- **Hard-coded token hex** in `src/components/v3/progress/RankJourney.vue:64,65,71,72` and the line path (`#22a99b` / `#e8505b` / `#ff4655` / `#ece8e1`). Use `:style="{ stopColor: rising ? 'var(--uf-win)' : 'var(--uf-loss)' }"` and `style="stroke: var(--uf-red)"`, as was done for ReviewDetailV3 in review 2.
- **Fragment root in RostersView:** `src/views/RostersView.vue` now renders `<RosterSendSheet>` as a sibling of the v3/old roots. App.vue passes `:class` to the route component, so a fragment root drops it and Vue warns about extraneous attrs. Move the sheet inside both branches, or wrap them in one root `<div class="contents">`. Behaviour is otherwise unchanged (the sheet teleports).
- **Rosters header:** the Refresh button (`src/views/v3/RostersV3.vue:100`) sits about 350px left of the content's right edge, unlike Matches and Cloud storage where header actions align right. Match the header width to the content column.
- **League Progress:** "Review recordings" (`src/components/v3/games/GameProgress.vue:143`) renders centred mid-page under the empty sentence. Make it left-aligned (`align-self: flex-start`).
- **Squad copy:** `src/views/v3/SquadV3.vue:147` says squads work "across Valorant, CS2 and Deadlock", but Team is now reachable for League too. Confirm whether squads support League, then add it or leave as is.
- **Practice on non-Valorant games:** `/training` still renders when League is primary and the user navigates directly. The App.vue guard only runs on game change. Low risk, because the sidebar hides Practice.
- **Dev tools:** DashboardDevTools (old dashed rounded box) shows inside v3 Home in dev mode only. Acceptable; tracked in coverage.

## Old UI with the switch off — verified
- **Purely additive files:** every file with no deleted lines.
- **Files with deletions:** checked line by line.
  - App.vue, the Settings panes, ClipsView, TrainingHubView and the other views only turned old `v-if`s into `v-else`/`v-else-if` behind `uiV3`.
  - The old markup is otherwise identical.
- **Intentional shared changes:**
  - **AchievementManager:** the bug is confirmed and the fix is correct.
    - **The bug:** on origin/main, AchievementToast calls both `props.onDismiss()` and `emit('dismiss')` (lines 55–56), so the old `nextToast` ran twice. With a queue of A, B, C, dismissing A shifted B out and then C, then re-inserted B, so **C was dropped**.
    - **The fix:** `createToastQueue.next()` is a no-op while nothing is on screen, which absorbs the double call. It's covered by `src/lib/shell-v3.test.ts`.
    - **Impact:** this changes the old UI, as a fix. Mention it in the PR.
  - **RostersCoachPanel → useCoachRoster / coach-roster.ts:** the same refs, computeds and API calls (6 = 6). `draftReason` and `reviewSubtitle` were moved verbatim, and the old template only gained a `CoachRosterV3 v-if="uiV3"` line.
  - **RecordingsView → useFootageLibrary:** unchanged since review 2.
  - **StatsView:** the Valorant-only redirect is now `&& !uiV3`. The old view also changed RR→elo plotting and the "RR"→"rating" label: an intentional bug fix from the account-tag work, which affects the old UI.
  - **App.vue:** allowed routes on game change only widen in v3 (`/stats`, `/squad`).
  - **SettingsToggle:** v3 branch added; test now covers both branches.
- **Main process:**
  - **rr-history range:** whitelisted.
  - **`recordings:list-all` `allAccounts`:** only when `=== true`, and unlinked Riot IDs are never listed.
  - **focus-state:** sanitises `rounds` and `account`.
  - **Import from `src/lib/focus`:** matches the existing pattern (game-config, overstep-integration).

## Coverage re-audit
- **Every route in src/main.ts:** each one renders v3 when on, except `/overlay` (runtime-disabled), `/dev` and `/dashboard-needs-you-preview` (dev only), `/splash` (R) and `/trainer-results` with no result (P2-2).
- **Teleport, modal and toast sweep:** the only components without a v3 branch are GameSwitcher (unused), RecordingsView (old UI only, since /recordings renders MatchesV3) and OverlayView (disabled).
- **Old components rendered inside v3 shells without their own branch:**
  - VodLeagueScoreboard, VodPersonalReview, VodWorkspaceDivider, VodReviewNotebook, VodWorkspaceCoach and MatchSavedReviews are all W via `.ui-v3` scoped restyles. This is consistent with the tracker.
  - VodTimelineEventIcon is an icon only.
  - The squad components imported by SquadV3 are type-only imports.
- **Tracker corrections made in coverage.md:** the trainer-results empty state, Matches delete confirmations, DashboardDevTools, and Overstep's nav entry (now done).

## Fixed after review (agent-fix3)
- **P1-1:** resolved by the user. They re-signed in and Valorant is selected; no settings were touched.
- **P2-1:** the cloud-delete choice in MatchesV3 is now a `UfDialog`. `useFootageLibrary({ confirm })` is injectable, so MatchesV3 passes a UfDialog-backed confirm while the old RecordingsView keeps the native `window.confirm` as the default. There's a new test for the injected path, and the existing tests cover the native path.
- **P2-2:** TrainerResultsView now shows a v3 empty state ("No drill result yet" plus "Back to Practice"). The old branch is unchanged.
- **P2-3:** the StorageAddonPicker top rule is now a 1px `--uf-line-2` line instead of red.
- **P3, sizes:**
  - Brought back onto the scale:
    - the 14px controls in settings-v3.css, PerformanceView, Calibration, the v3.css guide steps and SidebarV3, now 15px
    - the 20px avatar initials in RosterSendSheet and CoachRosterV3, now 16px
    - the v3.css guide numbers, 18px → 16px
  - **Kept:** UfRoundsLine's 10px round numbers stay, because 12px overflows the cells in the 400px post-game window. Treat it as a chart tick label.
- **P3, colours:** RankJourney's hard-coded hex values are now tokens via `style`, and its test asserts `var(--uf-loss)`.
- **P3, fragment root:** RostersView's send sheet is back inside the old root, byte-identical to origin. v3 renders it through a new `#overlays` slot in RostersV3, so each branch has a single root.
- **P3, League Progress:** "Review recordings" is now left-aligned.
- **P3, not changed:**
  - the Rosters header width (cosmetic; needs a screenshot with coach data)
  - the Squad copy about League (needs a product answer on whether squads support League)
  - the direct `/training` guard on non-Valorant games (low risk)
- **Security, from the dev log:**
  - **The leak:** IPC handlers rethrow Axios errors, and Electron printed them in full ("Error occurred in handler for 'cs2:get-faceit-connection'"), including `Authorization: Bearer …` from `config.headers` and `request._header`.
  - **The fix:** the shared API client's response interceptor (`auth-manager.ts`) now rejects with `redactAxiosError(err)` (new file `electron/main/redact-axios-error.ts`). It keeps message, code, status, response data and safe headers, and drops config headers, the raw request, and the auth/cookie headers.
  - **Tests:** `electron/main/redact-axios-error.test.ts` checks that a real failed request's printed error never contains "Bearer".
  - **Scope:** this changes the old UI too, but only as a bug fix in the logs.
  - **Not cleaned up:** the existing dev log in the scratchpad still has old entries with the token.
