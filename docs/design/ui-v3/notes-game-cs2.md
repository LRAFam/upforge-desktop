# CS2 — round 5 (toward 5/5)

All uncommitted. Desktop: `upforge-wt/rework` (feat/ui-v3). API: `upforge-wt/api-fixes`. AI: `upforge-wt/ai-fixes` (both fix/game-support-bugs). Builds on FIXES-NOTES.md (FACEIT targeting, failure email).

## Done

### 1. Steam ID: saved from the desktop and preferred over names (H/S)
- Desktop: new `electron/main/cs2-identity-state.ts`. The demo parser picks "you" by the account's saved Steam64 first, so renames and name clashes no longer break matching. With no Steam64 saved, a confident match saves it via `auth.syncCs2SteamId()` → `PUT /api/cs2/identity {steam_id}`. Confident means a unique name in the lobby, from a name the player gave us (settings, UpForge identity, FACEIT nickname, Steam persona). Never from the account-name fallback or a kill-pattern guess, never over a different saved id, and at most once per id.
  - Files: `cs2-identity-state.ts` (+test), `cs2-player-identity.ts` (records the identity source and saved id), `cs2-demo-parser.ts` (steam-first match, `localMatchedBy`), `auth-manager.ts` (`syncCs2SteamId`).
  - Tests: `cs2-identity-state.test.ts`, `cs2-demo-parser-identity.test.ts` (rename still matched; save after confident match; no save from account name).
- API: `CS2IdentityController@update` canonicalises any Steam ID form to Steam64 (`CS2PlayerIdentity::steam64`) and rejects junk with 422.
- Effect: `CS2ProfileService` already fetches the Leetify Premier rating when `steam_id` is set, so Premier now appears on Progress for desktop-first players after their first confidently matched demo.

### 2. Coach gets per-round context (H/M) — golden case first
- Golden case `ai/tests/fixtures/coaching_claims/cs2_round_context.json` + `tests/test_cs2_round_context.py` (`claim_contract`). It failed before the change.
- New `ai/services/cs2_round_context.py`, used by `pipelines/cs2_desktop._build_match_context`:
  - One line per round: result, bomb plant/defuse, every kill and death of the player with weapon and callout, opening kill/death.
  - Deaths say "traded" / "not traded" only when the spatial pass measured it; otherwise "trade not measured".
  - Measured facts: clutches won/attempted, equipment value bands ("not buy intent"), K/D by side, ADR, KAST, HS kills %, position patterns.
  - The 8-kill / 8-death cap is gone (bounded at 40 rounds).
- `services/cs2_claude_coach.py` rules: "untraded" only from a "not traded" line; equipment bands are never called eco/force decisions or compared with team spend. Replaced the old example that invented a team-economy comparison.

### 3. Richer Progress (M/S)
- API `CS2ProfileService::aggregateValveStats` now returns, from stored `match_stats` (desktop v1 and web keys):
  - `averages` for K/D, ADR, headshot %, KAST, each with how many matches measured it (null never counts as zero)
  - `opening_duels` (pooled won/lost, win rate)
  - `clutches`
  - `map_breakdown` with K/D and win rate per map (score parsed from "13-7" or "13–7")
  - `recent`: the last 10 matches, oldest first
  - `avg_kd` and `matches_tracked` unchanged for older clients
- Desktop v3 `game-data.ts` (CS2 parts only) + `GameProgress.vue`: ADR, Headshot kills, KAST (each "Over N matches"), Opening duels won (win/loss tone), maps table switches to "Win rate" + K/D when measured. Falls back cleanly on an older API.
- Tests: API `CS2ProfileStatsTest`; desktop `game-data-cs2.test.ts`.

### 4. FACEIT Elo refresh + change (M/S)
- New `app/Services/FaceitEloRefresher.php`: refreshes a connection at most every 6 h (on `/api/cs2/faceit/connection` and `/api/cs2/profile`), 4 s timeout, keeps last values on any failure. Stores `faceit_elo_previous` when the Elo changes. Responses include `elo_change`.
- Migration `2026_10_30_160000_add_previous_elo_to_faceit_connections.php` (nullable int, own table).
- Desktop shows "Level 8 · +35 since last sync" with win/loss tone.
- Tests: `FaceitEloRefreshTest` (refresh once, change reported, fresh rows not looked up, failed lookup keeps values).

