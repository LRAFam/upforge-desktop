# Game data wiring — 2 Nov 2026

Desktop side of `upforge-api/docs/GAME_DATA_GAPS_2026-11-02.md` (API branch `feat/upforge-score-and-audit-data`, **not deployed**).
Every new field is optional: production (old API) renders exactly as before; new states are proven by unit tests with fixtures.

## CS2 (`/api/cs2/analyses`)
- `src/lib/cs2-analyses.ts`: `cs2Rounds` (API `rounds_won/lost` first, else player-side `score`), `cs2Adr` (0 = not measured),
  `headshot_pct` → `hs_pct`, new `cs2_stats { adr, kast_pct, source }` on `AnalysisItem`, `cs2StatItems` (ADR, KAST), `cs2StatsSourceNote`
  (labelled only when the AI read the numbers from video).
- Matches row: score/result/K/D/A come through the existing analysis join (`matchRowSummary`); ADR/KAST on hover (column fits K/D/A only).
- Coaching reviews hero: measured score, ADR + KAST after K/D/A, AI-source note.
- Home recent form: won–lost/K/D/headshots now fill from the mapped rows; adds "Average ADR" (measured only).
- Main: `fetchCs2Analyses` typed as `Cs2AnalysisItem[]` (pass-through).
- Not changed: match page header (already uses the local demo); a cloud-only VOD match page still takes the AI score in `useVodReview` (lead-owned).

## League (`/api/lol/matches/recent`, `/api/lol/match-report`)
- `src/lib/lol-recent.ts`: `normalizeLolRecent`, plain-words reasons, `lolLoadout` (spells · items · trinket last, Data Dragon via exported
  `DDRAGON_BASE`/`FALLBACK_VERSION` in `lol.ts`), `lolProfileIconId`.
- New IPC `lol:get-recent-matches-result` (preload `lol.getRecentMatchesResult`); old `getRecentMatches` unchanged. Network failure →
  `request_failed` ("Couldn't load your League games"); 422 stays an empty list. **Needs an app restart** for the new IPC; until then the renderer falls back to the old list.
- `useGameData`: `lol.matchesError`; Riot down keeps the last good games on screen.
- `LolRecentNotice.vue` (Home + Progress): "Couldn't reach Riot right now" + reason + Try again, instead of "no games"; partial line.
- `LolLoadoutStrip.vue`: Progress recent games rows + League match-report band (`loadout`).
- Avatars: League profile icon via `playerIdentity({ game: 'lol', profileIconId })` next to the Riot ID on Home and Progress.
  **Lead:** the title bar (`App.vue` `v3AccountIdentity`) can pass `profileIconId: lolProfileIconId(matches)` the same way.

## Deadlock
- `src/lib/deadlock-item-build.ts`: `deadlockRowHeroArt` (card → icon), `deadlockBandArt` (card → background), `deadlockItemBuild`
  (`null` = not published, `[]` = nothing bought), summary + a11y labels.
- Progress recent matches and hero table: hero card art (cropped to the face), small icon fallback.
- Match report: band = hero art, else Deadlock key art; `DeadlockItemBuildV3.vue` timeline (icons in buy order, time under each,
  sold items dimmed with "sold m:ss", slot colour bar). Hidden when the API doesn't send `item_build`.
- Shared files touched additively: `src/env.d.ts` (optional fields), `src/lib/match-report.ts` (`bandArt`, `itemBuild`, `loadout` on the view),
  `src/lib/match-report-games.ts` (reads them), `src/views/v3/MatchReportV3.vue`, `src/views/v3/HomeV3.vue` (one ADR item).

## Checks
- `npm run type-check` clean · eslint clean on every changed file · `npx vitest run` 376 files, 2264 passed, 9 skipped.
- New tests: `lol-recent.test.ts` (8), `deadlock-item-build.test.ts` (6), `cs2-analyses.test.ts` (+4), `games/game-data-states.test.ts` (6, SSR render of the notice, loadout strip, item build).
- Screens (prod, old API): Deadlock and League Progress render unchanged (fallbacks). New states not visible until the API deploys.
