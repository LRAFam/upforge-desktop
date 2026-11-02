# Audit fixes 2 Nov — Matches · Coaching reviews · Clips · Cloud storage · Needs-you

## Changed
- **New** `src/components/v3/matches/match-meta.ts` (+test): one match date (`matchDateMs` = earliest of recorded/uploaded/analysed), real date groups (Today · This week · Last week · month), `formatMatchDate`, `matchMapLabel`/`matchMapArt` (de_vertigo → "Vertigo" + CS2 card art fallback), `dedupeAnalysesByMatch`.
- **New** `src/components/v3/matches/cloud-storage-v3.ts` (+test): capacity sentence/facts and honest library count label.
- `MatchRowV3.vue`: fixed columns (container query for narrow windows): result (win teal / loss red) + K/D/A, UpForge score (helper, /1000), one-line status ("Analysed · Cloud"), actions right-aligned with a reserved delete slot so Review lines up. "Not analysed" / "No scoreboard" instead of an empty column.
- `MatchesTabsV3.vue`: one H1 "Matches"; tabs "All matches · Coaching reviews · Clips" (no repeated label).
- `MatchesV3.vue`: date groups by match date; one filter bar (status left, game/account right) styled secondary (13px, bone 1px underline, no red); game filter defaults to the title-bar game (All still available; empty state offers "Show all games"); CloudUsageNotice removed → one line "29 Valorant recordings · 36.10 GB cloud storage used" (+ "on this PC" only if > 0). Provides archive dates to Reviews.
- `useFootageLibrary.ts`: v3 default game = primary game (follows the title bar); v3 groups never auto-collapse.
- `useCoachingHistory.ts`: v3 dedupes re-runs of the same match (`match_id`), keeps newest scored run; deep links to a removed duplicate open the kept one.
- Reviews (`ReviewListV3`, `ReviewFiltersV3`, `ReviewDetailV3`, `reviews-v3.ts` +test): map · agent order, same date groups/format as Matches, match date via archive upload time, UpForge score (no letters, avg/trend/hero too), The Range dropped from the map filter, map filter scrolls on one line, secondary filter style, hero meta hides rank "Unknown".
- `ClipsView.vue` (v3 only): merged count line, no CloudUsageNotice, secondary filter style, real empty state (F9 → clip drawn with type, "Browse N cloud clips", "Show clips from all games"), "No clips match this filter" state.
- `CloudStorageView.vue` (v3): sentence no longer repeats the GB; facts only when known/non-zero (no "Size unavailable included"); Refresh button never reads "Refreshing…" — background refresh is the `.uf-refreshing` line; rows use map art (no agent face) and map titles; count reads "51 files (recordings and clips) · every game"; `?kind=clip` supported.
- `DashboardActionQueue.vue`: new `v-if="uiV3"` branch (old branch untouched): hairline rows, square, one red "Run AI analysis", Watch secondary, rest links, no pills/gradients. `DashboardNeedsYouPreviewView.vue`: v3 wrapper.

## Root causes (evidence)
- **Empty middle column**: cloud-only rows only get a score when `archived_recordings.analysis_log_id` is set. Prod cloud list: 3 of 29 recordings carry `analysis_id`. API gap: `upforge-api/app/Http/Controllers/API/CloudStorageController.php` `analysisSummaries()` joins only via `ar.analysis_log_id`; it should fall back to `ar.match_id` → `matches`, and/or read the score from `ar.match_data` (finalScore/finalStats), which the desktop uploads. Not guessed on the desktop.
- **5 Sept vs 24 Sept**: Matches used the archive `created_at` (upload time; e.g. 1 Jul / 12 Jun are bulk-upload batches 1–3 min apart), Reviews/Home used `analysis_logs.created_at`. Analysis 639 (Summit 13–10) was created 24 Sept but its archive was uploaded 5 Sept, so it was re-analysed later. The real `matches.match_date` exists but neither `/api/analysis/recent` (`VODAnalysisService::getRecentAnalyses`) nor `/api/account/cloud-storage` returns it. API fix: return `matches.match_date` as `played_at` in both. Desktop now uses the earliest known timestamp on Matches + Reviews.
- **Duplicate Fade · Ascent**: analyses 632/633/634 share match_id `ef4d4f28…` (re-runs).
- **Counts**: Cloud 51 = 29 recordings + 22 clips across all games; Matches counts recordings for the selected game; Clips counts clips on this PC (clips.get is local only). Labels now say so.

## Verified
`npm run type-check` clean · `npx eslint <files>` exit 0 · `npx vitest run` 353 files / 2111 tests pass. Screenshots of /recordings, coaching, clips, cloud-storage, needs-you preview (narrow 1100px window too). In-page game filter clicked locally only; title-bar switcher untouched; nothing saved.

## Left / for the lead
- **Home** still dates the last match by analysis `created_at` (says 24 Sept); agent-home should use `matchDateMs` / `reviewPlayedAt`.
- The filter-tab secondary style is duplicated as `:deep` overrides in 4 files; suggest moving it into `UfTabs size="filter"`.
- `components/v3/games/display-names.ts` (shell agent) also maps CS2 names; merge with `matchMapLabel`.
- CS2 analyses have no rounds/score in the list, so CS2 rows show "No scoreboard".
- Cloud storage Game/Sort are still native `<select>`s.
