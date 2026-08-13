# Non-Valorant support diagnostics design

**Date:** 2026-08-13  
**Service:** `upforge-desktop`  
**Status:** Implemented  
**Trigger:** LoL support bundle (v2.10.77) showed Valorant-only Riot Client fields while Match-V5 link failed with `no_match_id`.

## Goal

Make support bundles and activity log lines useful for LoL, CS2, and Deadlock without a Dev UI rewrite. Next Discord dump should answer: did Live Client / demo fire, what match id (if any), what enrich/demo status, why Analyse stayed locked.

## Approach

**A (approved):** Extend `formatSupportBundle` with per-game sections + last-match snapshot; add a small set of high-signal activity lines. Keep existing Valorant `RIOT CLIENT` block.

## Support bundle

### 1. `=== LAST MATCH ===`

Always include when `lastMatchDiagnostic` exists (any game). Fields (null-safe):

| Field | Source |
|-------|--------|
| Game | extend diagnostic with `game` if missing |
| At | `timestamp` |
| Match ID | `matchId` |
| Map / agent | `map`, `agent` |
| Mode | `gameMode` |
| End reason | `endReason` (e.g. `live-client`, `process`, `gsi`) |
| Details status | `matchDetailsStatus` (reuse; for LoL map from `lolEnrichStatus` when set) |
| Kills / clips | `killsInTimeline`, `clipsExtracted` |
| File | duration + size |

If none this session: `No match finalized this session.`

### 2. `=== LEAGUE ===`

Always include (cheap probe at bundle time):

- LCU: lockfile found, phase, queueId, queueLabel, gameMode, error
- Live Client: reachable, inMatch, gameMode
- Account (booleans / platform only): `lol_platform`, `hasLolPuuid`, dedicated vs shared Riot fallback
- Never include lockfile password, tokens, or full PUUID

Reuse `probeLolLcu({ liveClient: lolLiveClientApi })` already used by Dev diagnostics.

### 3. `=== CS2 / DEADLOCK ===`

Include when last match game is `cs2` or `deadlock`, or when a demo sync diagnostic exists this session:

- Demo/replay path present (bool + basename only)
- Sync status: pending / synced / missing
- One-line note if Analyse is waiting on demo stats

### 4. Keep as-is

- `NETWORK`, `LAST RIOT MATCH DETAILS`, `LAST UPLOAD ERROR`, Valorant `RIOT CLIENT`, `ACTIVITY LOG`

## Activity log lines

User-visible, short. Prefer one line per event (no spam loops).

| When | Example |
|------|---------|
| LoL match end | `Match ended (live-client) — gameId=900000042 queue=420` or `gameId=none` |
| LoL enrich terminal | `LoL link: no_match_id (no gameId; history miss)` / `no_auth` / `fetch_failed` / `fetched` |
| LoL clips | `LoL clips skipped — N kills missing video timestamps` |
| CS2/Deadlock match end | Existing demo lines; add `CS2 demo missing at match end` / Deadlock equivalent when path null |

Wire enrich `onStatus` / match-end paths so terminal LoL statuses are explicit (today “Could not link…” alone hides queue/history context).

## `LastMatchDiagnostic` gaps

Extend in the same change set as needed for the bundle:

- `game: string`
- `lolEnrichStatus?: …` (optional)
- `queueId?: string | null`
- Ensure `endReason` / `matchId` are set on LoL process-end path the same as live-client end

## Tests

- Unit: `formatSupportBundle` includes LAST MATCH / LEAGUE sections; omits secrets; CS2 section when provided
- Unit: activity helper strings for LoL link reasons (pure function preferred)
- No change to Analyse readiness contract

## Non-goals (v1)

- Dev diagnostics UI redesign
- JSON support export
- Fixing Live Client `gameId` → Match-V5 `{platform}_{id}` formatting (separate bug)
- Changing Match-V5 / queue-420 product rules
- Dumping full timelines or kill arrays into the bundle

## Success criteria

From a LoL support `.txt` alone we can tell:

1. Whether Live Client / LCU saw a match
2. Whether `matchId` / `gameId` was present at finalize
3. Terminal enrich status and a one-line reason
4. End source (`live-client` vs process)

## Future (not in this change)

Structured activity events (`{ type, game, fields }`) rendered to UI + bundle would beat free-text `logActivity` strings for filtering and support parsing. Defer until after this wedge ships; keep string helpers as the render layer when that lands.

## Files likely touched

- `electron/main/network-diagnostics.ts` (+ tests)
- `electron/main/index.ts` (`app:get-support-bundle`, match-end / enrich logging)
- Small pure helper module optional: `support-diagnostics.ts` or `lol-enrich-activity.ts`