## Not done — plans

### 5. One stats definition for web and desktop (M/M)
The web path (awpy, `services/cs2_demo_analyzer.py`) and desktop (demoparser2, `cs2-match-stats.ts`) define KAST, ADR and economy differently; web KAST is null.
Plan: port `calculateCs2MatchStats` to Python (`services/cs2_match_stats_v1.py`) on demoparser2 (already in requirements) with the same freeze-end, live-round and band rules. Parity test: run both on the local Anubis demo (19 rounds, 19/14/0, ADR 109.95, HS 52.63, KAST 57.89 per CS2-MEASURED-STATS.md) and assert equal output. Then the web path stores `schema_version: 1` stats and its context gets the same round lines (`build_cs2_round_lines` needs per-round kills from the demo). About 2–3 days; needs the real demo file to verify.

### 6. Auto-match FACEIT demos to desktop recordings (M/M)
Plan, mirroring `pickValveMatchForSession`:
1. On match end for a non-Valve match, the API lists the user's last 5 FACEIT matches (`/players/{id}/history`, already used by the picker).
2. Pick the match whose `started_at`/`finished_at` overlaps the recording and whose map matches; tie → no pick.
3. Fetch the demo URL (`faceit_demo_downloader.py`), download on desktop, attach through the existing manual-attach path so the Analyse contract is unchanged.
Needs the FACEIT Downloads API scope on production keys (check before building). About 2 days.

### 7. Keep demos for re-analysis, with caps (L/S)
Today `ProcessCS2Demo` deletes the S3 demo after analysis, so reports can't be re-run (report 649). Proposal, in line with "no unlimited storage":
- Keep the last 10 demos per user, at most 14 days, and at most 2 GB per user. Oldest goes first.
- Free tier: 3 demos, 7 days. Implement as a nightly `cs2:prune-demos` command plus a skip of the immediate delete.
Needs a pricing/tier decision (`config/tiers.php` is lead-owned), so not implemented.

### Also left
- The `recent` form series is in the API but not drawn on desktop Progress yet (small line like the Deadlock rank line).
- Web path coaching still uses match aggregates only (see 5).
- No v3 screen has been seen with real CS2 data (the signed-in account has none).

## Checks
- AI: `pytest` 855 passed, 29 skipped; `pytest -m claim_contract` 320 passed, 3 skipped.
- API: CS2 tests 11/11. Full suite 1023 passed, 9 failed: the 5 known pre-existing failures plus 4 League tests (`LolAnalysisReadinessServiceTest` ×3, `LolMatchDataEnricherTest`) from the League agent's in-progress files, none in CS2 code. Pint clean on my files.
- Desktop: type-check clean; eslint clean on changed files; `npm test` 1552 passed, 9 skipped.

## Deploy order
AI → API (run the migration) → desktop. Each side degrades safely without the others: old desktop ignores the new profile fields; new desktop falls back when they are missing.

## Scores (honest, before → after)
| Step | Before | After | Why |
|---|---|---|---|
| Setup & identity | 2 | 3.5 | Steam64 saved and preferred; FACEIT ownership is still a nickname lookup. |
| Detect & record | 4 | 4 | Unchanged. |
| Data | 4 | 4 | Same sources; Steam64 now unlocks Leetify/Premier. Two parsers remain. |
| Coaching | 2.5 | 3.5 | Right player on FACEIT; per-round context with honest trade/economy claims. Web path still aggregate-only. |
| What players see | 3 | 4 | ADR, HS%, KAST, opening duels, per-map win rate and K/D, Elo change. Not yet seen with real data. |
| Paying | 3 | 3 | Unchanged (tiers are lead-owned). |
| **Overall** | **3.1** | **3.7** | |

To reach 4.5+: items 5 and 6, plus a desktop CS2 result view and the demo retention decision.


---

# CS2 — round 6

All uncommitted. Same worktrees. No stashes/resets used.

## Done

