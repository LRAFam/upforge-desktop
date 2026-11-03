# CS2 Wingman post-match lag (3 Nov 2026)

Branch `fix/cs2-post-match` (from origin/main = v3.2.3), worktree `upforge-wt/cs2-post-match`. Not committed.
The user's PC was running **3.2.2** during the match (the updater downloaded 3.2.3 at 16:14).

## Evidence (main-cs2.log, recordings-cs2.json)
- 16:03:53 `[RecordingDecision] gameMode: 'WINGMAN'` → GSI detection worked (`map.mode = scrimcomp2v2`).
- 16:12:49 `Match ended (gsi)`; `HandleMatchEnd … kills=0`; `[ClipExtract] 0 clips … timeline=false`.
- recordings.json row c0999146: `gameMode: 'COMPETITIVE'`, `timeline: null`, map de_nuke.
- 16:13:00 → 16:14:24: `GC fetch failed: Close CS2…` every ~5.5 s (CS2 still open).
- 16:14:30 → end of log (16:18:37): Steam's `boiler` helper spawned every ~7 s, each ending
  `Steam has not returned one unambiguous demo` (34 times in 4 min). `[MainLag] recordings:get called 36 times in 61 s`
  and 1–3 s main-thread stalls.

## Root causes
1. **Endless demo retry** (`cs2-demo-retrieval.ts`): every failure, including Steam's "not listed" answer, was retried
   on the 5 s poll (10 s after 5 min, … up to 35 min of retry time). Each retry spawned boiler and opened a GC session.
2. **Reload storm**: each attempt sent 3–5 `recordings:updated` (setStatus 'syncing' ×2, failure, `finally`, tick `changed`).
   Each one makes Home, coaching list, footage library and settings reload the full list.
3. **Mode lost** (`index.ts` handleMatchEnd): the GSI mode lived in a local variable of the detection loop. At match end,
   `resolveGameMode('cs2', { timelineMode: null })` fell back to the `COMPETITIVE` default. The demo parser also
   overwrote the mode with `opts.gameMode ?? 'COMPETITIVE'`, because no caller passed it.
4. **Empty events timeline**: CS2 has no live client, and the local demo finder is off for CS2, so there were no events
   until a Steam demo arrived. GSI only subscribed to provider/map/round/player_id, so it had no kill data.
5. **Latent main-thread block**: `demoparser2` is synchronous native code with about 10 full-file passes per demo, and it
   ran on the main thread. It didn't fire in this match because there was no demo, but it would freeze the app for
   seconds on any parsed demo.

## Fixes
- `cs2-valve-demo-downloader.ts`: typed failure codes (`cs2_running`, `steam_offline`, `no_match`, `gc_failed`…).
  It also logs a log-safe candidate summary when nothing matches (`[CS2ValveDemo] No single match for session gsiMap=… [+3m Unknown…]`).
- `cs2-demo-retrieval.ts`: retry policy `cs2DemoRetryDecision`.
  - `no_match`: retry at +2, +5 and +10 min, then stop with `needsManual` and the message "download in CS2 (Watch → Your Matches) and attach the .dem".
  - CS2 open or Steam offline: wait 60 s without spawning boiler and without spending the budget.
  - Other failures: back off 1 → 5 min.
  - The renderer is told only when the visible status changes.
- `index.ts`:
  - `setStatus` no longer pushes transient "checking…" steps or unchanged messages, and the per-attempt `finally` notify is removed.
  - `currentMatchGameMode` is kept from match start through match end; CS2 prefers it.
  - The mode is passed into the demo parse (also in `recording-demo-attach.ts`).
