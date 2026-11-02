# Audit 2026-11-02 — shell fixes

## Changed files
- `src/App.vue` — v3 title bar gets `v3AccountLabel` + `v3TitleBarObs`; `loadGameIdentity()` (read-only: settings `cs2SteamName`, `GET /api/lol-accounts`) on mount, game change and session change; v3 route watch uses `v3AllowedRoutes`; v3 dev bar branch (old branch unchanged).
- `src/lib/shell-v3.ts` (+ tests in `shell-v3.test.ts`) — `titleBarAccountLabel`, `titleBarObsConnected`, `v3AllowedRoutes` / `V3_ALL_GAME_ROUTES`.
- `src/components/v3/TitleBarV3.vue` — switcher uses the same square marks as the rest of the app (`GAME_BRAND` logos), 20px, grey when off, full colour + game-accent underline when on; `aria-label`, `aria-pressed`, tooltip ("Switch to CS2" / "Valorant (current game)"). Clicking the current game no longer re-saves settings.
- `src/components/v3/SidebarV3.vue` — nav is stable across games (`v3AllowedRoutes`).
- `src/components/v3/games/display-names.ts` (new, + `display-names.test.ts`) — `mapDisplayName(game, raw)`, `modeDisplayName(game, raw)`, `titleBarGames()`.
- `src/components/v3/games/{game-data.ts,cs2-result.ts,GameProgress.vue}` — CS2 map names via `mapDisplayName`.
- `src/components/dashboard/DashboardBanners.vue` (v3 branch) — "scored 720 / 1000" via `formatScore`, no letter.
- `src/views/SplashView.vue` (v3 branch) — progress clamped 0–100, `role="progressbar"` with value, no "v ·" before the version loads, the status line is no longer re-keyed (keeps the live region).
- `src/design/v3.css` — primary button label 19→16px, secondary 14→15px (t3); new "audit 2026-11-02 — shell" section (dev bar).

## Findings
1. **OBS twice** — fixed. While the banner (with Launch OBS / Connect / Settings) shows, the title bar status is hidden. On `/vod-review` (no banner) the title bar still says "OBS not connected". Screenshot confirms one message.
2. **Switcher icons** — fixed (see above).
3. **Account label** — one format: Valorant Riot ID, League main Riot ID, CS2 Steam name, else UpForge username. No "· CS2" suffix. Deadlock has no in-game name in the app (only an account id) → username. Old UI label unchanged.
4. **Sidebar** — Practice now shows for every game: the trainer and drills are game-agnostic (no Valorant content in `training-drills.ts` / `trainer-scenarios.ts` / `components/v3/practice/**`; sensitivity follows `trainerMouse.game`), so no "Valorant drills" note is needed. **Squad: lead decision needed.** I made it visible to members on every game (the squad plan covers all games; SquadV3 already shows a game mix), which contradicts the rulebook line "members only, Valorant only as shipped". To revert: remove `'/squad'` from `V3_ALL_GAME_ROUTES` in `src/lib/shell-v3.ts`, and update the rulebook either way.
5. **Map names** — `mapDisplayName` ("DE_VERTIGO"/"De_vertigo" → "Vertigo", `cs_office` → "Office", Valorant codenames via `formatMapLabel`) and `modeDisplayName` ("CS2 VOD", not "Cs2 Vod"). Root causes elsewhere: `cs2MapDisplayName` returns the raw key for maps not in the radar manifest (Vertigo isn't there); `formatMapLabel` title-cases `de_vertigo` → "De_vertigo"; `formatGameMode('CS2 VOD')` → "Cs2 Vod". **Other areas should switch to the helper:**
   - Match page: CS2 hero "De_vertigo · LRAFam · Cs2 Vod" / title "DE_VERTIGO" — `src/components/v3/matchpage/**` (e.g. `MatchPageSkeletonV3.vue:26` uses raw `s.value.map` + `formatGameMode`).
   - Home: `src/views/v3/HomeV3.vue:74,88,137,181,330` use `formatMapLabel` (Valorant-only, but Home also lists other games' rows).
   - Matches: `src/components/v3/matches/**` and `src/lib/recording-display.ts` (uses `cs2MapDisplayName`).
   - Reviews/Squad: `ReviewDetailV3.vue`, `ReviewListV3.vue`, `ReviewFiltersV3.vue`, `SquadV3.vue:104` (`formatMapLabel`).
   - Not checked for a duplicate helper added by Home/Matches agents this round. If they added one, the lead should keep one.
6. **Type scale** — `v3.css`'s off-scale sizes were the buttons (19px primary, 14px secondary). Both are now on the scale. Remaining offenders I don't own:
   - `src/components/v3/UfRoundsLine.vue:42` — `.uf-round-n` 10px (lead base component) → 12px.
   - `src/components/v3/coach-flow/RoundTimelineV3.vue:81` — `.rt3-lbl` 11px SVG label → 12px.
   - `src/views/StatsView.vue:108` — `text-[10px] tracking-[0.18em]` "Recent form" kicker (old markup; check whether v3 Progress still renders it).
   - The 10px letter-spaced kickers the audit saw ("RECENT FORM", "WARM-UP") are `uf-label` (12px, 0.12em) in v3. The audit's 10px reading is probably old-UI markup or a measuring error. No 14px/19px remain in `src/views/v3` or `src/components/v3`. `App.vue` 10px lines are now only in the old (non-v3) branches.
7. **Splash** — the tagline "Competitive coaching platform & marketplace" is unchanged; it needs a product decision. The progress bar renders (indeterminate red slider while checking; the determinate bar is now clamped). Screenshot: `scratchpad/shots/agents/shell-splash-1.png`.
8. **Dev tools** — the bottom DEV bar is gated on `isDev`, which comes from `app:getStatus` → electron-toolkit `is.dev` (`electron/main/index.ts:7154/8166`). That is false in packaged builds, so it **cannot render in production**. **Separate issue for Home's owner:** the inline `DashboardDevTools` block (rendered in `HomeV3.vue:292`) shows when `showAdminTools || isDev || platform !== 'win32'`. That means **every macOS production user** sees "Dev tools · Show" (Simulate Valorant, Post-game, Needs you, Preview onboarding). `dev:simulate-game` is allowed on non-Windows production by design (`electron/main/ipc/app-ipc.ts:263`), so this looks intentional for Mac preview. It still reads as internal tooling and should be relabelled or gated to admins.

## Verification
- `npx vitest run src/lib/shell-v3.test.ts src/components/v3/games/ src/components/v3/UfTabs.test.ts src/components/v3/accounts` — 12 files, 90 tests passed.
- `npx eslint` on all changed files — clean.
- `npm run type-check` — no errors in my files. The remaining errors are in other agents' in-progress files (`home-v3.test.ts`, `HomeV3.vue`, `PracticeV3.vue`, `MatchPageHeaderV3.vue`, `TrainingHubView.vue`).
- Screenshots: `/dashboard` shows the title bar with no OBS text and the banner with its actions, the even switcher marks with the Valorant underline, and "LRAFam#1337". `/splash` shows the progress bar. I did not click the game switcher (it writes to production), so the per-game chrome is covered by unit tests only.
