# notes — games (agent-games, round 3)

**User decision:** bring the orphaned CS2 / Deadlock / League panels back in v3 where logical.

## Built (`src/components/v3/games/`)
- `game-data.ts`: pure shaping. Readiness checks mirror the old CS2SetupPanel, Cs2ValveStatsPanel, DeadlockStatsPanel, DeadlockDemoPanel and LolStatsPanel. `deadlockRankSeries` turns `mmr_history` (newest first, no dates) into an oldest-to-newest line.
- `useGameData.ts`: loads per game through the existing IPC (`cs2.getProfile`, `getFaceitConnection`, `listDemos`; `deadlock.getStats`, `listReplays`; `profile.get`, `lol.getRecentMatches`, `getAnalyses`). It ignores stale responses, refreshes on `dashboard:refresh`, refreshes Deadlock every 3 minutes like the old panel, and tracks Deadlock upload progress.
- `GameSetup.vue`: says what's missing in one sentence, then 3 numbered steps and one primary action. CS2 and Deadlock add the note that coaching unlocks only once a demo or replay and its rich stats exist. This respects the desktop↔API contract: Analyse stays locked.
- `GameHomeSummary.vue`, `GameFiles.vue` (demos / replays on this PC) and `GameMark.vue` (logo + label).
- `GameProgress.vue`: per-game Progress, showing CS2 Valve and FACEIT data, Deadlock stats with a rank line, and League's Riot ID, matches, champion win rates and Riot reports. Each has an honest empty state.

## Wiring
- **HomeV3:** non-Valorant games show the setup section until the game is ready, then the summary and files.
- **ProgressV3:** for `demoGame`, renders GameProgress.
- **StatsView (switch only):** the `performanceStats` redirect to /dashboard now applies only when `!uiV3`. Without this, /stats bounced to Home for CS2, Deadlock and League.
- **Lead (already done):** v3 allows /stats and /squad for every game.

## Checked
- type-check clean; eslint clean on the games files, HomeV3, ProgressV3 and StatsView; full suite 1,496 passed, 9 skipped.
- Screenshots, taken by switching games in the title bar; Valorant was restored after:
  - CS2: Home setup steps + "Set Steam name", Progress empty state.
  - Deadlock: "Link Steam".
  - League: linked, so it shows the Riot ID and empty matches, champions and reports.
- The first League load can take a few seconds (cold Riot fetch) and shows "Loading your League stats…" meanwhile.

## Gaps
- League rank isn't synced to UpForge, so there's no League rank line; the screen says so.
- Deadlock `mmr_history` has no dates, so its rank line is indexed by update, not by time.
- None of the stats states were seen with real data: this account has no CS2 profile, no Deadlock link and 0 League matches. They are covered by the game-data tests.
