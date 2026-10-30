# UI v3 — the rework rulebook

Every agent working on the rework reads this first and follows it exactly. The concept board
(claude.ai artifact "UpForge 24/7 Coach Concept", boards E, E1–E4, 1–25, P0–P6) is the visual reference.

## Switch
- `src/lib/ui-v3.ts` → `uiV3` (on in dev, off in prod; `localStorage uf.uiV3` = '1' | '0').
- The root element gets `.ui-v3 .uf-grain` when on. **All v3 styles are scoped under `.ui-v3`.**
- Each screen: the existing view renders its v3 version when `uiV3` is true and the old markup otherwise.
  Put the v3 screen in `src/views/v3/<Name>V3.vue`; screen-specific parts in `src/components/v3/<area>/`.

## Hard rules (from board E · Design rules)
1. **One hero per screen.** The thing that matters most gets the size; everything else steps back.
2. **Fewer boxes.** Group with space and 1px hairlines (`.uf-hair`, `.uf-hair-v`, `var(--uf-line)`).
   A raised surface (`var(--uf-raised)`) only for something clicked as a whole. Never a box inside a box.
3. **Square corners.** 0–2px radius. No rounded cards, no pills.
4. **Colour has a job.** `--uf-red` = brand, the ONE primary action, the focus. `--uf-win` / `--uf-loss` =
   win/loss data only. `--uf-gold` = best/personal best, with a star. Game accents one at a time with the logo.
   No glow, no gradient buttons, no gradient text, no decorative colour.
5. **Type roles only** (classes in `src/design/v3.css`): `uf-d1` score 136 · `uf-d2` title 40 caps ·
   `uf-d3` key number 36 · `uf-d4` inline number/result 26 · `uf-t1` the coach's sentence 28 (one per screen) ·
   `uf-t2` supporting 16 muted · `uf-t3` list item 15/600 · `uf-t4` meta 13 faint · `uf-label` section label
   12 caps (one per section). Max 3 levels per section. No other font sizes.
6. **Data inline, not in tiles.** Use `UfRoundsLine`, bars inside table rows, numbers in sentences.
7. **One image, used big.** Full-bleed hero art via `UfHeroBand`; agents break the frame. Not an image per card.
8. **The coach talks.** One plain sentence with the number in it, then one next step.
9. **Motion with purpose.** `uf-rise` / `uf-grow` / `uf-fill` once on arrival (delays `uf-d1s`…`uf-d6s`);
   `uf-live` only for things happening now. Reduced motion is respected by the CSS.

