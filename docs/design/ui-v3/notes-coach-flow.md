# Coach flow fast path + "Replay a real match" demo

Branch `feat/coach-flow` (desktop, AI, API integration of feat/match-report + feat/round-review).

## How to watch it
Dev build only. Dev bar → **Replay a real match** (route `/dev/coach-flow`). Pick a recent analysed Valorant
match that has a cloud recording → **Replay this match**. Left: what the player sees, as it arrives. Right:
timeline since the match ended, each step's duration and AI cost. Press **Review round N** for the round review.
Needs a local AI service: `COACH_FLOW_AI_URL` (default http://127.0.0.1:8011) and `COACH_FLOW_AI_KEY`
matching that service's `INTERNAL_API_KEY`, with `VALORANT_ROUND_REVIEW_ENABLED=1`.
Production data is read-only. Cap: $0.50 per run (calls that could cross it are skipped).

## Fast path
1. Match data → data report (cheap notes) and a code-only plan (round + 2 key moments) in parallel.
2. Clips cut on the PC from the recording (ffmpeg range-reads the cloud recording in the demo), 720p 15 fps.
3. Each key moment uploaded and coached on its own, all at once (`/api/coach-flow/moment`).
4. Round review on request from the round's clips (`/api/coach-flow/round-review`); windows observed in
   parallel (`MOMENT_OBSERVER_CONCURRENCY`, default 4), also for the URL-based pipelines.

## Measured on a real match (634, Ascent, 28 rounds), 2026-10-30
| Step | Ready at | Took | AI cost |
|---|---|---|---|
| Match data | 1.7 s | 1.7 s | – |
| Round + moments picked (code) | 1.7 s | <0.1 s | – |
| Clips cut on this PC (4 clips, 51 s of video) | 9.1 s | 7.4 s | – |
| Match report (data coaching) | 9.9 s | 8.2 s | $0.001 |
| Key moment (round 11) | 32.6 s | 23.5 s | $0.028 |
| Key moment (round 10) | 47.6 s | 38.5 s | $0.028 |
| Round 4 review (on request) | +40.5 s after the tap | 40.5 s | $0.052 |
Per run: ≈ $0.06 before the round review, ≈ $0.11 with it. Clips: 10.5 MB at 720p/15 fps (41 MB at full res).

## Known issues seen in the run
- Match report claimed "no teammate within 25 m for any of your 24 deaths" — almost certainly missing
  teammate positions in this match's data, not a real habit. The trade/proximity facts need a data check
  before that claim is allowed (golden case first).
- AI review time (20–40 s per moment) now dominates; uploads are 1–3 MB per moment.
