# UI v3 — review 2

Scope: everything since review 1 (match page, coaching reviews, login/onboarding, Home round facts,
practice-from-focus, RecordingsView ↔ useFootageLibrary, main-process changes, ALT tags), plus a re-check of review 1.

Checks run: `npm run type-check` clean · `npx eslint` on every changed/new .ts/.vue file clean ·
`npm test` 1433 passed, 9 skipped, 0 failed. Screenshots: r2-home, r2-matches, r2-reviews, r2-practice
(scratchpad/rework-shots/r2-sheet.jpg). Test account has no data, so only empty states were seen on screen.

## Review 1 re-check
- P2-1 banners: OBS banner + CloudUsageNotice restyled (v3.css) — fixed.
- P2-2..5, 7: UfTabs everywhere, header order, empty-state titles, type scale, Settings account — fixed.
- P2-6 missed focus = loss colour, P2-8 Home live status — fixed.
- P2-9 RecordingsView now uses useFootageLibrary (one source of logic) — fixed, with 8 behaviour tests.

## P1 — must fix
None.

## P2 — should fix
1. **Home step numbers still red** — `src/views/v3/HomeV3.vue` ("What happens next" 01/02/03). Red is for the one action and the focus;
   rule 4. Fix: number colour `var(--uf-faint)` (Practice already did this in review 1 P3).
2. **Persisted `account` isn't sanitised on read** — `electron/main/focus-state.ts:~34` spreads `latest` as stored; only `rounds`
   is sanitised. A tampered file could put any value in `latest.account`. Low impact (UI only checks `?.is_main === false`), but
   for consistency: `account: typeof latest.account?.is_main === 'boolean' ? { is_main: latest.account.is_main } : null`.
3. **Raw hex in the reviews trend chart** — `src/components/v3/reviews/ReviewDetailV3.vue:177,178,183` use `#22a99b/#e8505b`.
   Fix: `style="stop-color: var(--uf-win)"` / `:style="{ stroke: chartData.up ? 'var(--uf-win)' : 'var(--uf-loss)' }"` so tokens stay the single source.

## P3 — polish
- `src/views/v3/HomeV3.vue:253` `.home3-dash { color: #2a3038 }` — raw hex; use `var(--uf-line-2)` or a token.
- `src/components/v3/reviews/ReviewListV3.vue:123` skeleton uses a gradient shimmer; acceptable for loading, but a flat
  `var(--uf-raised)` block would match "no decorative gradients" more strictly.
- `src/views/v3/MatchPageV3.vue:102–116` restyles legacy VOD components via `:deep()` with !important-free overrides — fine,
  but the inner components keep off-scale sizes (noted by the author). Needs an owner for `src/components/vod-review/**`.
- Onboarding window is 720×600, so the full rail never shows by default (`electron/main/window-layouts.ts`, lead's file).

## Security / privacy (main process)
- `recordings:list-all` `allAccounts` is checked with `=== true`; any other value takes the old path. OK.
- `getAllLinked()` only includes Valorant rows matching one of the user's linked Riot IDs; unlinked IDs (shared PC) stay
  hidden — covered by `recordings-store-account-role.test.ts`. With **no** linked accounts it falls back to `getAll(null)`,
  identical to today's behaviour. OK.
- `riotAccountRole` tags only exact (case-insensitive) linked matches; rows without a Riot ID get null, never "main". OK.
- `stats:rr-history` range is whitelisted (`7d` | `all`, else `30d`) before it reaches the URL. No injection. OK.
- `deriveRoundFacts` / `sanitizeRoundFacts` cap rounds at 40, type-check every field, and return null rather than guess. OK.

## Switch-off regressions
`git diff origin/main` of LoginView, OnboardingView, CoachingHistoryView, VODReviewView, DashboardView, etc.: changes are
`v-if="uiV3"` / `v-else` wrappers and imports; old markup untouched. RecordingsView's script moved into the composable with
the same behaviour (tests + author's switch-off screenshot). `listAll` passes `allAccounts` only when `uiV3` is on. OK.

## Test quality
New tests assert behaviour (real Bind fixture → 9–13, 8 first deaths, 1 won; unlinked Riot IDs hidden; unknown focus metric →
no drills; tampered state dropped), not implementation details. Good.
