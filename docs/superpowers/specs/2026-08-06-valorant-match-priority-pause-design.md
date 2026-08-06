# Valorant consecutive-match priority + activity log clarity

**Date:** 2026-08-06  
**Service:** `upforge-desktop`  
**Status:** Implemented (2026-08-06)

## Problem

After match 1, upload/analysis can still run when match 2 is detected in the same Valorant client. Pause is gated on `isActivelyRecording()`, which is false until OBS starts, so:

1. Match 1 upload keeps going
2. Match 2 OBS start can fail (VOD lost)
3. Upload stalls (`upload_stalled`)
4. Auto-analyse off still shows “Uploading match” OS notification
5. Activity log does not explain pause / wait-for-stats / resume

## Intended step order

1. Match ends → save local VOD → calm pending modal
2. Fetch Riot stats (no S3 / no analysis until ready)
3. Auto-analyse on + ready → upload → analyse
4. Auto-analyse off → wait for Analyse (no upload copy)
5. New match detected → abort heavy work first → record
6. Match ends → resume deferred job with clear activity log

## Design

1. **Match-capture hold:** On Valorant match confirm (before OBS start), always abort upload + compression, mark active uploads deferred, set `matchCapturePriority` so the post-match worker cannot re-claim until `endMatchPerformanceMode`.
2. **Do not** broaden lobby defer messaging to “match recording” when only waiting in menus; hold is match-confirm → match-end only.
3. **Notifications:** Remove premature “Uploading match” at match end; notify only on the branch that actually uploads, or “Match recorded” when pending.
4. **Activity log:** Plain user lines for pause, wait-for-stats, resume, auto-analyse off.

## Non-goals

- Rewriting Riot enrich internals
- Changing credit / quota policy
