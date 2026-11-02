# Audit fixes — Practice, trainer results, calibration (2 Nov 2026)

Branch `fix/desktop-audit-2026-11-02`. Not committed.

## Root cause: "Not played" / "No scores yet" (finding 1)
- The API only counts runs with `metadata.scoring_version = 2` for personal bests, benchmarks and leaderboards
  (`upforge-api` `App\Support\TrainingComparison::VERSION = 2`, commit 2122149, 24 Sep 2026; used in
  `TrainingSessionService::history()` / `benchmark()` and `LeaderboardController::trainer()`).
  The desktop trainer started sending it in 2.12.12 (desktop commit c3ce41b, 24 Sep 2026).
- Checked read-only on the signed-in account: all 29 runs (12 May – 24 Sep 2026) have no `scoring_version`,
  so every `by_scenario.best_score` and `benchmark.user_best` is `null`. The "all time 29" count includes them.
- This is intentional (fair comparisons), so the fix is honest copy, not changing the filter:
  - Drill library and focus steps show "Old best 53" (best old-scoring run from history) instead of "Not played".
  - One line above the library and in Analytics: "Your 29 runs from before 24 Sep 2026 used the old scoring,
    so they don't count towards personal bests. They stay in your history."
  - Leaderboards: "Only runs since the scoring update on 24 Sep 2026 count."
- Not mine: Home's "Last drill: flick · 48" reads the raw last run (old scoring). Home owner may want "old scoring".

## Changed files
- `src/views/v3/PracticeV3.vue` — one title (H1 "Practice", no "Training hub" label, no per-tab H1); hero headline
  is just the focus label (label keeps "from your focus"); drill library is now a table (icon 48px, name,
  difficulty · length, what it trains, personal best ★ gold / "— Old best N" / "Not played", Play);
  "Drills from your matches" rows; Quick play uses the v3 select; calibration link moved into the Loadout block, admin only.
- `src/views/TrainingHubView.vue` — passes `matchDrills`, `scoringNote`, `oldBest`, `showCalibration` (admin from
  `app.getStatus()`), launches match drills by id; "Micro-Adj" → "Micro-Adjust".
- `src/components/v3/practice/practice-v3.ts` (+test) — streak shows 0; `oldScoringBests`, `oldScoringNote`,
  `noBestCaption`, `matchDrillRows`, `cleanDrillTitle`; removed `practiceTitle`, `showRecommended`.
- `src/components/v3/practice/practice-session-v3.ts` (+test) — `leaderboardYouRow`.
- `src/components/v3/practice/PracticeAnalyticsV3.vue` — radar labels anchored away from the shape + wider
  viewBox (no clipping); scoring note when there are no current bests.
- `src/components/v3/practice/CrosshairPreview.vue`, `crosshair-preview.ts` (+test) — new, see below.
- `src/components/v3/practice/practice-v3.css` — new `.uf-pselect` (no native chevron).
- `src/components/v3/practice/PracticeDrillTile.vue` — deleted (replaced by the table).
- `src/components/training/TrainingLeaderboardsTab.vue` — v3 selects, skeleton rows, `.uf-refreshing`, "You" row.
- `src/components/training/TrainingLoadoutsTab.vue` — real crosshair at 2× over Ascent art; settings merged with defaults.
- `src/views/ValorantCalibrationView.vue` — label "Admin tool" + plain description; file picker = v3 secondary
  button + filename; pose select and checkbox use v3 styles.

## "Drills from your matches" (finding 3)
`/api/drills` returns coaching drills that mostly run in Deathmatch / custom games and have no `trainer_scenario`.
The API's `godot_config.scenario` is a category guess (`DrillService::buildGodotConfig` →
`TrainerScenarios::validateScenario(null, category)`), and the desktop also fell back to Flick — so
"Empress Timing" showed as "Flick" and Play launched Flick. Now: title = the drill's own title (difficulty tags
removed), meta = category · where (e.g. "Utility · Custom game"). Play only when the drill names a trainer scenario;
otherwise "Steps" shows the API's instructions and goal. API follow-up (not edited): don't fill `godot_config` from
the category alone.

## CrosshairPreview (finding 11)
`src/components/v3/practice/CrosshairPreview.vue` — props `settings: CrosshairSettings`, `scale` (default 2),
`size` px (default 160), `background` (optional image URL). Geometry mirrors `upforge-trainer/scripts/Crosshair.gd`.
**Settings agent: import it in Settings › Trainer next to the sliders** (`<CrosshairPreview :settings="localSettings" />`).

## Leaderboards "You" row (finding 9)
The API returns at most 50 rows and no rank for anyone outside them. When you're not in the rows, the tab reads your
own best for the same drill/difficulty/length (existing `trainer:get-history` with a comparison filter, read-only)
and shows it with a plain reason ("Outside the top 50. Ranks past 50 aren't shown." / "No run with these settings
this week."). Gap: a real rank needs the API to return the caller's rank — not added (no new endpoints).

## Gaps
- Drill previews (finding 6): `src/assets/training` has only static icons (1536px webp, now shown at 48px).
  No preview stills or clips exist; 3 drills reuse other icons (angle_clearing / head_height → strafe_aim,
  distance_switching → switching). Needs a 3-second loop per drill (13 clips) from the trainer.
- `.uf-pselect` should move to `src/design/v3.css` as the shared select (lead-owned).
- Calibration route itself isn't guarded (router is lead-owned); only the entry link is admin-only.
- Player avatars on leaderboards: API returns `player_card_id`; not rendered (no helper for card art found).

## Verified
- `npm run type-check`: no errors in my files (remaining errors are in matchpage/vod-review, other agents).
- `npx eslint` on all changed files: clean.
- `npx vitest run src/components/v3/practice src/lib`: 94 files, 497 tests pass. Full `npx vitest run`: 1 failure in
  `vod-review/personal-review-placement.test.ts` (not mine).
- Screenshots: Train, Analytics, Leaderboards, Loadouts, Calibration checked in the running app.
