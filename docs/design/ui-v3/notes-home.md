# Notes — Home (Coach) v3 · agent-home

## Built
- `src/views/v3/HomeV3.vue` — board 4 layout: hero (last match) → coach sentence (T1) → one red action → recent form → right column (focus, warm-up, recent).
- `src/components/v3/home/HomeFocusPanel.vue` — focus loop column (reuses `createFocusCardState`, `focusHeadline/Subline/Slots`, sync button + message, live `onFocusUpdated`).
- `src/components/v3/home/home-v3.ts` (+ `home-v3.test.ts`, 9 tests) — primary-action choice, hero score, result tone/word, coach line source, full-portrait URL, relative day.
- `src/views/DashboardView.vue` — switch only (`<HomeV3 v-if="uiV3" />`, old markup in `v-else`).

## Data (all real)
- Hero: newest `dashboardAnalyses` item (map splash via `getMapImage`, agent full portrait derived from `getAgentImage`, rounds won–lost, K/D/A, HS%, ACS via `displayAcs`). Non-Valorant games use the bundled game card art.
- Coach sentence: latest focus-loop note (`report.notes.headline` + `next_action`) → else `lastInsight.text` → else an honest setup message.
- One red action: open last match → else set up recording (OBS off) → else check my matches (Valorant).
- Recent form: `lastFivePerf` (W/L squares + won–lost, avg ACS, HS%, coach score). Empty state: three "what happens next" steps (no numbers).
- Right column: focus (Valorant only), last drill (`trainerLastSession`, `trainerSessionCount`) + link to Practice, recent 4 analyses (click opens the analysis).
- Kept: `DashboardBanners` (payment/warnings), `DashboardDevTools` (dev), recordings-needing-action row → Matches.

## Gaps (need data, not built)
- No per-round data on Home → the board's rounds line and "What decided it" stats (died first, retakes, zero-damage buys) are replaced by real recent-form stats. Needs the match-report facts (focus loop `report.facts`) exposed to the renderer for the last match.
- Focus loop is Valorant only; other games show warm-up and recent only.
- `DashboardBanners` still uses the old styling (shared component, not v3).

## Checks
- type-check clean · eslint clean on my files · `vitest src/components/v3/home src/components/dashboard` 15/15.
- Full `npm test`: 1369 passed; 1 file failing is `src/components/v3/progress/RankJourney.test.ts` (agent-progress, in progress — not Home).
- Screenshots: scratchpad/rework-shots/home-v3.jpg, home-v3b.jpg (empty account state: no analysed matches).

## Fixes from review (P2 #6, #8) — fixer B
- **Missed focus game** (`HomeFocusPanel.vue`): the miss segment is now `var(--uf-loss)` (loss data). Red stays only on the focus label/progress.
- **Live pipeline status** (`HomeLiveStatus.vue` + `liveStatus()` in `home-v3.ts`, tested): one quiet `uf-t4` line with a `uf-live` dot at the top of the main column, shown **only** while something is happening, using the same state the old Live ops panel used (`status.recording/recordingStarting/waitingForMatch`, `recordingElapsed`, `recUploadProgress`, `inFlightUploadCount`, `inFlightAnalysisCount`, single-analysis `analysisProgress`). Recording → "Stop recording →" (`stopRecording`); upload/analysis → "Follow in Matches →" (/recordings); waiting/starting → no link. Idle → nothing.
- **Weekly**: "N analysed this week" under Recent (`analysedThisWeek()`, last 7 days, tested). The old "of 6 sessions" target was dropped: it was a fixed number, not a goal the player set. When the existing weekly plan exists (`weeklyFocus`, Valorant), Warm-up shows "This week: <drill>" + goal + "Run it →" (same `trainer.launch` call as the old right rail; falls back to /training).

## Where every old dashboard action lives in v3
| Old dashboard action | v3 location |
|---|---|
| Set up recording / Open Matches (first review) | Home primary button (`Set up recording`) · `All matches` secondary |
| Connect OBS / Launch OBS (Live ops) | Shell OBS banner (App.vue) on every screen |
| Stop recording (Live ops) | Home status line "Stop recording →" while recording |
| Upload / analyse / save / remove / watch / timeline / demo picker / Steam check (Action queue) | Home "N recordings waiting for you" → Matches, where every per-recording action lives |
| Open analysis / match cards / history | Home hero primary ("Open last match") · Recent list rows · Matches |
| Train this / run drill (Coach hero) | Home "Train this →" link · Warm-up "Open practice →" |
| Weekly drill "Run" / "Edit" (Right rail) | Warm-up "Run it →" · "Open practice →" |
| Focus card sync / check latest matches | Focus panel (right column) |
| Link game accounts (Game cards) | Settings › Accounts |
| Rank/stats summary, "View all analytics" | Progress (sidebar) |
| More on the web links (Right rail) | Not on Home in v3 (still in the old UI); candidate for Settings or a footer — lead to decide |
| Activity feed: open entry / copy log | Not on Home in v3: entries point to Matches items; "copy log" is a support/debug tool — lead to decide (Settings › Advanced or Dev tools) |
| Dev tools (simulate etc.) | Still on Home (DashboardDevTools, dev only) |

## Round 2 — round facts (agent-facts)
- **Source:** `deriveRoundFacts(match_data)` in `src/lib/focus.ts` reads the Riot match the PC already uploads to POST /api/match-report: `roundSummaries[].winningTeam` against `finalStats.team` (ALLY/ENEMY also accepted), and `playerWasFirstBlood`, which is the same field the AI service turns into `first_death_rounds`. The final score is used only if it matches the counted rounds. Unclear shapes return null.
- **Carried:** on the existing focus update (`FocusUpdate.rounds`). No new endpoint or IPC channel. Saved in the existing focus-sync state; `sanitizeRoundFacts` rejects tampered or oversized data on read, with a 40-round cap.
- **Home:** the "Rounds · Map · 9–13" line (won teal, lost dim, a red tick where you died first, plus a legend) sits after the actions. "What decided it" shows only `decidedStats`: rounds won after you died first, and rounds won when you didn't. The whole section is hidden when there are no facts. It's Valorant only, because it arrives through the focus loop.
- **The match can differ from the hero:** the rounds belong to the last synced Riot match, which may not be the last analysed recording shown in the hero, so the label names the map and score.
- **Tests:** real Bind shape gives 9–13, 8 first deaths and 1 of them won (decided "1/8", "8/14"); a sync test carries the round facts through; a persistence test drops tampered data. Nothing to show locally: no synced match on this Mac.
