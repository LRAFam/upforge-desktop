# CS2 pass — 2026-11-02

Audited every v3 screen as a CS2 player (gameshot.sh, read-only). The account has 1 CS2 VOD review
(Vertigo, cloud recording + parsed rounds), 2 old web demo uploads (Dust II, player "HooXi", side-split
score "CT 7 – T 9", ADR stored as 0) and 2 failed uploads. No FACEIT, no Steam64, no local demo folder.

## Findings

| Screen | Issue | Fix | Status |
|---|---|---|---|
| Home · Recent form | "0–0 Won–lost · Last 3 analysed matches": CS2 rows never carried a result | Desktop reads the player-side score ("13-9") into result + rounds (`cs2-analyses.ts`); API `inferWon` reads it too; Home shows "3 Analysed · No win or loss recorded" instead of 0–0 when nothing is known | Fixed |
| Home · Recent form | No CS2 number at all (CS2 has no ACS) | "Average K/D" over matches with demo stats (CS2 only) | Fixed |
| Home · hero | Hero score empty for CS2 even with a v1 score | Comes with `rounds_won/lost` from the score parse | Fixed (for v1 demos) |
| Home | Setup block shows instead of the CS2 summary while the demo folder is missing | Kept: setup is the honest next step on Home | As is |
| Matches · row | Vertigo VOD row: "No scoreboard" though the match page shows 13–10 · 19/15/0 | Cloud-only row has no timeline; the VOD analysis row has no stats (API VOD list returns null kills/score) | Gap → API |
| Coaching reviews · hero | "Vertigo · LRAFam · **Agent** · **Cs2 Vod** · 10 Jul" (agent role of a player name, raw mode) | CS2 rows: map · player · "CS2 VOD" · date | Fixed |
| Coaching reviews · overview | "Most played agent: HooXi" | Hidden for a CS2 archive; top map uses `mapDisplayName` | Fixed |
| Match page · header | "de_vertigo · Competitive" | `mapDisplayName('cs2', …)` → "Vertigo" | Fixed |
| Match page · header | Score jumps 13–10 → 13–9 when the AI review loads; rounds line under it says 13–10 | CS2: measured score/rounds win over the AI review's score (`useVodReview.matchScoreline`) | Fixed |
| Match page · header | No art (blank teal band) | CS2: radar for the 7 shipped maps, else CS2 art (same as the Matches row) | Fixed |
| Match page · loading | Skeleton header showed "de_vertigo" and no art | Same map name + art in `MatchPageSkeletonV3` | Fixed |
| Coaching reviews · hero | Still "13–9" (the AI review's own score) while the match page says 13–10 from the demo rounds | The VOD review row has no measured score to prefer (see need 1) | Gap → API |
| Progress · Demo reviews | "Dust II · CT 7 – T 9" (a side split shown as the score) | Score only shown when it is a player-side score | Fixed |
| Match page | "You already have an open review with this coach…" shown at rest | Roster send copy, not CS2 | Lead / team owner |
| Progress · count | "61 games checked · 0 analysed" — 61 are Valorant focus checks | Not used for CS2 | Fixed |
| Progress · CS2 | "Nothing to track yet" while 3 CS2 matches are tracked (blocked on the demo folder) | Stats, maps, reviews show whenever matches are tracked; the setup step is one line with its action | Fixed |
| Progress · CS2 | Form line never drawn (API `recent` unused) | Drawn from `recent[].won` (known results only) | Fixed |
| Progress · CS2 | "Premier rating isn't synced to UpForge yet" (no reason) | Says Premier needs the Steam ID, saved the first time a demo matches you | Fixed |
| Progress · CS2 | Average ADR "0" from old web demos (ADR not parsed) | API: ADR ≤ 0 with kills > 0 is not counted as measured; desktop also hides ADR 0 next to a K/D > 0 until the API is deployed | Fixed |
| Progress | "Your starting report →" for CS2 opens "Couldn't load your starting report" | Prod GET fails for cs2; CS2 needs 3 locally parsed demos. Needs an honest "needs 3 demos" state | Gap → starting-report owner |
| Practice | Valorant focus ("Opening deaths in the first 10s"), Valorant ability drills ("Kill Into Instant E", "Operator Angle Rotation") and "Valorant calibration (admin)" shown to CS2 players with no label | Aim drills are relevant to CS2 (Strafe Aim = counter-strafe), but match drills/focus are Valorant. Needs a game prop on `PracticeV3` ("From your Valorant matches") or hide on CS2 | Gap → practice owner |
| Settings · Account · CS2 | Steam name input empty though the API has "LRAFam"; copy "so clips find your kills" (it's demo matching by Steam ID first) | Settings-owned | Gap → settings owner |
| Settings · Account | "Link FACEIT username on web for match sync" while the CS2 row has a Link FACEIT button | Settings-owned | Gap → settings owner |
| Settings · Recording | CS2 demo-folder block only renders when `settings.primaryGame === 'cs2'`; Home says "set a path in Settings → Recording" | Should follow the title-bar game | Gap → settings owner |
| Settings · Recording | "Your deaths … (Valorant)", "Objectives … (League)" clip toggles shown to CS2 | Fine (labelled) | As is |
| Post-game preview | Fixture is Valorant (Jett · Bind) on any game | Dev preview only | As is |
| Coaches / Squad | Game-agnostic; nothing CS2-specific wrong | — | OK |
| Onboarding | CS2 path not reachable read-only (account already set up) | — | Not seen |

## Files changed
- Desktop: `src/lib/cs2-analyses.ts` (+test), `src/views/v3/HomeV3.vue` (form stats), `src/components/v3/matchpage/MatchPageHeaderV3.vue` (CS2 map name + art), `src/composables/useVodReview.ts` (CS2 score), `src/components/v3/reviews/ReviewDetailV3.vue` (CS2 meta), `src/views/v3/ProgressV3.vue` (count line), `src/components/v3/games/GameProgress.vue` (CS2 branches only), `src/components/v3/games/game-data.ts` (`cs2Stats` ADR) + `game-data-cs2.test.ts`, `src/components/v3/matchpage/MatchPageSkeletonV3.vue` (CS2 map name + art).
- API: `app/Services/CS2UnifiedAnalysisService.php` (`inferWon` reads v1 score), `app/Services/CS2ProfileService.php` (ADR 0), `tests/Feature/CS2ProfileStatsTest.php` (+2 tests).

## Bigger needs (not done)
1. **CS2 VOD list rows carry no stats.** `CS2UnifiedAnalysisService::fetchVodAnalyses` reads `match_stats`/`final_stats` from the AI payload, which VOD jobs don't have. Store the desktop's `finalScore`/`finalStats` (sent in the job params) on the VOD row so Matches/Home show 13–10 · 19/15/0.
2. **UpForge score uses ADR 0** for old web demos the same way Progress did; the score pipeline should apply the same "0 ADR with kills isn't measured" rule.
3. **No CS2 map splash art.** Only 7 radars ship (no Vertigo/Train). Valve map art would need a host in the CSP (upforge.gg could serve it).
4. **Weapon icons / Premier icons**: none bundled; FACEIT level and old skill-group icons are.
5. **Starting report for CS2**: page should say "needs 3 matches with parsed demos on this PC" instead of an error.

## Checks
- Desktop: `npm run type-check` clean; eslint clean on changed files; `npx vitest run` 2227 passed, 9 skipped. Seen on screen after the change: match page (Vertigo · 13–10 · CS2 art), Coaching reviews meta ("Vertigo · LRAFam · CS2 VOD · 10 Jul"), CS2 Progress with stats, maps and demo reviews.
- API: `php artisan test --filter=CS2ProfileStatsTest` 4/4; full suite 1268 passed, 1 failed (known `AdminGrowthTargetsTest`).
