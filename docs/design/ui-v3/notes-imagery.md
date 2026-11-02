# Imagery pass — empty states, onboarding, minimap (2 Nov 2026)

## Built
- `src/components/v3/empty/EmptyArt.vue` + `empty-art.ts` (+ `empty-art.test.ts`, 11 tests).
  - Props: `title`, `text?`, `game?` (defaults to the title-bar game), `agent?`, `map?`, `art?` (bundled override), `size` `page` (T1 title) | `section` (T3 title). Default slot = the action.
  - Art order: `art` override → Valorant map `stylizedbackgroundimage.png` (same UUID as the splash) → game art (`hero-agents.webp` for Valorant, `*-card-bg.webp` for CS2/Deadlock/League). A Valorant agent adds a `fullportrait.png` cut-out that breaks the band's top edge; it then sits on the abstract `valorant-card-bg.webp`, not the five-agent splash.
  - Text sits on a solid area (left 38%); gradient is a scrim only; art dimmed (`saturate .6, brightness .72`). Under 760px: no agent, flat scrim.
- Used in (empty-state markup only):
  - Clips empty (`ClipsView.vue`): replaces the hotkey drawing (its 7 CSS rules removed); same copy + actions. **Seen live** (Valorant, 0 local clips).
  - Matches (`MatchesV3.vue`): "No {game} matches yet" (art by the filtered game) and "No matches yet". Unused `.uf-empty` rule removed.
  - Progress › Analysed matches (`ProgressV3.vue`, section size). **Seen live** (30D range, no analysed matches).
  - Practice › Analytics "No scores yet" (`PracticeAnalyticsV3.vue`, section). The `scoringNote` variant stays plain text.
  - Coaching reviews (`ReviewListV3.vue`): only the "no reviews at all" case; "No reviews match this filter" stays plain (a filter isn't missing data).
  - Squad activity (`SquadV3.vue`, section, Valorant).
  - Leaderboards v3 branch (`TrainingLeaderboardsTab.vue`): uses the existing podium art (`leaderboard-empty.webp`) big instead of 96px. Old-UI branch untouched; `.uf-lb-empty*` CSS removed.
- Not visible on the real account (data exists): Matches per game, Analytics, Leaderboards, Squad activity, Reviews → covered by unit tests.

## One image per screen
Only used where the screen has no other big image. Progress has small rank emblems only; Clips/Matches/Analytics/Leaderboards/Reviews/Squad activity have none when empty. Don't drop EmptyArt into a screen with a `UfHeroBand`.

## Onboarding — no change
The v3 onboarding already shows the splash art (`hero-agents.webp`, the image SplashView uses) full-bleed on the left in `OnboardingRailV3.vue`, behind the title and steps, and as the compact band under 960px. Adding a second tall image would break rule 7. Not screenshotted: mounting `/onboarding` registers OBS/game listeners that write mission state, so I didn't open it on the production-signed-in app.

## Match page minimap / Map intel — finding (no code; files belong to the match-page owner)
valorant-api `/v1/maps` (media.valorant-api.com, already in the CSP) per map:
| Field | Size | Fit |
|---|---|---|
| `displayIcon` | 1024², ~27 KB, grey | current minimap; no coloured top-down exists in valorant-api |
| `listViewIcon` | 456×100 | too small for a header |
| `listViewIconTall` | 1920×1080, ~2.3 MB | heavy |
| `stylizedBackgroundImage` | 2560×1440, ~0.5 MB, dark/moody | **best fit**: Map intel header backdrop or behind the minimap frame at low opacity |
| `premierBackgroundImage` | 1920×1080, ~0.8 MB | only some maps |
URL = splash URL with `/splash.png` → `/stylizedbackgroundimage.png` (helper `valorantMapBackdrop` in `empty-art.ts`; could move to `src/lib/valorant.ts` if the lead wants it shared). Missing for Range/Basic Training/Gauntlet (not real maps). For a "coloured" minimap: tint the grey displayIcon with CSS (e.g. `filter: sepia(.3) hue-rotate(...)`) or draw team-coloured pins on it — no new asset needed.

## Verify
`npm run type-check` clean · `npx eslint` on all changed files clean · `npx vitest run src/components/v3/empty` 11/11 · full `npx vitest run` 357 files / 2142 tests pass.
Screens: `scratchpad/shots/agents/img-clips-b-1.png`, `img-progress-2.png`.
