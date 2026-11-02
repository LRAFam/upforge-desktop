# Audit fixes — Match page / VOD review + Starting report (2 Nov 2026)

## What changed
| # | Finding | Fix | Files |
|---|---|---|---|
| 1 | Internal confidence wording in the review panel | v3 no longer shows "Clip observation: high · behaviour…", "(high)" after peek/crosshair/move, "· high confidence" on moments and behaviours, or "Observation limits". Low-confidence or obscured clips get one plain line ("Hard to see in this clip…"). Mechanics parts the AI marked low/unknown are left out. Caveats moved under the existing "Why this moment?" toggle. Coaching text unchanged. Classic UI untouched. | `analysis/DuelMomentCards.vue`, `analysis/AnalysisReviewDetails.vue`, `analysis/review-panel.ts` (+test) |
| 2 | Panel density | v3 panel order: human coach notes (if any) → AI synthesis → **Moments to watch** (top 2: observed lost duels with a "Try:" fix, clear clips first, then weight) → notebook → one **More detail** fold (Full review, other moments, extra coach notes) with a plain summary ("Full review · 9 more moments"). Notebook stays one mounted instance (CSS `order`), so the placement test still holds. "More from the coach" drops the sentence the header already shows. | `vod-review/VodReviewBody.vue`, `analysis/review-panel.ts` |
| 3 | 13–10 shown twice | "W–L rounds" stat hidden when it equals the big score. | `matchpage/MatchPageHeaderV3.vue`, `match-page-v3.ts` (+test) |
| 4 | "Coach notes" vs "Notes" | Not Home vs Matches: the label flipped to "Coach notes" when the coach review loaded, and `hasCoachFeedback` also counted the student's own question. Now always **Coach notes**; the "new" badge only when a coach actually wrote back. | same |
| 5 | Two nav systems | Right side is now one icon-only toolbar (round log, trim, theater, shortcuts, workspace/layout) with `aria-label` + title, faint colour, a hairline separating it from the tabs. | `MatchPageHeaderV3.vue` |
| 6 | Empty grey bar above rounds | It's the coach-sentence skeleton while coaching detail loads (measured ~3 s on archive `ff5364de…`). Root cause of the long wait: the header waited for coaching detail **and** the coach review (2 sequential calls). Now the detail draws on its own, is cache-first (`match-detail:<id>`, repeat visit: no skeleton — measured), and the skeleton has the row's shape (chat icon + text line) so it reads as loading. | `composables/useVodReview.ts`, `MatchPageHeaderV3.vue` |
| 7 | Round strip | Lost rounds = muted `--uf-loss` (45%); no outline box on R1 — the current round is marked by a bold number + brighter bar, and nothing is "selected" at 0:00. Done via `:deep` in my header (UfRoundsLine untouched). | `MatchPageHeaderV3.vue` |
| 9 | Starting report | Share decimals in AI sentences ("0.141", "0.312") rewritten as whole percents — only decimals matching this report's own share values (avg/best/worst/focus). H1 → `uf-d2` caps. One `uf-t1` sentence, rest `uf-t2`. Two-column layout (container query ≥ 860px): text left, **Your numbers** right (sticky) with a bar per metric showing the player's own worst↔best and the average, plus "worst X · best Y". | `views/v3/StartingReportV3.vue`, `lib/starting-report.ts` (+test) |
| 10 | Scores | Category scores (API 0–10) now shown out of 1000 via `upforgeScore` with tone colour. No other scores on these screens (MatchReportV3 `view.score` is the round score). | `AnalysisReviewDetails.vue`, `review-panel.ts` |

## Verified
- `npm run type-check` clean · `npx eslint` on all 12 changed files clean · `npx vitest run` 353 files / 2111 tests pass (new: `review-panel.test.ts`, audit cases in `match-page-v3.test.ts`, `starting-report.test.ts`).
- Screenshots (read-only): `/vod-review?timelineId=639`, the archive match, `/starting-report/valorant` at 1000 and 1600 px wide.
- Note: the renderer once kept a stale `VodReviewBody` after HMR; I did one `location.reload()` of the renderer (under the shot lock), not an app restart.

## Asks for the lead
- **UfRoundsLine default** (so every screen matches the match page):
  `.uf-round-bar { background: color-mix(in srgb, var(--uf-loss) 45%, transparent); }`
  `.uf-round-bar.is-selected { outline: none; filter: brightness(1.35); }`
  `.uf-round[aria-pressed='true'] .uf-round-n { color: var(--uf-bone); font-weight: 600; }`
  Then the `:deep` rules in `MatchPageHeaderV3.vue` (`.uf-mp-rounds …`) can go.
- **Icons for `uf-icons.ts`**: list (round log), expand (theater), keyboard, columns (layout), scissors (trim). I used inline SVGs in the header meanwhile.

## Left / gaps
- **8 Minimap**: the app already uses valorant-api `maps/<uuid>/displayicon.png` (`getMapMinimap` → `MatchSpatialMinimap`). That image *is* the flat grey layout; valorant-api has no coloured minimap. A coloured map needs new art. `MatchSpatialMinimap.vue` isn't in my files anyway.
- **Decimals root cause** is in the AI/API starting-report writer: it puts raw share values (0.141) in sentences. Fix there (format shares as whole %); the desktop rewrite is a safe display guard.
- **Rank average** for "Your numbers": not in the API response (`facts.rank` is null; metrics have avg/best/worst only). Bars show the player's own spread; no benchmark invented.
- **11 `/report/:matchId`** (MatchReportV3) is reachable: `MatchRowV3` (Matches list) and the match page header "Match report" link, both via `matchReportPath` (Valorant/LoL/Deadlock by match id, CS2 by recording). Not orphaned.
- Category score scale guess: values ≤ 10 are treated as 0–10, larger as 0–100.