## Truth rules (non-negotiable)
- **Never ship example data.** The concept board uses example numbers; the app shows only real data from
  existing composables/IPC/API. When data is missing, show an honest empty state (what's missing + one action).
- Do not invent coaching claims. Reuse texts the API/AI already returns.
- Do not add new API endpoints or IPC channels. If a screen needs data that isn't available, design the
  empty state and write the gap in your notes file.

## Building blocks (`src/components/v3/`, owned by the lead — do not edit; ask in your notes)
- `UfIcon` (+ `uf-icons.ts`) · `UfButton` (variant primary | secondary | link) · `UfHeroBand`
  (art, agent, result, tone win|loss|none, meta, accent; default slot = D1 score/title; `#stats` slot)
- `UfStatRow` (items: value, caption, sub, tone) · `UfRoundsLine` (rounds: {won, marked}, selected, @select)
- Shell: `TitleBarV3`, `SidebarV3` (Coach /dashboard · Matches /recordings · Practice /training ·
  Progress /stats · Coaches /rosters · Squad /squad (members only) · Settings). The title bar has the game switcher — **screens must not
  render their own game tabs in v3.**
- Assets: `src/assets/games/*` (logos + card art), `src/assets/training/icons-png/*` (drill icons),
  `src/assets/ranks/*`, `src/assets/post-game/*`, `src/assets/hero-agents.webp`. Agent/map art via the
  existing helpers the app already uses (search the codebase; don't hard-code remote URLs).

## Ownership (one owner per file — never edit another area's files)
| Area | Owner | Files you may create/edit |
|---|---|---|
| Foundation & shell | lead | `src/design/*`, `src/components/v3/*.vue|ts` (base), `App.vue`, `main.ts`, `src/lib/ui-v3*` |
| Home (Coach) | agent-home | `src/views/DashboardView.vue` (switch only), `src/views/v3/HomeV3.vue`, `src/components/v3/home/**` |
| Post-game | agent-postgame | `src/views/PostGameView.vue` (switch only), `src/views/v3/PostGameV3.vue`, `src/components/v3/postgame/**` |
| Matches & Clips | agent-matches | `src/views/MatchesView.vue`, `src/views/ClipsView.vue` (switch only), `src/views/v3/MatchesV3.vue`, `src/views/v3/ClipsV3.vue`, `src/components/v3/matches/**` |
| Practice | agent-practice | `src/views/TrainingHubView.vue` (switch only), `src/views/v3/PracticeV3.vue`, `src/components/v3/practice/**` |
| Progress | agent-progress | `src/views/StatsView.vue` (switch only), `src/views/v3/ProgressV3.vue`, `src/components/v3/progress/**` |
| Settings & Team | agent-settings | `src/views/SettingsView.vue`, `src/views/SquadView.vue`, `src/views/RostersView.vue` (switch only), `src/views/v3/{Settings,Squad,Rosters}V3.vue`, `src/components/v3/settings/**`, `src/components/v3/team/**` |
| Review | reviewer | read-only; writes `docs/design/ui-v3/review.md` |

"Switch only" = add the `uiV3` import and the `v-if`/`v-else` around the existing markup. Reuse the view's
existing script/composables by moving logic into composables only if needed, without changing behaviour.

## Done when (each screen)
- Matches its board(s) in structure and hierarchy; follows every hard rule and truth rule.
- Real data, honest empty/loading/error states, keyboard reachable buttons, `aria` labels on icon buttons.
- `npm run type-check` clean · `npx eslint <your files>` clean · your new tests pass (`npx vitest run <your tests>`)
  · the full `npm test` still passes.
- Screenshot via `scratchpad/rework-shot.sh <route> <name>` (takes a lock; the app is shared) and look at it.
- Notes file `docs/design/ui-v3/notes-<area>.md`: what you built, data used, gaps, anything you need from the lead.
- **Do not commit.** The lead integrates and the user decides on commits.

## Round 2 ownership (added after round 1)
| Area | Owner | Files you may create/edit |
|---|---|---|
| Match page (VOD review) | agent-matchpage | `src/views/VODReviewView.vue` (switch only), `src/views/v3/MatchPageV3.vue`, `src/components/v3/matchpage/**` |
| Coaching reviews | agent-reviews | `src/views/CoachingHistoryView.vue` (switch only), `src/views/v3/CoachingReviewsV3.vue`, `src/components/v3/reviews/**` |
| Round facts → Home | agent-facts | `electron/main/match-report-sync.ts` (+test), `electron/main/focus-state.ts` (+test), `src/lib/focus.ts` (+test), `src/views/v3/HomeV3.vue`, `src/components/v3/home/**` |
| Matches tidy + alt tags | agent-library | `src/views/RecordingsView.vue`, `src/components/v3/matches/**`, `src/views/v3/MatchesV3.vue` |
| Sign-in & onboarding | agent-onboarding | `src/views/LoginView.vue`, `src/views/OnboardingView.vue` (switch only), `src/views/v3/{Login,Onboarding}V3.vue`, `src/components/v3/onboarding/**` |
| Practice from focus | agent-practice2 | `src/views/v3/PracticeV3.vue`, `src/components/v3/practice/**` |
Shared rule still applies: only your files; `npx eslint <files>` (never `npm run lint`, it auto-fixes unrelated files); no commits.

## Round 3 (coverage) — see docs/design/ui-v3/coverage.md
New base component: **`UfDialog`** (`src/components/v3/UfDialog.vue`): `open`, `title`, `kicker`, `width`, `persistent`, `@close`, default slot = body, `#actions` slot (max one `UfButton variant="primary"`). Every v3 modal uses it. It teleports to body and carries `.ui-v3` itself.
Pattern for shared old components used by BOTH UIs: add a `v-if="uiV3"` branch with v3 markup inside the same file (keep the old branch byte-identical), or create a v3 counterpart and switch at the call site you own.
| Area | Owner | Files |
|---|---|---|
| Match page internals + comparison | agent-vod | `src/components/vod-review/**`, `src/components/analysis/**`, `MatchSpatialMinimap.vue`, `TacticalIntelBrief.vue`, `MatchRecapPanel.vue`, `TimingComparisonPanel.vue`, `coaching-history/MatchSavedReviews.vue`, `src/components/v3/matchpage/**` |
| Practice in-session + tabs + trainer | agent-train | `src/views/TrainingHubView.vue`, `src/components/training/**`, `TrainerResultsView.vue`, `ValorantCalibrationView.vue`, `src/components/v3/practice/**`, `src/views/v3/PracticeV3.vue` |
| Team incl. coach side | agent-team | `src/components/rosters/**`, `src/components/squad/**`, `src/views/v3/{Squad,Rosters}V3.vue`, `src/components/v3/team/**` |
| Shell banners + shared dialogs | agent-shell | `src/App.vue` (banners/prompts only), `components/dashboard/DashboardBanners.vue`, `components/shared/{RiotLinkPromptModal,TrimRangeModal,DemoAttachPickerModal,CloudUsageNotice}.vue`, `AchievementManager.vue`, `AchievementToast.vue`, `PaymentFailedAlert.vue`, `DemoAttachGuide.vue`, `src/design/v3.css` (append-only, shell section) |
| Library & utilities | agent-library2 | `src/views/ClipsView.vue` (modals/toast), `CloudStorageView.vue`, `shared/StorageAddonPicker.vue`, `PerformanceView.vue`, `SplashView.vue`, `OverstepView.vue`, `src/components/v3/matches/**` |
| Settings panes + onboarding steps | agent-settings2 | `src/components/settings/**`, `src/views/OnboardingView.vue`, `src/views/v3/SettingsV3.vue`, `src/components/v3/settings/**`, `src/components/v3/onboarding/**` |
Nav changes (SidebarV3/TitleBarV3) → ask the lead in your notes. Update your rows in coverage.md when done.

**Scoped CSS gotcha:** never write `:global(.ui-v3) .foo` in a scoped `<style>`: Vue compiles it to bare `.ui-v3` and it hits the app root (it collapsed the window once). Write `.ui-v3 .foo`, or `.ui-v3 :deep(.foo)` for child or teleported content.

## Loading & speed (round 4) — every screen
Measured on production: each API call takes 0.7–2.6 s, and screens wait for everything before drawing, then jump.
1. **Cache-first:** load screen data with `useStaleLoad(key, fetcher)` (`src/lib/stale-cache.ts`). Repeat visits draw the last data instantly and refresh quietly. Key = screen + game + id (e.g. `home:valorant`, `match:123`). Scoped to the signed-in user and cleared on sign-out by the lead's App.vue wiring.
2. **Skeleton in the real shape:** first-ever load shows `UfSkeleton` blocks with the same size and position as the content (hero height, row heights, rounds strip). Never a centred spinner or "Loading…" text alone, never a blank screen, never layout that moves when data lands.
3. **Fade, don't jump:** content replacing a skeleton gets `.uf-reveal` once. A background refresh shows at most `.uf-refreshing` (a 1px line), never a skeleton over existing data.
4. **Don't wait on the slowest call:** parallelise independent calls (`Promise.all`/separate loads), render each section when its own data arrives, and never block a screen on optional data (e.g. FACEIT connection, usage, percentiles).
5. **Errors keep data:** a failed refresh keeps the cached data and shows a quiet "Couldn't refresh · Retry" line; only a failed first load shows the error state.
6. **Production is read-only while testing:** the app is signed in to the user's REAL account. Never save notes/reviews, delete, request analyses (costs credits), submit feedback, change settings, link/unlink accounts or sign out. Navigate and read only.

## Copy rule: counts in sentences
Things you can count (deaths, kills, rounds, games) appear as whole numbers in sentences: "died before 14:00 in 3 of your last 4 games, 6 deaths in total", not "died 1.5 times". Averages are fine in stat rows with a unit label ("4.1 deaths / game", "K/D 1.24"), never as "you did X 1.5 times".


## Squad vs Coaches — two different features (never merge them)
| | **Coaches** (coach rosters / Coach Hub) | **Squad** (API name: `Team`) |
|---|---|---|
| What | A student joins a coach's roster — Community (free) or paid membership (default $9.99/mo, paid to the coach via Stripe Connect) — then sends matches for review and gets notes back. Coaches run their roster, queue and notes. | A paid group plan: 4 seats ($79/mo, 30 shared credits) or 6 seats ($109/mo, 45 credits); annual = 10× monthly. Members share AI reviews/credits and see each other's matches. |
| Who pays | Student → coach (coach optionally buys Coach Pro $49) | Squad owner → UpForge |
| API | `/api/coach/roster*`, `config/coach_hub.php` | `/api/teams/*`, `app/Models/Team.php` |
| Web | `/my-coaches`, `/coach-dashboard/roster`, `/coaches/{id}#join-roster` | `/team` (titled "Squad") |
| Desktop v3 | **Coaches** → `/rosters` (every game, review badge). Code: `src/components/v3/coaches/**`, `roster-flow/**`, `coach-notes/**`, `components/rosters/**`. | **Squad** → `/squad`, in the nav only for squad members on Valorant (shipped rule). Non-members: one row in Settings › Account. Code: `src/components/v3/squad/**`, `components/squad/**`. |
Copy: roster copy says "Coaches", never "Team". Squad copy never mentions "the coach" and says it's the paid squad plan.
