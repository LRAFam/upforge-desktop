# Progress: roadmap + playstyle (2026-11-02)

Closes coverage gaps #3 (roadmap/weekly goals) and #4 (skill profile/playstyle) on v3 Progress. Valorant only (same `!demoGame` gate as the other coaching sections).

## Order on Progress
Rank line (hero) → habits that moved / your focus → **Your plan** → **Your playstyle | Coach scores** → What keeps coming up → Analysed matches. No tiles added.

## Your plan (`src/components/v3/progress/YourPlanV3.vue`)
- Data: `GET /api/goals/current` (per-goal ticks, in the format `/goals/toggle` writes). It's read-only here; goals get ticked on the web.
- Shows: "Your plan · week N of 10", a 10-segment week strip, "This week: {focus_topic}", why_it_matters, "X of Y goals done this week", and the goal list. Links to `/improvement-roadmap` via `openWebFeature`.
- No active roadmap: one quiet line ("No 10-week roadmap running. Roadmap on upforge.gg →"). No upsell.
- Error: "Couldn't load your roadmap. Retry". An older preload without the channel shows nothing.
- 10 weeks is fixed, the same as the API's `/roadmap/current` (`total_weeks: 10`) and the web.

## Your playstyle (`PlaystyleV3.vue`, helpers `playstyle.ts`)
- Left column: existing IPC `progress:playstyle-profile`. Shows the top role and agent-pool sentence, then rows with bars for: opening duels won, first to die (of rounds), deaths with no trade, Sheriff on eco rounds, then K/D and utility per round. Every number is the API's own aggregate, only rounded.
- I left out `duel_win_rate_pct`, which comes from a small sample of AI-flagged duels (33 for the real account).
- Right column: `GET /api/skill-profile` (Plus, `advanced_analytics`). Shows each category's average over the last ≤20 analysed matches, out of 10, plus the latest score. A 403 hides the column completely.
- Category scores are treated as 0–10 (as on the web). A value above 10 is divided by 10, never scaled up.

## New IPC (rulebook "no new IPC" relaxed for these promised features)
- `electron/main/ipc/progress-plan-ipc.ts` (+ test): `progress:weekly-plan` and `progress:skill-profile`. Both refuse untrusted frames and signed-out users, and both trim the payload.
- Wired in `electron/main/index.ts` (one import and one setup line), `electron/preload/index.ts` (`progress.weeklyPlan` and `progress.skillProfile`) and `src/env.d.ts`.

## Verification
- `npx vitest run electron/main/ipc/progress-plan-ipc.test.ts src/components/v3/progress/playstyle.test.ts`: 11 passed.
- eslint is clean on all changed files.
- type-check and the full vitest run: the only failures are in other agents' in-progress files (`coach-format.test.ts` and `roster-flow.test.ts`, which import missing exports). None are in these files.
- Screenshot `/stats`: the playstyle section renders with real data (100 tracked matches). Your plan and Coach scores can't show live until the app restarts, because the new main and preload channels aren't loaded. Until then they correctly render nothing.

## Open
- "Deaths with no trade" shows the API's `untraded_death_rate_pct` (isolated deaths). If that metric is ever found to leak (AGENTS.md coaching-claim rule), drop the row.
- Ticking goals in the app would need `/goals/toggle`, which is a write. It's left to the web for now.
