# OBS recover match-detect resume

Date: 2026-07-26

## Problem

OBS WebSocket can come back while a game is still tracked as active. `game-started` does not re-fire, so match wait / recording never runs. UI shows Connected; activity log stays quiet.

Separately, after OBS crash UpForge's kill→relaunch loop never reconnects: spawn without `cwd=bin/64bit` leaves OBS unable to load plugins/locale, so port 4455 never opens (`ECONNREFUSED` for hours).

## Fix

1. On OBS newly connected: if `currentGame()` is set, not waiting, not recording, and no `game-started` handler in flight → emit `game-started` again (deferred via `setImmediate`). Skip when match ownership / disconnect-during-recording (reclaim owns that path).
2. On start failure when OBS is unavailable: do not wait for post-game menus; keep active game and wait for OBS connect to resume.
3. Guard `logActivity` IPC against destroyed `BrowserWindow`.
4. Launch OBS with `cwd` = exe directory; `cmd start /d` fallback; longer post-launch WebSocket retries; 90s kill cooldown.

## Guard

`shouldResumeMatchDetectionOnObsConnect` in `obs-match-resume.ts` (unit tested).
`obsExecutableWorkingDirectory` / `buildObsCmdStartArgs` in `obs-launch-cwd.ts`.
