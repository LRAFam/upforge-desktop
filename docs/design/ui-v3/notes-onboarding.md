# Notes — Sign-in & onboarding (agent-onboarding, round 2)

## Built
- **Login** — `src/views/v3/LoginV3.vue` (presentational). `LoginView.vue` keeps all logic and passes props, models and events through a `v-if="uiV3"` switch.
  - Hero art at full bleed, one D2 title ("Back to your game"), email/password with a Show/Hide toggle, the error as `role="alert"`, and one skewed red "Sign in" button.
  - Below the button: Forgot, Create account, Help, Privacy, plus the minimise/close window controls.
  - The app only has email sign-in. There are no Discord, Google or Riot buttons, so I didn't add any.
- **Onboarding** — `OnboardingView.vue` changed in two places only: the `ob-v3` class on the root and `<OnboardingRailV3 v-if="uiV3">`. All step logic and markup are unchanged.
  - `src/components/v3/onboarding/OnboardingRailV3.vue` shows the art, a D2 title ("Set up your coach"), the five steps as numbered text with hairlines (current in red, done in teal), and the line "Recording can be finished later in Settings → Recording".
  - `onboarding-v3.css` restyles the existing wizard under `.ui-v3 .ob-v3`:
    - square corners and hairlines
    - step h2 becomes T1
    - text sizes mapped to type roles
    - flat red primary, outlined secondary
    - emerald → win, amber → gold
  - Compact windows (≤960px; the onboarding window is 720×600) get a band instead of the rail: "UPFORGE · SETUP", "01 / 05" and five progress segments. The preview badge becomes its own row there, so it no longer covers the footer button.
  - `onboarding-steps.ts` plus a test (4 cases) for the stepper state.

## Data
- Rail and band use only the existing `step`, `stepLabels` and `initializing` values.
- No profile or stats step was added, because onboarding doesn't load match stats. The copy stays honest.

## Gaps / for the lead
- The onboarding window layout is 720×600, so the full art rail only shows when the user widens the window. Consider a wider onboarding layout in `electron/main/window-layouts.ts` (lead-owned).
- Visiting `/login` applies the compact login layout (1040×780) to the shared window, and no renderer API can maximise it again. **The user may need to re-maximise the window.**
- `npm run type-check` fails in `electron/main/recordings-store-account-role.test.ts:21`, which isn't my file and is probably another agent's change in progress.

## Round 3 (agent-settings2, resumed)
- **Skew report:** no stray skew found. On the onboarding preview only `.uf-btn-primary` (and its counter-skewed span) is transformed. The "faint/missing" rail in earlier shots was a capture artefact: the window is 720 wide (rail body hidden below 960px), so the fade-in only starts after the screenshot resizes the view, and the backgrounded window repaints rarely. Use `scratchpad/analysis/shoot-steps.mjs` (sets size + focus first, turns animations off) for reliable shots.
- Step markup is v3 (`ob3-*`). Seen in preview: Sign in, Capture check (wide and 720×600 compact band). Your game / Game account / Your first match aren't reachable with this account (preview skips completed steps); covered by tests and markup review only.
- **For the lead:** TitleBarV3 (with the game switcher) shows on `/onboarding`. Consider hiding the game switcher there, since step 2 picks the game. Note: opening `/onboarding` snaps the window to 720×600; going back to /dashboard restores 1280, not maximised.
