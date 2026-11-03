# CS2: one match saved as many recordings + in-game lag (2026-11-03)

Worktree `upforge-wt/cs2-match-split`, branch `fix/cs2-match-split` (from origin/main = v3.2.5). Not committed.

## Report
Owner (Windows, v3.2.5): "CS2 keeps saving individual matches before they finish as many matches", and "a stupid amount of lag when playing CS2".

## Evidence
- Forwarded logs (`main-cs2.log`, `main.log`, `*.old.log`) are from **3.2.2** (`Update for version 3.2.2 is not available` at 16:02, 3 Nov). They hold one CS2 match: Nuke, `Match ended (gsi)` after 8m47s, `HandleMatchEnd ... kills=0`. That log does not show the split itself. The CS2 end logic below has not changed since then.
- Code: `isGsiMatchEnded()` (steam-gsi-server.ts) returned true on `player.activity === 'menu'`. 3.2.5's own capture code says this is wrong: `classifyGsiBody` "ignore[s] player.activity === 'menu' — that is also the in-match Esc menu". It also ended at once on any main-menu POST (crash / disconnect / reconnect).
- After every end, `finishActiveMatch` → `rearmGameDetection(game)` (no `waitForMatchEnd`) → `game-started` → wait loop → `isGsiMatchLive()` is still true → **a new recording starts straight away**. So every Esc press makes a new file.
- Repro `electron/main/cs2-match-split.test.ts` (one 24-round match through `ingestGsiBody` with the index.ts loop timings) on the old logic: **12 recordings for 1 match**. Two back-to-back matches gave 24.

## Root causes
1. Esc menu (`player.activity: menu`) counted as match end. Dead players often open it while spectating.
2. Leaving the map for a moment (crash/reconnect) ended the match with no grace.
3. The instant re-arm turned each false end into a new recording (OBS stop/start + post-match pipeline mid-match, which also causes stutter).

## Fix (steam-gsi-server.ts)
- `ingestGsiBody(body, at)`: one entry point for each POST, parsed once. The capture now reuses the parsed body.
- Lifecycle state: `sawLiveMatch`, `liveMapName`, `leftServerAt`, `sawGameover`, `switchedMap` (cleared by `resetSteamGsiSession`).
- `gsiMatchEndReason()` → `gameover` | `map-changed` | `left-server` (no map for `CS2_LEFT_SERVER_GRACE_MS` = 90 s), else null. Never on activity menu/textinput, death/spectating, halftime (`intermission`), round `over`, or GSI gaps. Closing CS2 is still handled by the process watcher. A reconnect inside 90 s keeps the same recording (the merge guard).
- `isGsiMatchLive`: an unknown map phase on a real map (e.g. a timeout) counts as live. `round.phase: over` counts as live when map.phase is missing.
- index.ts logs `Match ended (gsi:<reason>)`.

Trade-off: if you really leave mid-match without gameover, the recording runs 90 s longer.

## Lag
- Flood test `steam-gsi-flood.test.ts`: 1,150 full-component POSTs (10.3 KB each, 10 allplayers, grenades), 20/s, capture armed. Result: **~0.1 ms per POST** before and after the change (Mac). GSI handling on the UpForge side is not the lag. The test sets a budget of < 1 ms per POST and **zero sync fs calls per POST**.
- Fixed: capture did one `fs.writeSync` per POST. It now batches lines (every 2 s or 1 MB) with async `appendFile` and flushes at finish. `flushed()` was added.
- Full diagnostics cfg: `throttle 0.1 / buffer 0.0` (≤10 POST/s of all-player JSON built inside CS2) changed to `throttle 0.2 / buffer 0.1`. The normal cfg is unchanged, so normal users are not asked to restart CS2.
- Split churn (cause 3) is gone with the fix.
- Not fixed (outside this task), from the 3.2.2 logs:
  - During a Valorant match (3 Nov 00:04–00:20), `[MainLag]` ~1 s blocks came every ~40 s. They lined up with `Orphan metadata recovery missing` every ~9 s. That message is no longer in the code, so it is probably already fixed.
  - `recordings.json` is **76 MB** (timelines 40 MB, `matchDetails` 26 MB). `RecordingsStore.persist()` runs a sync pretty `JSON.stringify` plus `writeFileSync`, which is likely ~1 s+ per save. `recordings:get` was called 36×/min and returns full timelines over IPC. Recommend: drop the pretty-print, write async, and strip `timeline.matchDetails` from `recordings:get`.
  - CS2 Valve demo GC fetch retried every ~5 s while CS2 was open after the match. It is gated by `shouldDeferHeavyBackgroundWork`, so it should not run mid-match.

## Verify
- `npx vitest run electron/main/cs2-match-split.test.ts`: 4 tests. Failed on the old logic (12 and 24 recordings), pass now.
- `npm run type-check`: clean. `npx eslint` on the changed files: clean.
- `npx vitest run`: 403 files, 2440 tests passed.

