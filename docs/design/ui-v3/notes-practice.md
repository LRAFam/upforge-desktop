# UI v3 — Practice (agent-practice)

## Built
- `src/views/v3/PracticeV3.vue` — header (Training hub label, D2 title, real stats inline), text tabs
  (Train · Analytics · Leaderboards · Loadouts), and the Train body:
  - Session hero on the guided-session art with the one red action **Start session** (only when a plan with steps exists;
    otherwise an honest T2 empty state).
  - Recommended drills — **only when they came from the API** (`coachingDrills.length > 0`).
  - Drill library: text-tab filters + raised tiles (real drill icon, difficulty/duration, real personal best or "Not played",
    real global rank, Played today / Running states).
  - Side rail: daily challenge, quick play, loadout link, "Did it carry over?" (API correlation insights, only if any), calibration link.
- `src/components/v3/practice/PracticeDrillTile.vue`, `practice-v3.ts` (pure helpers) + `practice-v3.test.ts` (6 tests).
- `src/views/TrainingHubView.vue` — switch only: `PracticeV3` when `uiV3`, old header/tabs/stats under `v-else`; the old
  Train body is skipped in v3; Analytics / Leaderboards / Loadouts bodies, all modals, banners, launch/session/result logic
  are shared and unchanged. A scoped CSS layer (`.ui-v3 .uf-practice-legacy`) squares corners/surfaces of those legacy bodies.

## Data used (all existing)
`trainingStats`, `guidedSessionPreview` + `sharedTrainingPlan.focus.reason`, `recommendedDrills`, `scenarioCards`
(`benchmarkData`/`apiHistory`), `dailyChallenge`, `correlationInsights`, `SCENARIO_META`. Actions call the view's existing
`startStructuredSession`, `launchVodDrill`, `launchScenarioCard`, `launchDrill`, `launchFreePlay`.

## Truth fixes
- The view seeds `assignedDrills` with placeholder reasons ("Your last 3 VODs show crosshair below head-level on 68%…").
  v3 never shows those: recommendations render only when coaching drills came from the API, and library tiles show no reason text.
- The old "Active loadout: Competitive preset" text was hard-coded; v3 shows a neutral "Open loadouts" link instead.

## Gaps / asks for the lead
- **Focus → drill link:** the match focus (`window.api.app.getFocus`) isn't mapped to drill scenarios anywhere, so v3 shows the
  training plan's own focus reason, not "from your match focus". Needs a focus-metric → scenario map (roadmap: "Practice session
  picked from your focus").
- **Did it carry over (match data):** only the API's correlation strings exist; no before/after match metric for practice.
- Analytics / Leaderboards / Loadouts bodies are legacy markup in the v3 frame (squared). Rebuild later.
- The drill-running banner, warm-up banner, result modal and session summary are still legacy styling.
- Base `.uf-btn-primary` has no `:disabled` style — a disabled primary looks enabled. Suggest adding
  `.ui-v3 .uf-btn-primary:disabled { opacity: .4; cursor: not-allowed; }` in `src/design/v3.css`.

## Checks
type-check clean · eslint clean on owned files · `practice-v3.test.ts` 6/6 · full `npm test` 1375 passed / 9 skipped ·
screenshots: `scratchpad/rework-shots/practice-v3b.jpg`, `practice-analytics.jpg`.

## Round 2 — "Today's session, from your focus" (agent-practice2)
- `src/components/v3/practice/focus-drills.ts` (+ tests): static, renderer-only map from the four real focus-loop
  metrics (AI service `FOCUS_METRICS`: opening_death_rate, early_opening_death_rate, traded_death_rate,
  zero_damage_round_rate) to 2 existing trainer drills each, filtered to drills present in the loaded catalogue.
  Captions describe what the drills practise; no claims about the player.
- `src/components/v3/practice/usePracticeFocus.ts` (+ test for `activeFocusOf`): reads the active focus via
  `window.api.app.getFocus` / `onFocusUpdated` — the same IPC as the Home focus card. No new IPC.
- `PracticeV3.vue`: when an active focus maps, the session hero reads "From your focus: <label>", lists the mapped
  drills with real personal bests, and the one red action is "Start with <drill>" (plays the first mapped drill).
  The guided session, when it exists, becomes a link ("Guided session instead"). Otherwise the hero is unchanged.
- Not built: "did it carry over" from focus checks vs drill days — the renderer has no per-day drill history paired
  with focus checks, so it's omitted (the existing API-provided carry-over insights still show in the side rail).
- CS2/Deadlock/League have no focus-loop metrics yet, so no mapping applies there.
- Verified: type-check clean · eslint clean on my files · practice/v3 tests 14 pass · full suite 1414 pass.
  The test account has no active focus, so only the fallback hero was seen on screen (practice-focus.jpg).

## Round 3 — in-session, tabs, trainer (agent-train)
- **In-session (TrainingHubView v3 branch):** drill-running strip (live dot, drill, difficulty · length, Stop) and guided-session waiting strip (step x of n, step ticks, countdown, Cancel / Start now). Completion modal and session summary are `UfDialog`s: D1 score, delta vs previous in win/loss tone, gold ★ only for a real personal best, accuracy / time to hit / hits inline; actions Done · Share · Play again (primary). Same handlers as the old UI.
- **Tabs:** Analytics → `PracticeAnalyticsV3` (skill shape, by-drill history with sparklines, benchmark, insights, achievements, share week). Leaderboards and Loadouts have in-file v3 branches. The legacy header/tabs/stats strip live in the old-only branch, so the strip no longer shows in v3.
- **Trainer results:** full v3 branch (score hero, coach feedback sentence, Play again primary, trend chart, top scores). With no result in memory it falls back to the old empty state (it only appears right after a drill).
- **Calibration:** kept as a scoped restyle (`.ui-v3 .calibration …`): it's a prototype measurement tool; same markup and behaviour.
- **Shared helpers:** `src/components/v3/practice/practice-session-v3.ts` (+ test): deltaTone, signed, pct, hitsLabel, isBest, toneColor.
- **Not seen on screen:** the in-session strips and dialogs need a live drill (not launched, per brief); covered by tests and type-check only.
- **Checks:** type-check clean · eslint clean on my files · full `npm test` 1496 passed / 9 skipped.
