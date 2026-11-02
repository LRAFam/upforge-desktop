# Notes — stats-based UpForge score in the desktop app (audit 2026-11-02)

API design: `upforge-api/docs/UPFORGE_SCORE.md` (branch `feat/upforge-score-and-audit-data`, not deployed).

## Rule
- **UpForge score** = API `upforge_score` (0–1000, stats vs your rank). Shown as-is, caption "UpForge".
- **Coach rating** = AI `overall_score` (0–100) shown as "7/10", caption "Coach rating". Never under the UpForge name.
- Averages: `averageMatchScore` (stats only). No stats scores → coach-rating average under its own name, or nothing.

## Data pass-through
| Endpoint | Where | Change |
|---|---|---|
| GET /api/analysis/recent | `auth-manager.fetchAnalyses` (spread) | type only |
| GET /api/cs2/analyses | `fetchCs2Analyses` (raw) → `mapCs2ToAnalysisItem` | maps `upforge_score` |
| GET /api/analysis/{id} | `enrichAnalysisDetail` (field by field) | adds `upforge_score`, `upforge_score_breakdown` (sanitised) |
| POST /api/match-report | `match-report-sync` `latest` (field by field) + `focus-state` cache | adds both (sanitised) |
| GET /api/match-report/{id} | IPC passes raw → `matchReportView` | `upforgeScore`, `upforgeScoreBreakdown` |
| GET /api/match-reports, GET /api/focus | IPC passes raw | types only |

New: `src/lib/upforge-score-breakdown.ts` (sanitiser, `breakdownRows`, `baselineLine`), `src/components/v3/score/ScoreWhyV3.vue` ("Why 612?" link toggle, one row per input with a percentile bar, baseline sentence).

## Screens
Matches row, Coaches roster row, Coaching reviews list + detail (hero stat, average, "Coach rating trend" — the chart plots overall_score), Home stat row, Progress stat row, post-game score line + copy text, "Analysis complete" banner, AI category scores ("7/10"). "Why N?" on the review detail and the Valorant match report (side column, only when a stats score exists).

Removed `upforgeScore/formatScore/averageScore` (no callers left).

## Verified
type-check clean · eslint on changed files clean · full vitest 356 files pass. Live app (production, no new fields, no analysed matches on this account): Matches, Home, Progress, Coaching reviews render unchanged with honest empties. The scored state is covered by unit tests only — couldn't be seen live.

## Gaps / for the lead
- Electron main changes (sync, focus-state, analysis detail) need an app restart to take effect in dev.
- Classic (non-v3) UI still shows `overall_score ×10` in old dashboard widgets and the post-game share image ("AI COACHING REPORT 720/1000") — not under the UpForge name, left alone.
- Roster rows use `upforge_score` only if the coach roster API sends it (not in the API's list).
- Post-game ready payload comes from the AI job result, which has no `upforge_score` → post-game shows the coach rating until the API adds it there.
