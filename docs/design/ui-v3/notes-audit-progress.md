# Audit fixes — Progress (/stats) and Post-game (2 Nov 2026)

## Changed files
- `src/views/v3/ProgressV3.vue` — H1 title (`uf-d2` "Progress") + one meta line "N games checked · M analysed · Your starting report →"; habits filtered to the range and coloured better/worse/flat per stat; "Analysed matches" section with an honest empty line; stat row says "UpForge score" and its delta is ×10.
- `src/views/StatsView.vue` (v3 binding only) — passes `averageScore(...)` from `src/lib/upforge-score.ts` and `lastAnalysedAt`. Classic branch untouched.
- `src/components/v3/progress/progress-chart.ts` — `HABIT_METRICS` (direction + label, mirrors `FOCUS_METRICS` in `upforge-ai-service/services/match_report_facts.py`), `habitTone`, `badgeIndexes`, `inRange`.
- `src/components/v3/progress/progress-counts.ts` (new) — header count line + analysed empty line.
- `src/components/v3/progress/RankJourney.vue` — badges only at the start, the first time each rank is reached, and the end (if different); rings on every change; legend under the chart (Ranked up / Ranked down / Focus started: …); no text inside the plot.
- `src/components/v3/progress/recurring-habits.ts` + `RecurringHabitsV3.vue` — drops the API's synthesized prefix, shows the coach's own note (cut at a whole word), "Flagged 133 times", maps as a tooltip.
- `src/views/PostGameView.vue` — v3 branch gets `v3ScoreLine` = "UpForge score 720" via `formatScore`. Classic `compactScore` (with grade) unchanged.
- Tests: `progress-chart.test.ts`, `progress-counts.test.ts` (new), `RankJourney.test.ts`, `recurring-habits.test.ts`, `src/views/v3/PostGameV3.test.ts`.

## Root causes found
1. **Counts:** the header counted UpForge analyses (`created_at` in range; last one 38 days ago). The rank line comes from `rrHistory` (polled every ~30 min — not one per game, so it can't be counted as games). Habit trends come from `/api/focus` `history` (one snapshot per synced match, capped by the tier's `focus_history_matches`). Habits were also not filtered by range. Now: habits follow the range and the header names both counts.
2. **Habit colours:** only the focus metric was coloured. Directions now from the AI service's `FOCUS_METRICS` (`traded_death_rate` = share of your deaths that were traded → higher is better).
3. **"1 analyses (133 sightings)":** API bug in `upforge-api/app/Services/KnowledgeBankHabitSynthesizer.php::synthesizeText` — `source_count` is the number of merged insight rows (always 1 on the incremental path in `KnowledgeBankService`), not analyses. `occurrence_count` is incremented once per coach finding (`KnowledgeBankInsight::recordOccurrence`), and one analysis can add several, so "133 analysed matches" was also wrong → now "Flagged 133 times". Desktop strips the prefix; the API text should be fixed there (not edited by me).

## Verified
- `npx vitest run src/components/v3/progress src/views/v3/PostGameV3.test.ts src/components/v3/postgame src/lib/upforge-score.test.ts` → 8 files, 53 tests pass.
- `npx eslint` on all changed files → clean.
- `npm run type-check` → no errors in my files (remaining errors are in `MatchPageHeaderV3.vue` and `TrainingHubView.vue`, other agents' in-progress work).
- Screenshots: `/stats` (header "61 games checked · 0 analysed", 3 badges, legend, coloured habits, habit notes) and `/post-game-preview` ("UpForge score 720").

## Left / gaps
- **Example clip / source match per habit:** the API returns `source_analysis_id` and `context.habit_evidence.snippets/maps/agents`, but `electron/main/auth-manager.ts::fetchRecurringInsights` doesn't pass them through (not my file). Passing `source_analysis_id` would allow "See an example →".
- **Generic labels** ("Game sense", "Agent-specific habits", "Positioning habits") are the API's category fallback (`KnowledgeBankThemeClassifier::CATEGORY_LABELS`) when no theme rule matches. The coach's note under each now makes them specific.
- **Possible claim leak (API/AI):** "Economy discipline" and "Mechanics habits" rows carry positive notes ("Coordinates economy buys … consistently", "Stationary head-height holds consistently convert …") but are listed as recurring habits. The knowledge bank stores strengths as habits. Needs a golden case under `upforge-ai-service/tests/fixtures/coaching_claims/` before fixing, per AGENTS.md. Not changed here.
- Focus panel title stays `uf-d2` like Home's `HomeFocusPanel`; align if Home changes its focus headline style.
- `HABIT_METRICS` duplicates the AI service's direction map. If `/api/focus` history included `better`, the desktop could read it instead.
