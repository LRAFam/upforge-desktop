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

## Visual redesign (2026-10-30, visual-report)
Reusable components in `src/components/v3/coach-flow/` (pure data in `coach-visuals.ts`, tested):
- **Report hero**: UfHeroBand (map art, agent, result, score) with the rounds line in the stats slot; rounds the coach looked at are marked.
- **What decided it**: the fact-checked headline as the one uf-t1 sentence, up to 3 evidence lines.
- **KeyMomentV3**: still frame from the clip at the decisive moment (ffmpeg, cached) with a Kill / Death / Trade · callout tag; plays the clip inline on Watch; minimap of everyone's position at that kill (Riot snapshot; victim from the kill event; killer → victim line); story in ≤3 lines; numbered fixes with "Watch m:ss" in round time.
- **RoundReviewVisualV3**: round timeline (players alive per side over time, plant/defuse, your kill/death markers you can click), selected frame + strip of the frames the coach looked at, minimap at that frame, story, numbered fixes. Used on the demo and on the match page (`RoundReviewV3`, where Watch seeks the page player and there are no stills).
- **RoundStripV3**: every round as a bar (won/lost colour, height = your buy), opening duel square, kill marks, coach-reviewed underline.
- **NumbersV3**: K/D/A, ADR, headshot share as display numbers; opening duels split bar; rounds won by buy as bars in rows; hit regions when Riot's per-round hit rows were kept.
- **MatchReportV3**: when the match's recording is on this PC, shows the rounds line, round strip and numbers (otherwise the plain facts list). **StartingReportV3**: habits drawn as match pips ("6 of 9 matches").
Honesty: no snapshot → no map; no kill list for a round → no timeline; numbers say nothing rather than 0.

## Demo cache ($0 replays)
- Live runs save clips, stills and the event log per match in `userData/coach-flow-cache/<analysisId>/`; "Use cached run ($0)" replays them with the original timings and costs. The checkbox is only on when a saved run exists; otherwise the label says the run is live (about $0.11).
- Failed or skipped steps show in plain words at the top of the screen (e.g. a 401 means the app and the local AI service were started with different keys).
- Fixed: starting a new run used to delete the previous run's folder, which wiped the cache (`dispose()` now only deletes temp folders).
- Seeded: 634 (Ascent, live $0.086) and 639 (Summit, live $0.199). 635 not seeded (budget).
- Env: the app's `COACH_FLOW_AI_KEY` must equal the local AI service's `INTERNAL_API_KEY` (the app was restarted with the AI process's own key).