- `cs2-gsi-timeline.ts` (new) + `steam-gsi-server.ts`:
  - The GSI cfg now also requests `player_state`, `player_match_stats` and `map_round_wins`. This needs one CS2 restart, and the existing "restart CS2 once" hint covers it.
  - The tracker records your kills, your deaths (when health hits 0 or GSI switches to spectating), round results and the score.
  - These are stored on `timeline.cs2Live`, never in `killEvents`/`finalStats`, so Analyse stays locked (API contract).
  - The VOD gets them through `timelineKillsForVod`/`DeathsForVod`, review `roundSummaries`/`finalStats` and `finalScore` (row score).
  - Timing is about ±1 s. A death seen only in match_stats gets no marker, because it would be wrongly timed.
- Match page: the attach-demo panel stays up for GSI-only timelines (`cs2LiveOnly`) and says the markers come from live data.
- `src/lib/game-queue.ts` (new): `queueTypeFor`, `countsTowardProgress`, `modeQueueLabel`.
  - Ranked: CS2 Premier/Competitive, Valorant Competitive/Premier.
  - Not counted: Wingman, Casual, DM, Arms Race, custom; Swiftplay, Unrated, TDM, Spike Rush…
  - Unknown modes still count.
  - The row and match header show "Wingman · 2v2", "Premier · Ranked" or "Deathmatch · Unranked". Wingman has its own in-game rank, so it is not labelled "Unranked".
- Progress (`StatsView.vue` → `ProgressV3.vue`) and Home recent form leave out fun modes. Progress shows "N fun-mode matches not counted".
- `normalizeCs2GameMode`: adds `gungameprogressive`, `armsrace` → ARMS_RACE, `gungametrbomb`, `retakes`, `skirmish`, `custom`, `training`.
- Demo parse worker (forked agent): `cs2-demo-parse-worker.ts` (worker_threads, imports only demoparser2).
  - It is loaded via electron-vite `?modulePath`, has a 120 s timeout and is backed by a cached `Cs2DemoSource`.
  - Not verified in a packaged Windows build.

## Wingman demos via Steam GC
- boiler-writter asks the GC for the account's recent matches.
- Wingman matches are probably in that list: the GC `game_type` decoding we copied from CS Demo Manager has an explicit Wingman (mode 10) branch.
- I found no official confirmation. Leetify auto-imports only 5v5 and asks for manual upload of Wingman.
- Most likely cause of `no_match` here: CS2 Wingman maps have no entry in our map-id table, so they decode to `Unknown`. The picker then rejected the match because `de_nuke` ≠ `Unknown`.
- Change: a single in-window match with an `Unknown` map is now accepted. The new candidate log line will confirm this on the next Wingman match.
- After three spaced checks the UI asks for the manual attach instead of retrying forever.

## API / AI follow-ups (not done here)
- API: exclude unranked `game_mode` values from UpForge score baselines and percentiles, focus checks/history, and Progress/aggregate stats (`wingman`, `casual`, `deathmatch`, `arms_race`, `custom`; Valorant `swiftplay`, `classic`/unrated, `teamdeathmatch`, `spikerush`…). Score Wingman against Wingman only, if at all.
- API: older CS2 rows were all saved `competitive`, so a Wingman match uploaded before this fix is mislabelled. Wingman is 2v2, MR16 (first to 9), so it can be spotted by rounds and player count in match_data.
- AI: coaching prompts should know Wingman is 2v2 (different economy and utility), not compare it to 5v5 norms.

## Verify with the next log
- `grep "\[CS2ValveDemo\]"`: at most about 4 boiler lookups per match, then `needsManual`. Expect no repeating `GC fetch failed` faster than once a minute.
- `grep "\[CS2Live\]"`: kill, death and round counts at match end. If it says "no GSI events", CS2 was not restarted after the cfg change.
- `grep "No single match for session"`: shows what the GC listed for the Wingman match.
- `grep "\[MainLag\] recordings:get"`: should be gone after a CS2 match.
- Note: last night's Valorant log also shows `Orphan metadata recovery missing: history_timing_missing` every ~8 s with 1–2 s MainLag (23:56 → 00:03), which looks like a separate Valorant loop.