### 1. One stats definition for web and desktop (was plan item 5)
- AI: new `services/cs2_match_stats_v1.py`: a line-for-line port of desktop `calculateCs2MatchStats` (freeze-end rounds, None-not-zero, 5 s KAST trade, overkill-capped ADR, equipment bands, JS half-up rounding), plus `extract_cs2_demo_facts()` reading the same events/props with Python demoparser2.
  - It catches demoparser2's Rust panics (`pyo3 PanicException` is a BaseException). Found because a corrupt or fake demo would otherwise crash the whole analysis.
- `CS2DemoAnalyzer.parse_demo` now swaps in v1 numbers when the demoparser2 read works (awpy numbers stay as the fallback). It returns `match_stats` (schema_version 1) from both `/api/cs2/analyze-demo` and `/api/cs2/analyze-faceit`. Header score/result come from the same v1 score.
- API: `ProcessCS2Demo` stores `schema_version` and `rounds` with the stats, so web analyses are marked as desktop-definition stats.
- **Parity test:** no real `.dem` is in any repo, so the parity cases are built from the desktop code itself. `electron/main/__fixtures__/cs2-match-stats-v1-parity.json` holds 4 cases (side swap, overkill damage, utility and flashes; clutch, trade, multi-kill, warm-up and bands; dead at freeze end → null; unknown headshot and team → nulls). Expected values were generated by running the TS function.
  - Desktop `cs2-match-stats-parity.test.ts` and AI `test_cs2_match_stats_v1_parity.py` both assert them.
  - AI `test_cs2_match_stats_v1_extract.py` feeds pandas frames shaped like demoparser2 output (uint64 steamids, NaN gaps) through the extractor.
  - **Still needs a real demo:** run `CS2_TEST_DEMO=/path/anubis.dem pytest tests/test_cs2_demo_evidence.py` and compare `parsed["match_stats"]` with the desktop output for the same file. CS2-MEASURED-STATS.md lists Anubis 19/14/0, ADR 109.95, HS 52.63, KAST 57.89.

### 2. Web/FACEIT coaching gets per-round context (golden case first)
- Golden case `tests/fixtures/coaching_claims/cs2_web_round_context.json` + `tests/test_cs2_web_round_context.py` (claim_contract). All 4 tests failed before the change.
- `build_round_match_data()` shapes demo events like desktop match_data, then the existing `build_cs2_round_lines` writes the same "R1 (won, bomb planted A): killed … ; opening kill" lines.
  - Only the player's own kills and deaths are listed.
  - Trades use the desktop coaching rule (ally kills the killer within 3 s; `TRADE_AFTER_DEATH_MS`).
  - Bomb site is named only when the event gives A/B.
- Context labels now match their definitions:
  - KAST is "(kill, assist, survived, or death traded within 5 s)", no longer "trade detection is not implemented".
  - Zero-impact is "Rounds without a kill or assist".
  - Economy is described as value bands ("not buy intent"), never as `eco_rounds:` keys.
  - "Stats definition: same as the UpForge desktop report (match_stats v1)".

### 3. FACEIT demo auto-match on desktop (behind one confirmed tap)
- `electron/main/cs2-faceit-match.ts` uses existing endpoints only:
  - `GET /api/cs2/faceit/connection` → nickname
  - `GET /api/cs2/faceit/matches?username=` → last 10 matches
  - `pickFaceitMatchForRecording`: exactly one match must fit. With an end time, finished within ±10 min; otherwise 5–90 min after the recording started. The same map is required when the recording knows it. Ambiguous means no pick.
  - The tap calls `POST /api/cs2/faceit/analyze {match_id}`, the existing server path that downloads the FACEIT demo and coaches the right player. It spends 1 analysis, so the UI asks first.
  - Match ids are validated (`1-<uuid>`) before any call. A bounded link store (`userData/cs2-faceit-links.json`, newest 200) remembers the tap, so it is never queued twice.
- UI: `src/components/v3/games/Cs2FaceitAttach.vue` plus `cs2-faceit-attach.ts` (copy and state).
  - It shows "This looks like your FACEIT match on Mirage (13 — 9)…" with "Get FACEIT coaching", then "This uses 1 analysis from your plan" with Confirm and Cancel.
  - It stays hidden when FACEIT isn't connected or nothing fits. It explains ambiguity instead of guessing.
  - It renders nothing until the lead wiring below lands.
