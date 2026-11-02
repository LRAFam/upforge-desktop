# Post-match freeze + missed first Swiftplay (2 Nov 2026)

Branch `fix/post-match-freeze` (from origin/main = v3.2.1), worktree `upforge-wt/post-match-freeze`. Not committed.

## Evidence (user main.log, Windows, v3.2.1)
- 21:19:07 match end → 21:19:12 post-game `pending` (autoAnalyse off) → 21:19:24 `[ClipExtract] kills=8`.
- 21:19:24 → 21:22:29: **no log lines at all**. Two independent timers stopped: DiscordRPC retry (every 30 s, last 21:19:01, next 21:22:37) and `Still waiting for match` (every 60 s; 61 s/121 s ticks missing, next is `199s`). → the **main process event loop was blocked ~3 min**. A blocked main process freezes every window (no clicks, no IPC replies).
- Every earlier match on 1–2 Nov also ended in post-game `pending` and was followed by 77–205 s of silence. The silences got longer as the library grew, not with kill count (8 kills → 205 s). That fits per-recording work, not per-clip work.
- Clip ffmpeg (2 threads, BelowNormal priority, async spawn) and timer-sync decode (measured 14 ms for 160 frames) are not main-thread blockers.

## Root cause (code)
A feedback loop between `recordings:get` and `recordings:updated`:
1. `handleMatchEnd` called `clearVodProbeCache()` (index.ts, "Close any existing post-game window"). That wiped the probe cache for every recording.
2. `recordings:get` started a new background loop over every row each time it was called. Each loop sent `recordings:updated` when a row changed (finalizing → ready).
3. Each `recordings:updated` made Home (`useDashboard.ts:1668`, no throttle), the coaching list (`useCoachingHistory.ts:157`) and post-game pending (`PostGameView.vue` → `refreshPendingReadiness`) call `recordings:get` again. That started more loops, which sent more events.
4. Each call also did sync work on the main thread: `healMissingPaths` and `existsSync` per row, an orphan scan that reads the media catalogue JSON, and a structured clone of every row including its full `timeline`.

A model of steps 2–3 (scratchpad `freeze/sim.mjs`) produced 121 events with 5 rows, 29k with 10, and 2.4M with 20 before running out of memory.

## Fixes
- `vod-probe-sweep.ts`: one probe sweep at a time. Calls made while it runs queue a single follow-up sweep.
- `notifyRecordingsUpdated()` (index.ts): coalesces all 55 `recordings:updated` sends to at most one per 400 ms.
- Removed `clearVodProbeCache()` at match end. The cache is keyed by path + mtime, so it is never stale.
- `src/lib/single-flight.ts`: applied to the three renderer reloads above.
- `main-loop-lag.ts`: logs `[MainLag] main process was blocked for ~N ms` and `[MainLag] recordings:get called N times in 60 s`.
- Duplicate `Capture retargeted` pairs: startup and game detection both ran `ensureObsCaptureForGame`, giving two 12-attempt loops. Now single-flight per game. This was bounded (~36 s), not a leaked interval.

## First Swiftplay not recorded
- 20:48:12: Range (SHOOTING_RANGE) skipped. `watchUntilMenus` then waited for INGAME → MENUS.
- The player queued from inside the Range: INGAME → PREGAME → INGAME (Swiftplay). PREGAME was ignored, and MENUS only came when Swiftplay ended (21:04:43, `Watching for next match...`). So the whole match was missed.
- Fix (`menu-watch.ts`): 2 consecutive PREGAME polls after INGAME end the wait. Tests cover this case.

## Confirm with the next log
- `grep "\[MainLag\]"`: should be absent or short after a match. If long stalls remain, check `recordings:get called` counts.
- `grep "Skipped match — waiting for menus or the next agent select"`, then `Watching for next match...` before the next `Match detected`.

## Side finding (not fixed)
- `[TimerSync]` never appears in either log, although round-timer sync shipped in 3.1.1. `alignValorantTimelineByRoundTimer` is returning early without logging: either `manualSyncNudgeMs` ≠ 0 or there are fewer than 2 observed round starts. Needs a log line on the early returns.
- `sha256File` of the full VOD is awaited in `handleMatchEnd` for telemetry only. It is streaming and does not block, but it delays post-game by a few seconds on large files.
