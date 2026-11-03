# CS2 clip timing — 2026-11-03

Branch `fix/cs2-clip-timing` (worktree `upforge-wt/cs2-clip-timing`, from `origin/main` = v3.2.6). Not committed.

## Bug
Owner (Windows, v3.2.6, de_dust2 Competitive 21:50 → 22:25): the late-extracted "4K clip — Round 19"
is ~1 min long but shows only the first kill and stops before the other three.

## Evidence (owner logs in scratchpad/pclogs)
- `main-326.log`: GSI "Match detected" 21:50:20.572; OBS recording started 21:50:29.206
  (`captureRecordingStartTime` 1793742629206); `gsi:gameover` 22:25:10.389; demo parsed 22:28:55
  (`Demo anchor tick=65`, 21 rounds, 24 kills). No `playback_time` in the CS2 header → 64 tick (correct).
- `recordings-326.json` (index summary): last demo round end = 2072.8 s after the demo anchor.
  GSI gameover = 2089.8 s after "Match detected". Gameover fires at the last round end, so demo
  time zero is ~17 s **after** `matchStartTime`.
- `recordings-325.json` (3.2.5, de_nuke 19:11): last round end 1825.6 s vs gameover 1860.3 s → ~35 s.
- Offsets are a constant per match (not tick drift): 64 tick checked; the error equals the warmup
  remainder at detection.

## Root cause
- `steam-gsi-server.ts` `isGsiMatchLive()` treats `map.phase = warmup` as live, so CS2 detection
  (`index.ts`, `matchStartTime = Date.now()`) happens during warmup.
- The demo parser measures time from the first `round_start` (end of warmup).
- `gameTimeToVideoOffsetMs` assumed both are the same moment:
  `video = demoMs − (recordingStart − matchStart)`. Every CS2 demo event (kills, deaths, plants,
  clips, VOD markers) was placed (warmup remainder) seconds too early — 17 s / 35 s in these matches.
- A multi-kill window `[first − 8 s, last + 10 s]` cut 17–35 s early ends before the later kills.
- Also: when OBS starts before round one, the `Math.max(0, lag)` clamp cannot represent it.

## Fix
1. `cs2-gsi-timeline.ts`: the live GSI tracker now also records each round end it sees
   (`round.phase → over`) as a recording position (`Cs2LiveSummary.roundEnds`).
2. `cs2-demo-video-sync.ts` (new): pairs GSI live points (your kills, your deaths, round ends;
   wall clock − recording start, ~0.1–0.6 s GSI lag) with the same kind of demo event and takes the
   shift most points agree on (±1.5 s; ≥3 points and ≥40 % of live points). Round numbers are not
   trusted. `video = demoMs + shiftMs`.
3. `cs2-demo-parser.ts`: when `opts.cs2Live` is given, keeps it on the demo timeline and stores
   `timeline.cs2DemoVideoShiftMs`; logs `[CS2DemoSync] demo→video shift … (match-start estimate …, diff …)`.
4. `riot-local-api.ts` `gameTimeToEventVideoOffsetMs`: CS2 uses `cs2DemoVideoShiftMs` when set
   (manual sync nudge still added). Otherwise the old match-start estimate.
5. `index.ts` (Valve demo sync) and `recording-demo-attach.ts` (manual attach) pass the recording's
   `cs2Live` into `buildTimelineFromDemo`.
6. `clip-timing.ts` `combinedKillClipWindow` (used by both multi-kill/ace paths in `clip-pipeline.ts`):
   window is now first − pre → last + post (old code measured the duration from the first kill, so
   the real post-roll was only 10 s), and the 120 s cap never cuts off the last kill.

Fallback: recordings without GSI live data (GSI cfg not loaded, or made before this fix and already
replaced by the demo timeline — e.g. the owner's existing Dust2 recording lost `cs2Live` when 3.2.6
stored the demo timeline) keep the old estimate. Re-attaching the demo will not fix those.

## Related fixes from the same log
- Stale Valve lookups for old Nuke sessions (22:28:57, 22:28:59, 22:30:59…): `no_match` was retried
  2/5/10 min every app session. Now if Steam already lists a match after this session's window
  (`valveListHasMovedPast`), the code is `not_listed` → stop at once and ask for a manual attach.
  Resume (`resumeStuckMatchStatsEnrichment`) skips recordings that already stopped for manual this session.
- "Match cancelled — CS2 process closed before a live match" (22:28:02) was just closing CS2 from
  the menus while the app waited for the next match. Activity text is now "CS2 closed — stopped
  waiting for a match".

## Tests
- `electron/main/cs2-clip-timing.test.ts`: 64-tick Dust2 fixture, 30 s warmup after detection,
  recording 8.6 s after detection, 4K at 12/19/31/44 s after freeze end, GSI live summary with
  300 ms lag. Asserts every kill sits ≥5 s after clip start and ≥10 s before clip end, each demo kill
  within 1 s of truth. Fails on old code (`expected 177366 to be ≤ 168366`), passes now.
- `cs2-gsi-timeline.test.ts` (round ends), `cs2-demo-retrieval.test.ts` (`not_listed`),
  `cs2-valve-match.test.ts` (`valveListHasMovedPast`), `match-wait-guard.test.ts` (close text).
- `npm run type-check` clean · eslint on changed files clean · full `npx vitest run`: 405 files,
  2462 passed, 10 skipped.

## Not done / follow-ups
- Not verified on a real recording yet: next CS2 match, check `[CS2DemoSync]` log line (diff should
  be +15…40 s) and that the multi-kill clip shows all kills.
- Matches without GSI still use the warmup-skewed estimate. Possible extra fallback: time the GSI
  warmup→live transition, or the gameover vs. last demo round end.
- `roundSummaries.ceremony` shows "timer" for most Dust2 rounds — CS2 `round_end` reason mapping
  looks off (not investigated).

## Why the Dust2 recording lost its GSI data (cause c: overwritten by demo sync)
- Saved: 22:25:13 `[CS2Live] kills=24 deaths=16 rounds=21` → `timeline.cs2Live` set at match end and
  written to `timelines/<id>.json` (22:25:23 "Recording saved"). The index row never shows it:
  `LIST_DROP_KEYS` drops `cs2Live` from summaries by design.
- Not the migration: the split writer stores the whole timeline object (`JSON.stringify(value)`);
  new test proves `cs2Live` survives migration (passes on old code too).
- Lost: 22:28:55 demo sync → `recordingsStore.updateTimeline(id, parsed.timeline)` replaced the
  whole timeline with the demo one, which had no `cs2Live`.
- Fix: `RecordingsStore.updateTimeline` carries the previous `cs2Live` onto a CS2 timeline that lacks
  it (covers every replace path); parser also carries it when passed. Test fails on old code.
- Recoverable? No. The timeline file was overwritten atomically; `recordings.json.bak-pre-split`
  was made when 3.2.6 first split the catalogue, before this 21:50 match. The log has only totals,
  no event times.