## Update — 3.2.5 logs (main-325.log, 19:22–19:42 on 3 Nov)

### What the log shows
- After each GSI end (19:22:27, 19:27:44, 19:30:06, 19:32:38, 19:33:07), there are "Match detected" lines alternating with "Match ended (gsi) … (unknown duration)" / "Recording too short", about every 8 s.
- Real recordings: 4m48s, 1m15s, 1m29s, 4 s, and the final 8m45s (ended 19:42:26).

### The `app` / `cs2` tags
- These are **not two separate detectors**. The tag is `gameDetector.currentGame()`.
- `rearmGameDetection` called `resetActiveGame('cs2')`, so lines logged during that window are tagged `app`.
- The reset also made the detector's next process poll emit its own `game-started`. With rearm's own emit, that gave **two match flows**.

### Root causes
1. **Esc / menu counted as match end** (from the first part).
2. **Re-arm double-emit.** Fixed with the new `GameDetector.rearmWatch()`, which keeps CS2 active and emits once; the rearm wait now uses `reviveActiveGame`.
3. **Leaked GSI end-pollers.** Each flow ran `gsiPollTimer = setInterval(...)` without clearing the previous one. The leaked poller stopped the next recording within 0.4 s of its start ("unknown duration"). Fixed: the old poller is cleared in `beginMatchFlow`, and each poller clears itself when its flow is stale.

### Does the fix explain every line?
- With (1), `sawLiveMatch` plus `activity=menu` no longer ends the match.
- With (2) and (3), the alternating starts/stops cannot happen.
- That leaves one recording, 19:22:55 → gameover.
- Caveat: the logs don't say which GSI condition caused each early end. 3.2.6 logs `gsi:<reason>`.

### [MainLag] in that window
- Blocks of 1.1–3.4 s land on the churn moments: 19:28:18, 19:30:34, 19:30:55, 19:33:38, and after the match 19:42:38 / 19:42:49.
- Each start/stop cycle adds or removes a row, or the dashboard reloads. Both mean a full sync re-serialise of the 73.7 MB `recordings.json`.
- The log cannot name the function behind each block, so this is correlation. The fixture numbers below show the cost.

## Recordings store split
- New `recordings-store-files.ts`.
  - `recordings.json` becomes a small index (rows plus `hasTimeline` and a `timelineSummary`).
  - Each timeline is stored in `timelines/<id>.json`.
  - One debounced async writer per catalogue (250 ms), temp file + rename.
  - Timelines load in the background after start.
  - `rec.timeline` is a getter (sync file read only as a fallback, counted).
- Migration:
  - Timeline files are written and size-verified, then a backup `recordings.json.bak-pre-split` is kept, then the index is rewritten.
  - A crash before the index rewrite simply migrates again on the next start.
  - The getter falls back to the backup if a timeline file is missing.
- Sync writes remain only in two places: `claimGuest` (login, must be durable before the guest catalogue is cleared) and app quit (`flushAllCataloguesSync` in before-quit).
- IPC:
  - `recordings:get` and `recordings:list-all` return rows with `timeline` = the summary (finalStats, finalScore, agent, puuid, playerName/Tag, roundSummaries, teamSnapshot; other arrays trimmed to one item; matchDetails / events / spatialSummary dropped).
  - Heavy views already use `recordings:get-timeline` (useVodReview, comparison picker), so no renderer change is needed.
- `registeredLocalRecordingPaths` also counts unsaved in-memory rows, so orphan scans never re-import them.
- No LRU: readiness checks read every pending row's timeline on each list call. With an LRU those would become disk reads. Memory use is the same as before.

### Fixture: 50 recordings × 1.59 MB timelines (Mac, vitest)

| | before | after |
|---|---|---|
| sync time per catalogue write (`setPipelineStatus`) | 424 ms | 0 ms (scheduled); async flush 0.6 ms (index only) |
| list call (`getPending` rows + structured clone) | 744 ms, 79 MB | 0.9 ms, 0.06 MB |
| index size on disk | 159.5 MB (pretty) | 0.06 MB |
| cold start (sync) | 379 ms | 1.3 ms, plus 294 ms background load (one file per tick) |

Bench script: scratchpad `store-bench.test.ts.txt`. It is not in the repo.

### Tests
- `recordings-store-split.test.ts` (7 tests):
  - migration shrinks the index, timelines stay intact, the backup is kept, and it is idempotent
  - an interrupted migration recovers
  - backup fallback works when a timeline file is missing
  - no sync writes during mutations
  - listing / filters / dedupe load no timelines
  - removing a recording deletes its timeline file
  - list row is ≤ 2 % of the full timeline
- `cs2-match-split.test.ts`, 2 new tests:
  - re-arm plus detector poll gives one `game-started`
  - the old pattern gives two
- Verify: `npm run type-check` clean, eslint clean on changed files, `npx vitest run` 404 files / 2449 tests pass.
