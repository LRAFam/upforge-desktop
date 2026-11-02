# Audit fixes — Home / Coach (`/dashboard`)

Audit 2026-11-02, findings 1–10 for the Coach screen.

## Changed files
- `src/views/v3/HomeV3.vue`
- `src/components/v3/home/home-v3.ts` (+ `home-v3.test.ts`)
- `src/components/v3/home/HomeFocusPanel.vue`
- `src/composables/useDashboard.ts` (data only: new `coachingVerdicts` + `coachingSnippetsLoading`, cached with Home; the classic UI doesn't use them)

## What changed
1. **Same match described 3 times.** The coach block no longer restates the result. Order: focus note → the AI `verdict` of the hero match (from the `/api/analysis/{id}` detail call that already runs for snippets; only the newest row's verdict is fetched) → last insight → "Open your last match to see what decided it." Live: "You have the aim to win holds (R3, R20) but keep re-peeking angles teammates just died on…". The verdict is used on Valorant and League only: CS2/Deadlock ids live in other tables.
2. **38 vs 39 days.** Cause: the hero rounded (`relativeDay`) and the welcome-back note floored. Now both use `daysAgo` + `relativeDay` and show "39 days ago".
3. **Ascent 15–13 twice.** Cause: the API returns one row per *analysis*. Riot match `ef4d4f28…` was analysed 3 times (ids 632, 633, 634). Home now dedupes by `match_id` (`dedupeByMatch`) and keeps the newest. That fixes Recent, Recent form (it counted Ascent 3×) and the score average. Matches › Coaching reviews has the same duplicates. That screen belongs to another area.
4. **Focus title.** The habit is now `uf-t3` (Plex). Only the short goal ("Under 11%") uses the display face (`uf-d4`).
5. **Score.** "UpForge score 560 · Average of your last 5 matches" via `averageScore()`. Shown for Valorant/League only (see gaps).
6. **Form squares.** `title` + `aria-label` "Summit · 13–10 · Win".
7. **Dev tools.** Was shown to every admin *and every macOS user in production* (`platform !== 'win32'` inside `DashboardDevTools`). Home now renders it only when `import.meta.env.DEV && isAdmin`. It sits at the very bottom, dimmed.
9. **CS2 hero.** Title and meta read "Vertigo". The player name and the "CS2 VOD" source label are gone. "Open last match" is primary whenever a match exists.
   **League "cropped hero".** Cause: Home stays mounted on game switch and kept the old scroll. It now scrolls to the top when the game changes.

## Verified
- `npm run type-check`: no errors in my files. Remaining errors are in Settings/Practice files (other agents).
- `npx eslint` on my files: clean.
- `npx vitest run src/components/v3/home src/composables src/lib/focus src/lib/starting-report src/components/dashboard`: 98/98 pass.
- Full suite: 1 failure in `vod-review/personal-review-placement.test.ts` (not mine).
- Screenshots of live Valorant Home. CS2/League were checked through code and unit tests only (game switcher not touched).

## Left / needs others
- **8 Focus goal mismatch is an API/AI issue.** There are two separate target engines:
  - The active focus comes from `upforge-ai-service/services/match_report_facts.py:400` `suggest_focus`: `early_opening_death_rate`, target 0.11.
  - The starting report comes from `services/starting_report.py:313` `_focus_suggestion`: `opening_death_rate`, target 0.10.
  - They are different metrics. Once a focus is active, `StartingReportV3` (not mine) should show the active focus from `/api/focus`, not the old suggestion.
  - **"0.141"** is in the AI's text. `starting_report.py:180` passes raw share values (`average 0.141`) into the fact sheet, and the LLM copies them. Format shares as % there.
  - The Home card shows summary[0] and habits only, so no decimals appear on Home.
- **CS2 score/K-D-A.** `src/lib/cs2-analyses.ts` `mapCs2ToAnalysisItem` hard-codes `kills/deaths/assists: null` even when the API sends them. It also maps `overall_rating` to 0–10 (`rating/10`), not 0–100. Home therefore doesn't show a CS2/Deadlock score. The last CS2 match (VOD 449) has no stats anyway. Owner of `src/lib` should fix the mapper.
- **CS2 with a match and setup steps** can show two red buttons ("Open last match" + GameSetup's own primary).
- **10 Hero (lead, `UfHeroBand`).** The agent is `height × 1.9` at `top: 10px`, so it is always cut at the waist. Suggest about `× 1.3` anchored to the bottom, or an `agentScale` prop. The empty left space is the base scrim/padding, not a Home prop.
- `DashboardDevTools.vue` itself still shows on non-Windows production builds for the classic UI (`platform !== 'win32'`). Worth gating it there too.
