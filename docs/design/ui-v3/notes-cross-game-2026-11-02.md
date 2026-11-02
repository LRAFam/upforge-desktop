# Cross-game pass — 2026-11-02

Fixes for the shared-screen problems the CS2, Deadlock and League agents left open. Seen on screen with
`gameshot.sh` for all four games (Home, Matches, Progress `/stats`, Practice `/training`, Settings). Read-only:
no settings saved in the live app.

## Fixed

| # | Screen | Was | Now |
|---|---|---|---|
| 1 | Practice | CS2/Deadlock saw the Valorant focus hero, Valorant VOD drills ("Kill Into Instant E") and "Valorant calibration (admin)"; League had its own one-off hide | One rule, `practiceGameScope(game)` in `practice-v3.ts`: focus hero, focus reason on the guided session, "Drills from your matches" and calibration show only for Valorant. Every other game keeps the drill library, daily challenge, quick play and guided session as general aim practice, plus one honest line |
| 1a | Practice copy | — | CS2/Deadlock: "These are general aim drills. Set the trainer to CS2/Deadlock sensitivity in Settings › Trainer …" + "Trainer settings →" link. League keeps its line. Checked first: the trainer converts CS2 and Deadlock (0.022°/count in `upforge-trainer/scripts/MouseSensitivity.gd`) |
| 1b | Settings › Trainer | Game list had no Deadlock, although the trainer supports it and a Deadlock switch sets `trainerMouse.game = 'deadlock'` (the select showed blank) | Deadlock added (v3 + legacy select) |
| 2 | Progress header | Deadlock showed "61 games checked" (Valorant focus checks) | `progressCountLine(checked, analysed, game)` ignores focus checks for any non-Valorant game — one place, replaces the per-game `!== 'lol' && !== 'cs2'` check. Deadlock now "0 analysed matches in this range" |
| 3a | Settings › Account › CS2 | Steam name box empty although the account has "LRAFam" | Box shows this PC's name, else the account's (`cs2SteamNameField`, from `cs2:get-profile`). Not written to local settings unless the player edits it. Root cause: the Account row only sent the name to the API, never saved it on this PC — it now saves both |
| 3b | Settings › Account › CS2 | "…so clips find your kills" (it's demo matching; Steam ID wins once saved); "Link FACEIT username on web" next to a Link FACEIT button | "Finds you in your demos until your Steam ID is saved (that happens the first time a demo matches you). Use your CS2 name." · hint is "FACEIT: x" / "Steam: x" / points to Game accounts |
| 3c | Settings (any tab) | Game blocks (CS2 demo folder, Deadlock diagnostics, game modes) used the Settings copy of `primaryGame` loaded on mount: a title-bar switch while Settings was open kept the old game's blocks, and the next `debouncedSave` (whole object) wrote the old game back | `useSettings` watches the title-bar game and mirrors it (`followSelectedGame`), FACEIT/Deadlock link load on switch; FACEIT + account Steam name now load on mount for every game (the Account pane lists all games). Verified: Settings open on Valorant → switch to CS2 → CS2 modes + demo folder appear |
| 4 | Starting report /cs2 | "Couldn't load your starting report" | Not reproducible now: GET returns `status: none`, generate returns `insufficient` locally (0 CS2 recordings with parsed demos on this PC). Likely a transient GET failure earlier. Fixed what was still wrong: CS2 "not enough" line now says the report reads demos parsed on this PC and needs 3 (`insufficientLine`); the error state says something went wrong; "Try again" can retry a failed generate once per click (`retry`) |

## Still Valorant-only / open (not mine)
- **Title-bar switch overwrites the trainer sensitivity game** (`usePrimaryGame.setPrimaryGame` + main `syncPrimaryGameFromUser` set `trainerMouse.game = game`). A Valorant player who glances at League gets `trainerMouse.game = 'lol'` (no yaw entry → trainer falls back to Valorant 0.07, select shows blank). Suggest: stop coupling them, or only copy shooter games. Lead-owned.
- Practice › Analytics / Leaderboards / Loadouts tabs not checked per game (legacy bodies).
- Practice header stats ("0 day streak · 29 all time") sometimes missing on first paint for CS2 (loading race, not game logic).
- Matches › CS2 Vertigo row "No scoreboard" (API: VOD rows carry no stats — CS2 notes need 1).
- Settings › Recording clip toggles are Valorant/round wording ("1vX rounds you won") with game labels; Deadlock gets its own line. Fine for now.
- Post-game preview fixture is Valorant on every game (dev only). `lib/games.ts` League `shortLabel: 'LoL'`.
- `GameProgress` shows "Your starting report →" for CS2 even with 0 parsed demos — now lands on an honest page.

## Files changed
- `src/components/v3/practice/practice-v3.ts` (+`practiceGameScope`) + test; `src/views/v3/PracticeV3.vue`.
- `src/components/v3/progress/progress-counts.ts` + test; `src/views/v3/ProgressV3.vue` (count line only).
- New `src/components/settings/settings-game.ts` + test; `src/composables/useSettings.ts`; `SettingsAccountLinks.vue`, `SettingsRecordingPane.vue` (Steam name field), `SettingsTrainerPane.vue` (Deadlock option).
- `src/lib/starting-report.ts` (+`insufficientLine`) + test; `src/views/v3/StartingReportV3.vue`; `src/components/v3/starting/useStartingReport.ts` (`retry`).

## Checks
- `npm run type-check` clean · `npx eslint` on all changed files clean · `npx vitest run`: 372 files, 2238 passed, 9 skipped.
- On screen (gameshot): Practice CS2/Deadlock/League/Valorant; Progress all four; Home CS2/Deadlock/League; Matches CS2; Settings Account (CS2 Steam name "LRAFam", Linked) and Recording (CS2 block after an in-place switch; Deadlock diagnostics); starting report CS2.