- Why not download the .dem to the desktop: no existing endpoint returns a FACEIT demo URL (the FACEIT key is server-side). A desktop download would need a new endpoint; this uses the existing server path instead.
- Tests: `cs2-faceit-match.test.ts` (12: matching, refusing to guess, map rules, endpoints called, find never posts, malformed id refused, double tap queues once) and `cs2-faceit-attach.test.ts` (4).

### 4. FACEIT ownership
- `POST /api/cs2/faceit/connect` reads FACEIT's Steam account for the nickname (`games.cs2.game_player_id`, else `steam_id_64`).
  - If UpForge already has the user's Steam64 and it differs → **422 `steam_mismatch`** with a plain message, and nothing is stored.
  - If they match → `steam_verified: true`. With no saved Steam64 → stored, `steam_verified: false`.
- New nullable column `faceit_connections.faceit_steam_id` (migration `2026_10_30_190000_…`).
- `analyzeMatch` targets the saved Steam64 first, then FACEIT's Steam64 for the connected nickname. Before, there was no target at all when no Steam64 was saved.
- Tests: `CS2FaceitOwnershipTest` (5: mismatch rejected, match verified, unverified stored, fallback target, v1 stats stored).

### 5. Demo retention: proposal only (pricing decision)
Unchanged from round 5: keep the last 10 demos per user, ≤14 days, ≤2 GB (Free: 3 demos, 7 days), via a nightly `cs2:prune-demos` plus skipping the immediate S3 delete. Needs a tier decision; not implemented.

