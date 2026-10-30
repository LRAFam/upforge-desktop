# Rank: stale Valorant rank fixed + Home rank strip (agent-rank)

Investigation: scratchpad/support/rank.md. Cause: the only writer of Valorant rank was the Henrik sync, which is off by default; desktop never read RR; `rr-history` consumers read the oldest row as the newest.

## What changed
**Desktop (rework)**
- `electron/main/valorant-mmr.ts`: parses Riot's `pd/mmr/v1/players/{puuid}` body → tier, tier name, RR, last RR change, season, placements left, state (ranked / placements / unranked). Field names follow the public docs (valapidocs) because no real body has been captured yet; every field is optional and range-checked, the body must belong to the signed-in Riot account. **No protection/shield field is read.**
- `RiotLocalApi.fetchOwnMmr()` (same auth/headers as match details) and `setMmrChangedListener()` fired by Riot's `ares-mmr/mmr/v1/players/{own puuid}` push at match end.
- `electron/main/valorant-rank.ts` + `ipc/valorant-rank-ipc.ts`: refresh at app start, on window focus (≤ once per 2 min) and 5 s after the match-end push; saves the last rank per UpForge user in `userData/valorant-rank.json` (rank + own PUUID, no tokens); posts new ranks to the API; pushes `valorant:rank-updated`. IPC: `valorant:get-rank`, `valorant:refresh-rank`, `valorant:capture-mmr` (dev builds only).
- Fixed oldest-as-newest: `buildRankSnapshot` (coaching context) and the pregame brief now use the newest RR entry; the pregame brief prefers the live Riot rank.
- **Home (Coach) rank strip** `components/v3/home/HomeRankStrip.vue` (Valorant only): rank icon + name, RR + 0–100 bar (capped at 100 for Immortal/Radiant), last change (+18 RR win colour / −15 RR loss colour), "Updated 2 min ago" or "Last seen 3h ago · open Valorant to refresh"; placements ("3 placement games left") and Unranked states; falls back to the newest synced snapshot ("From your last synced match, 2 days ago"). No shield UI.
- DevView › Tools › **Capture Riot rank response** (dev only).

**API (api-fixes)**
- `POST /api/valorant/rank-snapshot` (`ValorantRankController`, auth, `throttle:30,60`): tier 0–27, RR 0–2000, change ±2000, `source` must be `riot_client`; the PUUID must be one of the user's linked Riot accounts (`App\Support\UserRiotAccountRef`), else 422. Stored via `ValorantPlayerSnapshotService::recordRiotClientRank` (existing snapshot table, `stats.source = riot_client`, elo on the chart scale `(tier − 3) × 100 + RR`); unchanged rank/RR/season isn't written twice; rank-up announcements only for the main account.
- Desktop uploads' `rank_snapshot` now moves the stored rank too (`recordUploadTier`: tier only, never RR, only when the rank changed; never blocks the upload).
- Snapshots are unique per user/game/second: rank writes step to the next free second instead of failing.
- `/api/stats/rr-history`: still oldest-first (charts), now main linked account only unless `?account=all`.
- `phpunit.xml`: blanks `DB_QUEUE_CONNECTION` (→ sqlite) and the Discord webhook/bot keys so a developer `.env` can't leak into tests.

## Tests
- Desktop: `valorant-rank.test.ts` (11), `rank-strip.test.ts` (7), `match-coaching-context.test.ts` (+1 newest-RR). Full `npm test`: 1659 passed, 9 skipped. Type-check and eslint clean on changed files.
- API: `ValorantRankSnapshotTest` (6). Full `php artisan test`: 1062 passed, **1 failed** (`DeadlockSteamSearchTest` — pre-existing cache leak on origin/main). The other four previously failing tests (ValorantPlayerSnapshot, CoachingBrief ×2, RefreshValorantStats) now pass thanks to the phpunit.xml isolation. The temporary `upforge-wt/upforge-ai-service` link was mine and is removed.

## Deploy order
1. API (new route + controller; no migration).
2. Desktop version bump + tag (rank source, strip, ordering fix).
Old desktop builds keep working; they just don't send live ranks.

## How the user captures a rank response (to settle shields)
1. Use a dev build (`npm run dev` in upforge-desktop) on the Windows PC, signed in.
2. Play a competitive match (ideally a loss near a tier floor).
3. Open Developer › Tools › **Capture Riot rank response**.
4. It saves `%APPDATA%/UpForge/riot-captures/mmr-<time>.json` (token-like values redacted) and lists any field whose name mentions protect / shield / derank / demot. Share the file; if a field exists we add the shield to the strip.

## Other games (unchanged here)
- CS2: rank/Premier only updates on demo/VOD upload (Leetify fallback); same "only on upload" pattern.
- League: rank sync built in round 5 (`lol_rank_snapshots`, `lol:get-rank`).
- Deadlock: live from deadlock-api (5-min cache); not stale.

## Rank shields (derived, not guessed)
**Research:** Riot's client API has no shield field in either the Player MMR or the Competitive Updates response (community schema: valapidocs). HenrikDev's API exposes `rank_protection_shields` and `was_derank_protected` but doesn't say where they come from. The mechanic (since patch 10.01): entering Tier 1 of a rank, by promotion or demotion, gives 2 shields. In that division, a loss at 0 RR uses a shield and keeps the rank; with none left, a loss at 0 RR drops a division. Shields don't refill while you stay in Tier 1. Radiant has none.

**What the app does:**
- `riot-local-api.fetchOwnCompetitiveUpdates()` reads `pd/mmr/v1/players/{puuid}/competitiveupdates?startIndex=0&endIndex=20&queue=competitive` alongside the MMR read, with the same auth and throttle.
- `deriveRankShields()` in `valorant-mmr.ts` finds the match that entered the current Tier 1 division and counts protected losses (0 RR before, 0 RR after, same tier, RR lost) since. It answers only when that entry match is inside the 20-game window and every later match is consistent. Otherwise the count is unknown and nothing is shown.
- If a live MMR body ever carries a field named like `shield`/`protect`, `findProtectionField()` uses it instead and logs the field name once.
- Home rank strip: "2 rank shields" / "1 rank shield" / "No rank shields left" with a small shield outline, tooltip "Each loss at 0 RR uses a shield instead of dropping your rank." Tier 1 divisions only, whole numbers only.
- Tests: `electron/main/valorant-rank-shields.test.ts` (promotion and demotion entry, protected losses, no refill on wins, derank, re-entry reset, entry outside window, inconsistent data, Radiant), `rank-strip.test.ts` (copy and visibility).
- The dev capture still exists for checking a real response, but it's no longer needed to ship this.

**Sources:**
- [Ask VALORANT, Dec. 24 (Riot)](https://playvalorant.com/en-us/news/dev/ask-valorant-dec-24/)
- [What are Rank Shields in VALORANT? (Inven Global)](https://www.invenglobal.com/articles/19193/what-are-rank-shields-in-valorant-derank-protection)
- [GET Competitive Updates (valapidocs)](https://valapidocs.techchrism.me/endpoint/competitive-updates)
- [HenrikDev API v4.2.0 changes](https://docs.henrikdev.xyz/valorant/changes/v4.2.0)
