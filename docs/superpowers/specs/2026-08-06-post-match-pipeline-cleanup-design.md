# Post-match pipeline cleanup design

**Date:** 2026-08-06  
**Service:** `upforge-desktop`  
**Status:** Approved  

## Goal

One clean step sequence after a match, with one analyse gate and one pause/resume path. Behavior stays the same; structure gets clearer.

## Step machine

```
save_local_vod
  → wait_match_data (if not ready)
  → pending_manual     (autoAnalyse off)
  → pending_waiting    (autoAnalyse on, stats not ready)
  → upload_analyse     (autoAnalyse on + ready)
```

Interrupt:

```
match_detect → pause_post_match → record → match_end → resume_post_match
```

## Extracted units

1. **`decidePostMatchNextStep`** — pure function over `{ autoAnalyse, readiness }`
2. **`analyse-gate`** — ready + not deferred + not in live match
3. **`post-match-copy`** — single source for activity/UI strings
4. **`abortHeavyBackgroundWork(reason)`** — replace twin abort helpers

## Non-goals

- Rewriting Riot enrich, S3 upload, or OBS start
- Changing auto-analyse product rules
- Splitting all of `index.ts` in one pass
