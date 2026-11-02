# Deadlock audit and fixes (2026-11-02)

Seen as a Deadlock player with `gameshot.sh Deadlock <route>` (dev build, real account, read-only).
Account state: Steam linked, 4 recent matches (Mina, Yamato, Viscous, Haze), rank Obscurus (tier 0 = unranked,
`ranked_display_badge` null on every match), 0 Deadlock recordings, 0 replay reviews.

## Findings

| # | Screen | What a Deadlock player sees | Data that exists | Sev | Status |
|---|---|---|---|---|---|
| 1 | Home › Your stats | "Most played heroes: Haze 100% · Yamato 100% · Viscous 0%" — reads like play share, is win rate on 1 game | `hero_stats` games + win rate | H | Fixed: "Haze 1–0 · Yamato 1–0 · Viscous 0–1" |
| 2 | Home + Progress › stat row | "82 soul orbs secured per match · **0 denied**" — 1 deny in 4 matches rounded to 0 | `recent_matches[].denies` | M | Fixed: "1 denied in 4 matches" (count, not a rounded average) |
| 3 | Home + Progress › rank | Obscurus badge + "Current rank" — Obscurus is the unranked tier; Progress also says "Not enough rank history" | `current_rank.tier` 0 | M | Fixed: caption "Unranked · play ranked to place" for tier 0 |
| 4 | Home › Your coach (empty) | "Replays auto-upload after matches — or analyze any .dem…" — false: a replay review is a confirmed, paid action | `deadlock:review-replay` (Matches row) | H | Fixed copy (game-themes Deadlock entry) |
| 5 | Progress › Recent matches | Hero name + unlabelled "1/8/4 · 14.8k · 18:50"; no portrait; rows don't open anything | `hero_icon`, `match_id`; free match report exists at `/report/:id?game=deadlock` | H | Fixed: portrait, labelled "K/D/A · souls · length", row opens the free match report |
| 6 | Progress › Replay reviews (empty) | "Analyse a replay from Coach to get one" — the action lives on the Matches row | Review replay row action | M | Fixed copy |
| 7 | Starting report › Your numbers | "Souls 24304.8", "Time spent dead (seconds) 6:59" | AI metric `unit: seconds` | M | Fixed formatter (≥1000 → "24,305"; drops "(seconds)" when shown as m:ss) — shared helper, all games |
| 8 | Match report (Deadlock) | Empty red band, no art; K/D/A, souls (rank in lobby), souls at 10:00 vs lobby/lane, orbs, hero damage, deaths before 10:00, time dead all shown | — | L | Fixed: Deadlock key art in the band. Hero card art needs API (see gaps) |
| 9 | Settings › Recording › Deadlock diagnostics | Raw `idle` phase, raw `hero_13` key, "Replay on CDN" jargon | phase enum, hero names | M | Fixed: "Waiting for a match / In a match / Match ended", hero name, "Replay available from Valve" |
| 10 | Settings › Recording › Highlight clips | Round/Valorant/League copy only ("1vX rounds", "opening deaths"); Deadlock gets no auto kill clips (no live kill feed, cloud review doesn't cut clips) | — | M | Fixed: one Deadlock-only line under the heading |
| 11 | Practice | Valorant focus ("Opening deaths in the first 10s"), Valorant VOD drills ("Kill Into Instant E", "A Main"), "Valorant calibration" shown to Deadlock players | Aim trainer is game-agnostic; focus/drills are Valorant-only | H | **Not fixed (shared, three games):** lead decision — see below |
| 12 | Matches › All / Clips / Coaching reviews | Honest empty states ("No Deadlock matches yet", "Show all games") | — | — | OK |
| 13 | Match page / "Review replay" | Known TODO | Wired: row action → confirm dialog → `deadlock:review-replay`; job polled and linked (`deadlock-review.ts`, `deadlock-auto-review-link.ts`); review drawer on match page | — | Done earlier; not exercised (would spend a credit, no recording here) |
| 14 | Coaches / Squad | Cross-game, Valorant cards from other members — fine (both features are game-agnostic) | — | — | OK |
| 15 | Settings › Account › Deadlock | "Linked · stats sync from match history"; search + Steam ID when unlinked | — | — | OK |
| 16 | Onboarding / post-game | Onboarding shows "Getting your account ready" (account already set up); post-game preview is a Valorant fixture | — | — | Not changed |
| 17 | UpForge score | Stats score null for Deadlock by design; nothing claims one | `UPFORGE_SCORE.md` | — | OK |

## Not fixed — for the lead
- **Practice for non-Valorant games (#11).** `PracticeV3.vue` is shared and in flight. Suggest: when the primary game isn't Valorant, label the
  focus hero and "Drills from your matches" as "From your Valorant matches" (or hide them), keep the aim-trainer library, and hide the
  calibration link. Same applies to CS2 and League.
- **Window size:** visiting `/onboarding` or the post-game preview snaps the shared window to the compact layout and it doesn't grow back on
  normal routes (seen at 720×600 after another agent's onboarding shot). Affects screenshots only.

## Gaps (API / data)
- Hero **card art** for the match-report band: `DeadlockService` already reads `images.icon_hero_card` into the hero map (`card`) but only
  exposes `hero_icon` (small). Exposing `hero_card` on `recent_matches` / `hero_stats` and the report facts would let the band show the hero.
- **Item build** (items with times, deadlock-api metadata) isn't in the free report facts; only the paid replay review shows items.

## Files changed (Deadlock-only branches in shared files)
- `src/components/v3/games/game-data.ts` — `deadlockFarm` adds `deniedTotal`; `deadlockStats` sub "N denied in M matches"; new `deadlockHeroRecord`, `deadlockRankCaption`.
- `src/components/v3/games/GameHomeSummary.vue` — Deadlock top line (won–lost) and rank caption.
- `src/components/v3/games/GameProgress.vue` — Deadlock rank caption; recent matches with portrait, labelled line, opens `/report/:id?game=deadlock`; replay-review empty copy.
- `src/lib/deadlock.ts` — `deadlockPhaseLabel`. `src/components/settings/SettingsDeadlockDiagnostics.vue` (v3 branch only).
- `src/components/settings/SettingsRecordingPane.vue` — one `v-if="primaryGame === 'deadlock'"` line (v3 branch).
- `src/lib/game-themes.ts` — Deadlock `coachingEmptyMessage`.
- `src/lib/starting-report.ts` — `formatMetric` ≥1000 → "24,305"; seconds label drops "(seconds)" (all games).
- `src/views/v3/MatchReportV3.vue` — Deadlock key art in the band.
- Tests: `game-data-deadlock.test.ts` (+3), `deadlock-phase-label.test.ts` (new), `starting-report.test.ts` (+2 asserts).

## Verification
- `npm run type-check` clean · `npx eslint` on every changed file clean · `npx vitest run` 370 files / 2,224 tests passed (9 skipped).
- Screenshots after the fix (Deadlock): Progress, Home, match report, starting report; Settings text read back (diagnostics + clip line).
- No API change; no production writes (reads only; the report page was opened, which the app does on any visit).
