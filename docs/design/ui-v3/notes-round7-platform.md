# Round 7 · platform (r7-platform)

All uncommitted. Production was only read. No new migrations from this agent.

| Item | What changed | Tests |
|---|---|---|
| P0 / board 11b funnel | **API:** `renewed` on `subscription_cycle` invoices (`FunnelEventRecorder::recordRenewal`, called from `PaymentController::handleInvoicePaid`); nightly `funnel:record-d7-returns` (04:10, `routes/console.php`): a user active (product-usage or funnel event) between day 7 and day 8 after sign-up gets `d7_return` once. Once-only list gains `first_match_synced`, `recording_enabled`, `d7_return`; `UserFunnelEvent::EVENTS` lists the board 11b names. **Desktop:** `postgame_opened` (per match, in `bindPostGameSessionToRecording`), `first_match_synced` (after a focus sync that uploaded ≥1 report), `recording_enabled` (with the first passed recording check). Existing equivalents kept: board `free_limit_hit` = existing `quota_limit_reached`; `riot_linked` = `account_linked`; `paid` = `subscription_started`. Web-only `profile_viewed` / `upgrade_viewed` belong in the web checkout (spec: send them from the profile and pricing pages via `POST /api/funnel-events`). | API `FunnelD7ReturnTest` (2), `FunnelRenewedTest` (1); desktop `funnel-events-board11b.test.ts` (3) |
| Board 13 Home states | `homeStateNote()` in `home-v3.ts`: **Early read · N matches** under 10 analysed matches ("Numbers show how many matches they come from until you have 10."), **Welcome back** after 14+ days ("Your last analysed match was 20 days ago…"). Whole numbers, real dates only. Shown above the coach line in `HomeV3`. State B (free questions used) needs the chat product decision. | `home-v3.test.ts` (+3) |
| Board 12 Between games | Main pushes `pregame:context` to the window while agent select is open (validated, deduped by lobby state, cleared when the session leaves PREGAME). New `coaching:pregame-view` IPC does a **GET** of `/api/progress/pregame-brief` (read-only: never sends a Discord DM, no AI — the API builds the brief from stored data; main-window sender check; inputs sanitised). `HomePregameV3` shows "Before this match · Jett on Ascent" with up to 3 real lines (focus point, lobby comp gap, agent history, form) — at most 4 reads per match. The post-match → next-match bridge is the existing focus panel ("game 2 of 3"); nothing extra added. | `pregame-view.test.ts` (3), `pregame-brief.test.ts` (3) |
| Board 7 side by side | `VodReviewComparison` already had full v3 styling (48 scoped rules) and v3 sub-components; finished the header hierarchy (back · map label · title), formatted map name in v3 (old branch keeps the raw value), legend swatches, filter row. Markup is still the shared template with v3 styling — marked R-styled in coverage. | — (visual; old branch byte-identical apart from the `v-else`) |
| Board 8b rank journey | Rank badges thinned on long ranges with `spacedByX()` (newest in a cluster wins; every change keeps its dot), so badges no longer overlap at 360 days. Range filter and focus-label clip were fixed in the final review. | `progress-chart.test.ts` (+1) |
| P0 shareable proof (slice 1) | "Save rank card" on the Home rank strip draws a 1200×630 card locally from the live/saved rank (rank, RR bar, last change, date, UPFORGE mark) and saves it as PNG through the existing `screenshots:save` path (userData/screenshots). Redraws without the rank icon if the CDN image taints the canvas. No server call, no paid feature. | `rank-card.test.ts` (2) |
| Cloud-only Matches scores | **API:** `CloudStorageController@index` adds `analysis_id` + optional `analysis {won, rounds_won, rounds_lost, kills, deaths, assists}` to analysed archives (owner-only joins: archive → analysis_log → matches, Valorant scoreboards only). **Desktop:** `CloudFile` gains the optional fields; `mergeFootage` gives cloud-only rows their `analysisId`; `MatchRowV3` uses the inventory's score. | API `CloudStorageTest` (+1); desktop `match-row.test.ts` (+2) |

## Checks
- Desktop: `npm run type-check` clean; `npm test` 1,789 passed, 9 skipped; eslint clean on changed files.
- API: full suite 1,083 passed, 7 failed — `DeadlockSteamSearchTest` (pre-existing) and 6 in `KnowledgeBankServiceTest` / `MatchCoachingContextServiceTest`, which belong to another round-7 agent's uncommitted knowledge-bank game-scope work (`KnowledgeBankService.php`, `MatchCoachingContextService.php`, migration `2026_10_30_210000_…`), not these changes.

## Deploy
- API: scheduler must run `funnel:record-d7-returns` daily; no migrations here.
- Desktop: version bump + tag for the funnel events, Home states, pre-game panel, rank card and cloud scores.

## Not done
- Web `profile_viewed` / `upgrade_viewed` (web checkout — spec above).
- Board 13 state B (free questions) — waits on the chat/questions product decision.
- Rank card has no player name (the strip has no profile data; add if wanted) and no "share to Discord" — PNG only.
- Compare is v3-styled shared markup, not rebuilt markup.
