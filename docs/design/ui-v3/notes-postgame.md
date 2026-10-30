# Notes — Post-game pop-up (agent-postgame)

## Built
- `src/views/v3/PostGameV3.vue`: the v3 pop-up (board 2). Presentation only, with no state of its own.
- `src/components/v3/postgame/post-game-v3.ts`: pure helpers: result word, tone, score, K/D/A, meta line,
  progress clamp, tone colour and full-portrait URL.
- Tests: `src/components/v3/postgame/post-game-v3.test.ts` (7) and `src/views/v3/PostGameV3.test.ts` (3, render).
- `src/views/PostGameView.vue`: switch only. The new `v-if="compactPostGameUi && uiV3"` branch renders
  `PostGameV3` with the same props and events as `PostGameCompactStatus`, plus the real summary and art.
  The old branch is unchanged.

## Data (all real; nothing invented)
- **Result, score and K/D/A:** `result.match_result`, `ally_score`, `enemy_score`, `kills`, `deaths`, `assists`.
  Each part is shown only when it is known.
- **Coach line:** `focusHero.headline`. The sub-line is `focusHero.subline` or `recurrence`. Falls back to `compactBody`.
- **Evidence line:** `sessionClipCount` and `compactScore`.
- **Art:**
  - Hero background: `mapSplashUrl` (CS2 gets its radar).
  - Cut-out: Valorant uses the agent `fullportrait.png`, derived from the same valorant-api display-icon URL.
    League uses the champion icon. Other games show no cut-out. An image that fails to load is hidden.
- **Behaviour kept as is:** primary (`handleCompactPrimary`), Web report (`viewFullAnalysis`), Dismiss and close
  (`dismiss`), the feedback flow (Yes, Not really, optional text, Send, Cancel), the preview mode, and fit-to-content
  height (the `contentRoot` ref is on the v3 wrapper).

## Design decisions
- **Score at D2, coach line at T3:** the window is compact (400px wide, height capped at 380 by
  `window:set-content-height`), so D1 136 and T1 28 don't fit. The line is clamped to 3 lines.
- **Status colours carry meaning, not brand:** in-progress bone, paused gold, done teal, error loss. Brand red appears
  only on the single primary button.
- **Hero wash:** only on the ready state, and only when the result is known.

## Needs from the lead
- **App.vue shows the old title bar on post-game routes in v3.** `TitleBarV3` is excluded there and falls through to
  the old `v-else-if="showTitleBar"` bar, which carries the old fonts, version text and orange top line. It is needed
  as the drag region for the frameless window. Suggest a v3 slim drag strip (mark + "Post-game", no glow) for
  `isPostGameRoute`.
- **Optional, main process:** the post-game window is 400×≤380. A slightly taller cap (about 440) would allow the
  focus-check pips from board 2. The focus-loop update payload isn't wired into the post-game view on origin/main yet.

## Checks
- `npm run type-check` passes.
- `npx eslint` passes on my files.
- 10 new tests pass, and the full `npm test` passes (1375 passed, 9 skipped).
- Screenshot: `/private/tmp/claude-501/-Users-adamdowning-Documents-GitHub-upforge/3880165e-589e-49a5-9230-bd37c8a39505/scratchpad/rework-shots/postgame-v3.jpg`.
