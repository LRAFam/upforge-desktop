# Notes — Progress (agent-progress)

## Built
- `src/views/v3/ProgressV3.vue` — the v3 Progress screen (/stats), boards 8 · 8b · 8c.
- `src/components/v3/progress/RankJourney.vue` — rank line: ELO line plus a trend fill (teal when rising, loss
  red when falling). Rank icons sit where the rank name changes. A dashed focus marker appears when the focus
  `started_at` falls inside the window. Below the icons: one T1 sentence built only from the data, and the delta at D3.
- `src/components/v3/progress/progress-chart.ts` — pure maths: `eloSeries`, which plots ELO and never RR,
  drops unusable points and sorts oldest first. Also `eloDelta`, `rankChanges`, `chartGeometry` (time-scaled
  x with 10% y headroom), `halfDelta`, `sparkline`, `metricLabel` and `formatMetric`.
- `src/views/StatsView.vue` — switch only. It renders `ProgressV3` when `uiV3` is on and passes its existing
  computed data as props; the range uses `v-model:range`. The old markup and script are unchanged.

## Data (all real)
- **Rank:** `window.api.stats.rrHistory()`, plotted as `elo`.
- **Matches:** `loadGameAnalyses` via StatsView's computeds. That covers win rate, coach score (×10),
  K/D, HS%, the half-vs-half deltas, recent form (shown as a `UfRoundsLine` of the last results), and the
  agent and map breakdowns (win-rate bars inside rows).
- **Focus and habit trends:** `window.api.app.getFocus()`, refreshed on `onFocusUpdated`.
  - Every metric with 2 or more values in `history` gets a sparkline and first-half → second-half averages.
  - Only the focus metric is coloured good or bad, because its `better` direction is known. The others stay
    neutral rather than guessing a direction.
- **Empty states:** no rank history; non-Valorant games (rank is Valorant-only); no focus; no habit history;
  no matches in range.

## Gaps for the lead
1. **"Since you joined" isn't possible yet.**
   - `auth-manager.ts fetchRRHistory()` hard-codes `?range=30d`, and the `stats:rr-history` IPC takes no argument.
   - The API supports `range=all`. A main-process change to accept a range argument would unlock it, but that's
     outside my files.
   - For now the rank line shows the last 30 days, with a note when the selected range isn't 30D.
2. **Recurring mistakes and coach memory (board 8c) are omitted.** The knowledge bank isn't in the desktop API
   or IPC, and the rulebook says not to invent data.
3. **The old StatsView rank chart still plots `rr`** (the RR bug) when the switch is off. It's fixed on
   `feat/match-account-tag`; merge that, or fix it here when integrating.
4. **The visual check only covered empty states.** The test account has no matches. `RankJourney.test.ts`
   renders fixture data to cover the filled chart (labels, delta, sentence, icons, focus marker, falling colour).

## Checks
- `npm run type-check`: clean.
- eslint on my files: clean.
- `npx vitest run src/components/v3/progress`: 11 passed.
- Full `npm test`: 1372 passed, 9 skipped.
- Screenshot: `scratchpad/rework-shots/progress-v3.jpg`.
