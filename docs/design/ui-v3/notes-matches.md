# UI v3 · Matches & Clips — notes (agent-matches)

## Built
- **Matches (`/recordings`)** — `src/views/v3/MatchesV3.vue`, switched in `src/views/MatchesView.vue`.
  - Header `MatchesTabsV3`: label + D2 title, text tabs **Matches · Coaching reviews · Clips** (Clips lives
    under the Matches nav item), count line (recordings + bytes on this PC), Open folder / Manage storage links.
  - Filters as text tabs: game (with logo) and status (All, Action required, Ready, Analysed, Cloud) + Select.
  - Recordings grouped by day as hairline rows (`MatchRowV3`): map art thumb, game logo, map + agent + time,
    **result score in D4 teal/red from the match timeline** with K/D/A, status / attention hint / storage, actions
    (Continue, Watch, Review/Watch, delete). Bulk select bar, cloud-backed delete dialog, empty/loading/error states.
  - Logic in `src/components/v3/matches/useFootageLibrary.ts` — a faithful copy of `RecordingsView.vue`'s script
    (same IPC calls, confirm texts and messages). Pure row helpers in `match-row.ts` (+ tests).
- **Clips (`/clips`)** — v3 branches inside `src/views/ClipsView.vue` (its ~900 lines of script and the player,
  trim, analysis-confirm and upgrade modals are reused unchanged). New v3 header (same tabs), text-tab filters for
  type / group / sort, stats line with bulk actions, sections per match with top moments and match actions, and a
  grid of `ClipTileV3` (square 16:9 thumb, trigger label, score, duration, title/meta, favourite ★, upload/analyse,
  inline delete confirm). Toast and modals are shared with the old UI.

## Data
Only existing data: `recordings.listAll`, `cloudStorage.list`, `storage.getUsage`, `clips.*` via the existing view
script. Result score/K/D/A come from `PendingRecording.timeline.finalScore/finalStats`; when missing the row says
"No score yet" (never guessed).

## Deviations / gaps (for the lead)
- `ClipsV3.vue` was not created as a separate file: the clips logic lives in ClipsView's script, so the v3 markup
  is inline there (behind `uiV3`) to avoid duplicating ~900 lines. Tiles are extracted to `ClipTileV3.vue`.
- `useFootageLibrary` duplicates RecordingsView's logic; when v3 ships, RecordingsView should use the composable.
- **Coaching reviews** tab embeds the existing `CoachingHistoryView` (old pills/panels) under the v3 header.
  Its toolbar/list/detail components (`components/coaching-history/*`) have no v3 owner yet.
- `CloudUsageNotice` (shared component, old button style) is shown as-is on both screens.
- **Account tags** (main/alt) on rows need match→account tagging (branch feat/match-account-tag); not shown.
- "Coach picked" clips from the board are not shown: there is no such field; real "Top moments" are shown instead.
- No local recordings/clips in this environment, so rows/tiles were checked by type-check + unit tests, not a
  populated screenshot. Empty states were screenshotted (`rework-shots/matches-v3.jpg`, `clips-v3.jpg`, `coaching-v3.jpg`).
- Old list view mode (grid/list toggle) is not offered in v3 (grid only); `viewMode` still works in the old UI.

## Checks
`vue-tsc --noEmit` clean · eslint clean on owned files · `match-row.test.ts` 4/4 · full `npm test` 1377 passed.

## Round 2 (agent-library)

**1. One source of logic (review P2-9) — done.**
- `src/views/RecordingsView.vue` now gets all state and actions from `src/components/v3/matches/useFootageLibrary.ts`. Its script is only template helpers (`relativeDate`, display helpers) plus the destructured composable.
- The composable now registers the sign-out/session-expired listeners at creation (setup time), exactly as RecordingsView did, instead of in `onMounted`.
- Old UI checked with the switch off (`uf.uiV3 = '0'`): renders and behaves as before. Screenshot: `scratchpad/rework-shots/library-old.jpg` (v3: `library-v3.jpg`).
- Tests: `useFootageLibrary.test.ts` (8) — game filter + games present, cloud chip, route status chip incl. unknown values, sign-out before mount, in-flight delete confirm (decline = no delete), cloud-backed footage opens the keep-cloud choice, local-only delete after confirm, bulk delete with no selection is a no-op.

**2. Alt-account tags + account filter — not built (data gap, not guessed).**
- `RecordingsStore.getAll(linkedRiot)` (`electron/main/recordings-store.ts`, `matchesLinkedAccount`) only returns Valorant rows whose `riotName#riotTag` (or `timeline.playerName/playerTag`) matches the *selected* Riot account. So the renderer never receives rows from other linked accounts: an ALT tag could never appear and an account filter would have nothing to filter.
- Fix needed (lead / main process, out of my files): let `recordings:list-all` return every linked account's Valorant rows (keep `riotName`/`riotTag` on each row), and expose the active (main) account id to the renderer (the Settings code already loads linked accounts with `is_active` via `useSettings`). Then the row helper is one comparison: row `riotName#riotTag` ≠ active account → "ALT" text tag (`uf-label` style, muted, no pill), plus a `UfTabs` filter All / main / each alt when more than one account is linked.

**3. Game logos — already present.** Each row shows its game's logo next to the map art (`MatchRowV3.vue:35`, `gameLogo()`), so the text-only game filter loses nothing. Added `game-logo.test.ts` (2 tests: every game incl. the `league` alias, unknown → null).

Checks: type-check clean · eslint clean on changed files · matches tests 14/14 · full suite 1429 passed, 9 skipped.

## Round 3 — library & utilities (agent-library2)
Built (all as in-file `v-if="uiV3"` branches; old branches unchanged apart from ClipsView's root class binding and `uploadError && !uiV3`):
- **ClipsView:** v3 header/filters (Group and Sort kept with their labels when wrapping), body, bulk delete, upload error row; v3 toast (teleported, square, hairline); clip player, analysis confirm, trim and upgrade-allowance modals all on `UfDialog`. The player dialog is `persistent` while a nested dialog or title edit is open. No local clips → covered by `src/views/ClipsView.v3-dialogs.test.ts` (compiles; each dialog bound to the old modal's state; `@close` present).
- **CloudStorageView:** capacity sentence + D3 used figure + one bar; uploads on this device; remove-cloud-copy confirm; file rows with retention; filters as UfTabs; playback panel. Only secondary buttons (no red), so no competing primary.
- **StorageAddonPicker:** v3 section, pack stops, one primary "Continue · price/month" (opens Stripe review; nothing is charged in-app). Never triggered during testing.
- **PerformanceView:** v3 status sentence, boost/restore, diagnostics, kill list. On macOS only the "Windows-only" state renders.
- **SplashView:** art, logo, one status line, progress or indeterminate track, version.
- **OverstepView:** header with one primary (enable/disable), mode checkboxes, matches list, video + clickable event timeline.

**Asks for the lead (nav):**
- **Performance:** add a row in Settings › App ("PC performance · Windows") linking to `/performance`. SidebarV3 already highlights Progress for it, which is wrong; better under Settings.
- **Overstep:** only reachable by URL. Suggest a dev-mode or feature-flagged entry in the SidebarV3 Developer section until Overstep ships publicly.
