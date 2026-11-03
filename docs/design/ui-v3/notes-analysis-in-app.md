# Analysis results open in the app (fix/analysis-in-app)

Ticket: "my analysis takes me from the app to the website". Results now open **inside the app**; upforge.gg is
only a quiet secondary link. Worktree `upforge-wt/analysis-in-app`, branch `fix/analysis-in-app` (not committed).

## Root cause (every current user)
"Coaching ready" OS notification → `dashboard:open-latest-analysis` → `useDashboard.openAnalysis(id)` →
`window.open(desktopVodResultsUrl(...))` = always the website. The same `openAnalysis` drove Home banner
"View results". The listener also only existed while Home was mounted.
Second leak: the bell's `analysis_complete` item went to `/<game>/results/<id>` on the web.
(`autoOpenBrowser` was a pre-2.5.61 default only; kept as a small one-time migration.)

## One destination helper — `src/lib/open-analysis-in-app.ts`
- `openAnalysisInApp(router, analysisId)` (desktop VOD analysis id, any game):
  match page `/vod-review?timelineId=<id>` when the timeline loads → else Coaching reviews
  `/recordings?view=coaching&analysis=<id>` (row selected). Never the browser.
- `openLolAnalysisInApp(router, row)` (League stats analysis): `/report/<riot match id>?game=lol`.
- `openDeepLinkAnalysis` for `upforge://analysis/...` (League: stats analysis first, like the web page; then VOD).

## Flow map (after this change)
| Entry point | Valorant | CS2 | Deadlock | League |
|---|---|---|---|---|
| "Coaching ready" notification (live + reconciled + resumed) | match page | match page | match page / Coaching reviews | match page |
| Bell › analysis complete | match page (else reviews) | same | same | same |
| Post-game window (v3) | primary "Review coaching" → match page; secondary link "Open on upforge.gg" | same | same | same |
| Post-game "ready" without an analysis | Valorant: `/report/<match>`; others: Coaching reviews | | | |
| Home recent rows / "open last match" (openGameAnalysis) | match page | desktop recording → match page; web-demo review → Coaching reviews | Coaching reviews | match page |
| Home (game stats) League "Report ready" rows | — | — | — | `/report/<id>?game=lol` |
| Home replay files › Analyse / View (Deadlock) | — | — | in-app review dialog (DeadlockReviewV3) | — |
| Progress › League reviews | — | — | — | `/report/<id>?game=lol` |
| Progress › Deadlock replay reviews | — | — | review dialog (unchanged) | — |
| Matches rows / Coaching reviews | already in-app (unchanged) | | | |
| Coaches (send/notes) + My bookings › paid review | match page with coach notes, else reviews (was web for non-Valorant) | | | |
| `upforge://analysis/<game>/<id>` | match page / reviews | same | same | League report, else match page |
Before: notification, bell, Home banner, Deadlock replay upload, League rows, Deadlock/CS2-demo Home rows, Valorant
"processing" rows and non-Valorant coach/booking links all opened upforge.gg.

## Deep link for older app versions (web side must match)
`upforge://analysis/<game>/<id>` — game ∈ `valorant|cs2|deadlock|lol` (lowercase preferred; case tolerated),
id = `^[1-9]\d{0,9}$` (the same id as `upforge.gg/<game>/results/<id>`), no query, no fragment, optional trailing `/`.
Parsed in `electron/main/deep-link.ts` (allow-list; max 256 chars; `%`, whitespace, `#`, `\`, dot segments, user/port refused),
held until a signed-in renderer takes it, routed by `deep-link-route.ts` → App.vue → `openDeepLinkAnalysis`.
Gap: Deadlock/CS2 web-demo results use a job id (not digits) on the web — not accepted; tell the web agent to show the
button only for numeric ids.

## Other changes
- Notification body: `${score}/100` → `matchScore` wording ("UpForge score 640" / "Coach rating 7/10"); activity log too.
  Resumed-poll completion now uses the same clickable "Coaching ready" notification (was a non-clickable one).
- `autoOpenBrowser`: check is now `=== true`; one-time migration `autoOpenBrowserInAppV1` turns stored `true` off;
  toggle kept, relabelled "Also open results on the website".
- Post-game v3 secondary button → `variant="link"`, label "Open on upforge.gg". Classic "Open full report" → in-app.
- "View on web →" on Home/Progress game summaries → "More on upforge.gg →" (game dashboards, web-only; still secondary).
- App.vue (lead file): small addition — global `dashboard:open-latest-analysis` listener + deep-link `analysis` branch.

## Left as is (web-only or classic UI)
- Classic panels: `DeadlockDemoPanel`, `LolStatsPanel`, `CS2StatsPanel`, `CS2SetupPanel` still open the web (classic UI is opt-in; v3 report pages don't style there).
- DeadlockReviewV3 "Full report on the web" (secondary link, fine). Squad teammate activity → web share/results (other users' analyses).
- Coach-side review feed, playstyle, roadmap, billing, account → web-only features.
- League: `/report` shows facts + AI notes, not the full stats-analysis coaching (LolMatchCoaching lives on match page / Coaching reviews). Suggest the lead adds `LolMatchCoaching` to MatchReportV3 for League.

## Verify
type-check clean · eslint on changed files clean · full vitest: 388 files / 2337 tests pass.
New tests: `src/lib/open-analysis-in-app.test.ts`, `src/lib/analysis-ready-copy.test.ts`,
`electron/main/auto-open-browser-migrate.test.ts`, deep-link parser + route tests, bell target test.
Screenshot (main checkout = current behaviour): Coaching reviews with a selected analysis renders in-app —
scratchpad/shots/agents/analysis-inapp-reviews-1.png.
