# Notes — Coaching reviews (agent-reviews, round 2)

## Built
- `src/views/v3/CoachingReviewsV3.vue` — the screen. Rendered by `CoachingHistoryView.vue` when `uiV3` is on.
  `CoachingHistoryView` still calls `provideCoachingHistory()` once for both old and v3 markup (no double loading,
  and flipping the switch while open keeps working).
- `src/components/v3/reviews/ReviewFiltersV3.vue` — result filters (All / Wins / Losses / Scored) and the map filter as
  `UfTabs` (filter size), a real count line ("N before coaching · X of Y reviewed"), and the League web-reports link.
- `src/components/v3/reviews/ReviewListV3.vue` — hairline rows: map art + agent thumb, agent · map (T3), date ·
  K/D/A · status (T4), score in D4 win/loss colour (or W/L), AI score · grade (T4). Grouped by the composable's real
  groups (Today / Yesterday / This Week / Earlier). "Before coaching" section for recordings not yet coached, with a
  status dot (red = needs you, pulsing = uploading/analysing, faint = waiting). Skeleton + honest empty states.
- `src/components/v3/reviews/ReviewDetailV3.vue` — all old detail states and actions:
  - Before coaching: thumb, D2 agent, stats, status + readiness message, pending message;
    primary = the lifecycle action (Run AI coaching / Retry analysis / Retry stats sync / Attach demo|replay),
    secondary Watch footage (when playable), link Manage footage.
  - Archive overview: UfStatRow (games, win rate, avg score, avg K/D), most played agent, top map, score trend
    (teal rising / loss falling, trend fill). Empty account: one honest line.
  - Coached session: UfHeroBand (map art, WIN/LOSS, meta, D1 score, stats incl. ACS and AI score + grade),
    primary Review match, secondary Coach notes (when completed), saved reviews, collapsible Coaching report
    (brief / coach feedback / coach reviewing / map intel / verdict / focus areas), Moments to revisit (recap,
    timing comparisons, duel moments) — the existing panels are reused with a scoped squaring/flattening.
- `src/components/v3/reviews/reviews-v3.ts` (+ 6 tests) — result/score/K/D/A/status/dot helpers.

## Data / truth
- Everything comes from `useCoachingHistory` (analyses, pending recordings, detail, coach-review summaries).
- `AnalysisItem` has no headline finding, so the list shows date · K/D/A · status instead; the finding lives in the
  detail pane (report / brief). Adding a short `headline` to the analyses list API would let the row show it.

## For the lead / agent-library
- No change needed in `MatchesV3` / `MatchesTabsV3`: the screen sits under their header correctly
  (`/recordings?view=coaching`).
- Reused panels (`TacticalIntelBrief`, `MatchRecapPanel`, `TimingComparisonPanel`, `DuelMomentCards`,
  `MatchSavedReviews`) keep their internal Tailwind type sizes; I only square/flatten them. A v3 pass on those shared
  components would finish the detail pane.
- Only empty states were visible locally (no coached matches on the test account); rows and the session detail are
  covered by type-check + helper tests only.