## For the lead (shared files: exact changes)
1. `electron/main/index.ts` (where other IPC is registered):
```ts
import { FaceitLinkStore, registerCs2FaceitMatchIpc } from './cs2-faceit-match'
registerCs2FaceitMatchIpc(ipcMain, () => authManager.getApi(), new FaceitLinkStore(app.getPath('userData')))
```
2. `electron/preload/index.ts`, `cs2:` block:
```ts
findFaceitMatch: (rec: { startedAtMs: number; endedAtMs?: number | null; map?: string | null }) => ipcRenderer.invoke('cs2:find-faceit-match', rec),
attachFaceitMatch: (recordingId: string, matchId: string) => ipcRenderer.invoke('cs2:attach-faceit-match', recordingId, matchId),
getFaceitLink: (recordingId: string) => ipcRenderer.invoke('cs2:get-faceit-link', recordingId),
```
3. `src/env.d.ts`, `cs2:` block:
```ts
findFaceitMatch: (rec: { startedAtMs: number; endedAtMs?: number | null; map?: string | null }) => Promise<import('./components/v3/games/cs2-faceit-attach').FaceitLookup>
attachFaceitMatch: (recordingId: string, matchId: string) => Promise<{ ok: boolean; jobId?: string; error?: string; already?: boolean }>
getFaceitLink: (recordingId: string) => Promise<{ matchId: string; jobId: string; linkedAt: number } | null>
```
4. Mount on the v3 match page for CS2 recordings without a parsed demo (next to `VodDemoPendingPanel`):
`<Cs2FaceitAttach v-if="uiV3 && timeline?.game === 'cs2'" :recording-id="timeline.id" :started-at-ms="timeline.recordedAt" :map="timeline.map" />`
(pass `:ended-at-ms` when the recording's end time is available).
5. Deploy: AI → API (`php artisan migrate`: `faceit_steam_id`) → desktop. The AI still works with an old API (extra `match_stats` is ignored), and the old desktop is unaffected.

## Checks (round 6)
- AI: `pytest` 893 passed, 29 skipped; `pytest -m claim_contract` 333 passed, 3 skipped.
  - One mid-run full suite showed 9 CS2 failures. Re-runs (pairs, then the full suite) were all green, so that looks like another agent's in-flight edits.
  - The pyo3 panic it exposed is real and fixed.
- API: CS2/FACEIT tests 13/13. Full suite 1043 passed, 5 failed (the known pre-existing 5). Pint clean on my files (`ProcessCS2Demo.php` style warnings already exist on origin/main).
- Desktop: `npm run type-check` clean; eslint clean on my files; `npm test` 1619 passed, 9 skipped.

## Scores (round 5 → round 6)
| Step | R5 | R6 | Why |
|---|---|---|---|
| Setup & identity | 3.5 | 4 | FACEIT link is checked against the saved Steam64; FACEIT's Steam64 is the fallback target. Still no FACEIT OAuth. |
| Detect & record | 4 | 4 (4.5 once wired) | Recordings can be matched to FACEIT matches; needs the lead's IPC lines + mount. |
| Data | 4 | 4.5 | One stat definition on web and desktop, locked by shared parity cases; web demos now give per-round facts. Not yet verified on a real demo file. |
| Coaching | 3.5 | 4 | Web/FACEIT coaching gets measured per-round lines with honest trade and equipment wording, behind a golden case. No positions/callouts on the web path. |
| What players see | 4 | 4 | FACEIT coaching row built; visible after wiring. Not seen with real CS2 data. |
| Paying | 3 | 3 | Tiers and retention are pricing decisions. |
| **Overall** | **3.7** | **≈3.9** (4.0 once wired) | |

To reach 5: verify parity on a real demo; callouts and positions on the web path (port spatial enrichment); FACEIT OAuth instead of nickname lookup; a desktop CS2 result view; the retention and tier decisions.

## Round 7 (r7-demo-games)
**Taken (unblocked):** board 20/20b (X2 match page + deep tabs), in-app CS2 result view, N5 money per round (as equipment bands per match; per-round values aren't on CS2 round summaries).
- **Match page deep tabs:** `src/components/v3/matchpage/cs2/cs2-match-view.ts` (+5 tests) shapes `match_stats` v1 + round summaries + your kills/deaths into Rounds · Duels · Utility · Economy. `Cs2MatchTabsV3.vue` renders them; a null metric shows "Not measured", never 0; counts are whole numbers.
- **Where it shows:** `MatchStatsDrawerV3.vue` — a collapsible "Match stats" row under the match-page header (state remembered per viewer), mounted in `MatchPageV3` for CS2 recordings with a parsed demo. Nothing renders for other games or before the demo is parsed (Analyse contract unchanged).
- **In-app result:** new read-only IPC `cs2:get-analysis-detail` (gaming-ipc, preload, env.d.ts) → `Cs2ResultV3.vue` dialog (focus, summary, deep tabs from the stored `match_stats`, issues, strengths, economy/utility/consistency notes, drills). Shaping in `cs2-result.ts` (+3 tests) deliberately drops the AI's 1–10 rating and "rank ceiling" (opinions, not measurements).
- **Progress:** "Demo reviews" list on CS2 Progress (cache-first, loads only on CS2) opens the in-app result. The Steam row copy now says matching uses the Steam ID first.
- **Not taken:** X1 focus loop (M; FocusService is Valorant-only), N3 derived blind / N4 utility timing (needs a match_stats v2 with Python parity), N1/N2/L* (data/$ blocked), X4 OpenID/alts.
- **Flag for the AI owner:** `cs2_claude_coach.py` prompt example cites "expected 25-35% HS% for this rank" — an unsourced benchmark the model may copy.
- **Verified:** type-check (only errors are another agent's in-progress clip files), eslint on changed files, `npm test` 1,772 passed. Not seen on screen: no CS2 recording on this Mac and switching the title-bar game writes to the real account.
- Scores: What players see 4 → 4.5 (in-app result + deep tabs); Detect & record unchanged.

## Round 9
- **Web/FACEIT callouts (ai-fixes 680e6c3):** server demo parsing reads Valve's own place names (demoparser2 `last_place_name`) for every death and humanises them (`BombsiteA` → "A site", `LongHall` → "Long Hall"). Web and FACEIT round lines now say where the player killed or died, like the desktop. No place name → no location claim; a teammate's kill never gives the player a location; parsers without the prop fall back to no locations. Golden case `cs2_web_callouts` written first (failed on import, passes now).
- Trades on the server path were already measured (3 s rule, round 6); the callout now also disambiguates which death a trade belongs to.
- Note: Valve place names can differ from community callout names the desktop map zones use. Both are honest; a later pass could map Valve places to the desktop zone names per map.
