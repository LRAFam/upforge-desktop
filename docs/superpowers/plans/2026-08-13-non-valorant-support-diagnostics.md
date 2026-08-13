# Non-Valorant Support Diagnostics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make LoL / CS2 / Deadlock support bundles and activity log lines diagnostic enough to debug match-link failures (camargo-class) without opening Dev tools.

**Architecture:** Pure formatters + activity string helpers in small modules; `formatSupportBundle` gains optional sections; `app:get-support-bundle` probes LCU/Live Client and passes `lastMatchDiagnostic` + account flags. Match-end / enrich paths emit one high-signal activity line each. No Analyse readiness or Match-V5 product changes.

**Tech Stack:** TypeScript, Vitest, existing `probeLolLcu`, `lastMatchDiagnostic`, `formatSupportBundle`.

**Spec:** `upforge-desktop/docs/superpowers/specs/2026-08-13-non-valorant-support-diagnostics-design.md`

## Global Constraints

- Desktop only; no version bump unless asked.
- Do not commit unless the user asks.
- Never put LCU password, Riot tokens, or full PUUID in bundle or activity log.
- No em dashes in user-facing / bundle strings.
- Do not change Analyse readiness / Match-V5 queue rules / gameId→platform prefix (separate).
- Verify: `cd upforge-desktop && npx vitest run electron/main/network-diagnostics.test.ts electron/main/support-diagnostics.test.ts electron/main/lol-enrich-activity.test.ts` (adjust to files created) and `npm run type-check`.

## File map

| File | Responsibility |
|------|----------------|
| `electron/main/support-diagnostics.ts` | Pure formatters for LAST MATCH / LEAGUE / CS2-DEADLOCK sections; types for bundle inputs |
| `electron/main/lol-enrich-activity.ts` | Pure activity strings for LoL end + enrich + clips |
| `electron/main/network-diagnostics.ts` | Extend `formatSupportBundle` to accept + append new sections |
| `electron/main/index.ts` | Extend `LastMatchDiagnostic`; wire bundle IPC; emit activity lines at match end / enrich / clips |
| `electron/main/support-diagnostics.test.ts` | Section formatting tests |
| `electron/main/lol-enrich-activity.test.ts` | Activity string tests |
| `electron/main/network-diagnostics.test.ts` | Bundle integration assertions |

---

### Task 1: Pure LoL activity strings

**Files:**
- Create: `upforge-desktop/electron/main/lol-enrich-activity.ts`
- Create: `upforge-desktop/electron/main/lol-enrich-activity.test.ts`

**Interfaces:**
- Produces:
  - `formatLolMatchEndActivity(opts: { source: string; gameId: string | null; queueId: string | number | null }): string`
  - `formatLolLinkActivity(opts: { status: 'fetched' | 'fetch_failed' | 'no_match_id' | 'no_auth'; hasGameId: boolean; queueId?: string | number | null }): string`
  - `formatLolClipsSkippedActivity(killCount: number): string`

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from 'vitest'
import {
  formatLolClipsSkippedActivity,
  formatLolLinkActivity,
  formatLolMatchEndActivity,
} from './lol-enrich-activity'

describe('formatLolMatchEndActivity', () => {
  it('includes source, gameId, and queue', () => {
    expect(formatLolMatchEndActivity({
      source: 'live-client',
      gameId: '900000042',
      queueId: 420,
    })).toBe('Match ended (live-client) — gameId=900000042 queue=420'.replace(' — ', ' - '))
  })

  it('shows gameId=none when missing', () => {
    expect(formatLolMatchEndActivity({
      source: 'process',
      gameId: null,
      queueId: null,
    })).toContain('gameId=none')
  })
})

describe('formatLolLinkActivity', () => {
  it('explains no_match_id without gameId', () => {
    const s = formatLolLinkActivity({
      status: 'no_match_id',
      hasGameId: false,
      queueId: 420,
    })
    expect(s).toContain('LoL link: no_match_id')
    expect(s).toMatch(/no gameId/i)
    expect(s).not.toContain('—')
  })

  it('reports fetched', () => {
    expect(formatLolLinkActivity({ status: 'fetched', hasGameId: true })).toContain('fetched')
  })
})

describe('formatLolClipsSkippedActivity', () => {
  it('includes kill count', () => {
    expect(formatLolClipsSkippedActivity(7)).toContain('7')
    expect(formatLolClipsSkippedActivity(7)).toMatch(/video timestamps/i)
  })
})
```

Note: use hyphens or colons in the real strings (no em dash). Fix the first test expectation to the exact string the implementation returns, e.g. `Match ended (live-client) - gameId=900000042 queue=420`.

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd upforge-desktop && npx vitest run electron/main/lol-enrich-activity.test.ts
```

Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

```ts
// electron/main/lol-enrich-activity.ts
export function formatLolMatchEndActivity(opts: {
  source: string
  gameId: string | null
  queueId: string | number | null
}): string {
  const gameId = opts.gameId && opts.gameId.trim() !== '' ? opts.gameId.trim() : 'none'
  const queue = opts.queueId != null && String(opts.queueId) !== '' ? String(opts.queueId) : 'none'
  return `Match ended (${opts.source}) - gameId=${gameId} queue=${queue}`
}

export function formatLolLinkActivity(opts: {
  status: 'fetched' | 'fetch_failed' | 'no_match_id' | 'no_auth'
  hasGameId: boolean
  queueId?: string | number | null
}): string {
  if (opts.status === 'fetched') return 'LoL link: fetched'
  if (opts.status === 'no_auth') return 'LoL link: no_auth (link Riot ID in Settings)'
  if (opts.status === 'fetch_failed') return 'LoL link: fetch_failed (Riot Match-V5 not ready or rejected id)'
  const queue = opts.queueId != null && String(opts.queueId) !== '' ? String(opts.queueId) : 'none'
  if (!opts.hasGameId) {
    return `LoL link: no_match_id (no gameId; history miss queue=${queue})`
  }
  return `LoL link: no_match_id (gameId present but unresolved; queue=${queue})`
}

export function formatLolClipsSkippedActivity(killCount: number): string {
  return `LoL clips skipped - ${killCount} kills missing video timestamps`
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd upforge-desktop && npx vitest run electron/main/lol-enrich-activity.test.ts
```

Expected: PASS.

---

### Task 2: Pure support-diagnostics section formatters

**Files:**
- Create: `upforge-desktop/electron/main/support-diagnostics.ts`
- Create: `upforge-desktop/electron/main/support-diagnostics.test.ts`

**Interfaces:**
- Produces types + formatters:
  - `SupportLastMatchSnapshot` (game, timestamp, matchId, map, agent, gameMode, endReason, matchDetailsStatus, lolEnrichStatus?, queueId?, killsInTimeline, clipsExtracted, recordingDuration, fileSizeMb)
  - `SupportLolProbeSnapshot` (from probe + account flags; no secrets)
  - `SupportDemoSnapshot` (game: 'cs2' | 'deadlock'; demoPresent: boolean; demoBasename: string | null; syncStatus: string)
  - `formatLastMatchSection(snap: SupportLastMatchSnapshot | null): string[]`
  - `formatLeagueSection(probe: SupportLolProbeSnapshot): string[]`
  - `formatDemoSection(snap: SupportDemoSnapshot | null): string[]` (empty array if null)

- [ ] **Step 1: Write failing tests**

```ts
import { describe, expect, it } from 'vitest'
import {
  formatDemoSection,
  formatLastMatchSection,
  formatLeagueSection,
} from './support-diagnostics'

describe('formatLastMatchSection', () => {
  it('reports empty session', () => {
    const lines = formatLastMatchSection(null)
    expect(lines[0]).toBe('=== LAST MATCH ===')
    expect(lines.join('\n')).toContain('No match finalized this session.')
  })

  it('dumps key fields without em dashes', () => {
    const lines = formatLastMatchSection({
      game: 'lol',
      timestamp: 1_700_000_000_000,
      matchId: null,
      map: "Summoner's Rift",
      agent: 'Caitlyn',
      gameMode: 'CLASSIC',
      endReason: 'process',
      matchDetailsStatus: 'no_match_id',
      lolEnrichStatus: 'no_match_id',
      queueId: null,
      killsInTimeline: 4,
      clipsExtracted: 0,
      recordingDuration: 1800,
      fileSizeMb: 930,
    })
    const text = lines.join('\n')
    expect(text).toContain('Game: lol')
    expect(text).toContain('Match ID: null')
    expect(text).toContain('End reason: process')
    expect(text).toContain('lolEnrichStatus: no_match_id')
    expect(text).not.toContain('—')
  })
})

describe('formatLeagueSection', () => {
  it('includes LCU and Live Client fields without password', () => {
    const text = formatLeagueSection({
      lockfileFound: true,
      phase: 'None',
      queueId: null,
      queueLabel: null,
      gameMode: null,
      error: null,
      liveClientReachable: false,
      liveClientInMatch: false,
      liveClientGameMode: null,
      lolPlatform: 'NA1',
      hasLolPuuid: true,
      dedicatedLolAccount: false,
    }).join('\n')
    expect(text).toContain('=== LEAGUE ===')
    expect(text).toContain('LCU lockfile: true')
    expect(text).toContain('Live Client reachable: false')
    expect(text).toContain('hasLolPuuid: true')
    expect(text).not.toContain('password')
  })
})

describe('formatDemoSection', () => {
  it('returns empty when null', () => {
    expect(formatDemoSection(null)).toEqual([])
  })

  it('includes basename only', () => {
    const text = formatDemoSection({
      game: 'cs2',
      demoPresent: true,
      demoBasename: 'match.dem',
      syncStatus: 'synced',
    }).join('\n')
    expect(text).toContain('=== CS2 / DEADLOCK ===')
    expect(text).toContain('match.dem')
    expect(text).not.toContain('/Users/')
  })
})
```

- [ ] **Step 2: Run tests (expect fail)**

```bash
cd upforge-desktop && npx vitest run electron/main/support-diagnostics.test.ts
```

- [ ] **Step 3: Implement formatters** in `support-diagnostics.ts` matching the test expectations (ISO timestamp for `At:`, `null` literal for missing ids).

- [ ] **Step 4: Run tests (expect pass)**

```bash
cd upforge-desktop && npx vitest run electron/main/support-diagnostics.test.ts
```

---

### Task 3: Extend `formatSupportBundle`

**Files:**
- Modify: `upforge-desktop/electron/main/network-diagnostics.ts` (`formatSupportBundle` signature + body)
- Modify: `upforge-desktop/electron/main/network-diagnostics.test.ts`

**Interfaces:**
- Consumes: formatters from Task 2
- Produces: `formatSupportBundle` optional args:
  - `lastMatch?: SupportLastMatchSnapshot | null`
  - `lol?: SupportLolProbeSnapshot | null`
  - `demo?: SupportDemoSnapshot | null`

- [ ] **Step 1: Extend failing/updated tests**

Add to `formatSupportBundle` describe:

```ts
it('includes LAST MATCH and LEAGUE when provided', () => {
  const text = formatSupportBundle({
    version: '2.10.77',
    network: sampleSnapshot(),
    activityLog: [],
    riot: {
      lockfileFound: false,
      region: 'na',
      accessTokenPresent: false,
      entitlementsTokenPresent: false,
      currentMatchId: null,
      lastSessionLoopState: 'MENUS',
      clientVersion: 'release-x',
    },
    lastMatch: {
      game: 'lol',
      timestamp: 1_700_000_000_000,
      matchId: null,
      map: "Summoner's Rift",
      agent: 'Mel',
      gameMode: 'CLASSIC',
      endReason: 'process',
      matchDetailsStatus: 'no_match_id',
      lolEnrichStatus: 'no_match_id',
      queueId: null,
      killsInTimeline: 2,
      clipsExtracted: 0,
      recordingDuration: 2100,
      fileSizeMb: 950,
    },
    lol: {
      lockfileFound: false,
      phase: null,
      queueId: null,
      queueLabel: null,
      gameMode: null,
      error: 'League lockfile not found',
      liveClientReachable: false,
      liveClientInMatch: false,
      liveClientGameMode: null,
      lolPlatform: null,
      hasLolPuuid: true,
      dedicatedLolAccount: false,
    },
  })
  expect(text).toContain('=== LAST MATCH ===')
  expect(text).toContain('=== LEAGUE ===')
  expect(text).toContain('=== RIOT CLIENT ===')
  expect(text.indexOf('=== LAST MATCH ===')).toBeLessThan(text.indexOf('=== RIOT CLIENT ==='))
})
```

- [ ] **Step 2: Run test (expect fail on missing sections)**

```bash
cd upforge-desktop && npx vitest run electron/main/network-diagnostics.test.ts
```

- [ ] **Step 3: Wire formatters into `formatSupportBundle`**

Insert after upload error block, before `=== RIOT CLIENT ===`:

1. `formatLastMatchSection(opts.lastMatch ?? null)`
2. `formatLeagueSection` when `opts.lol` provided; if `opts.lol` omitted, still emit `=== LEAGUE ===` + `Not probed.`
3. `formatDemoSection(opts.demo ?? null)` (skip if empty)

Keep Valorant RIOT CLIENT + ACTIVITY LOG unchanged.

- [ ] **Step 4: Run tests**

```bash
cd upforge-desktop && npx vitest run electron/main/network-diagnostics.test.ts electron/main/support-diagnostics.test.ts
```

Expected: PASS.

---

### Task 4: Extend `LastMatchDiagnostic` + populate at match end

**Files:**
- Modify: `upforge-desktop/electron/main/index.ts` (`LastMatchDiagnostic` interface ~1061, assignment ~3103)

**Interfaces:**
- Extends diagnostic with:
  - `game: string`
  - `lolEnrichStatus?: 'fetched' | 'fetch_failed' | 'no_match_id' | 'no_auth' | null`
  - `queueId?: string | null`

- [ ] **Step 1: Add fields to interface and assignment**

```ts
interface LastMatchDiagnostic {
  timestamp: number
  game: string
  matchId: string | null
  // ...existing...
  lolEnrichStatus?: 'fetched' | 'fetch_failed' | 'no_match_id' | 'no_auth' | null
  queueId?: string | null
}
```

At assignment (~3103):

```ts
lastMatchDiagnostic = {
  timestamp: Date.now(),
  game,
  matchId: timeline?.matchId ?? null,
  // ...
  lolEnrichStatus: game === 'lol' ? (timeline?.lolEnrichStatus ?? null) : null,
  queueId: timeline?.queueId != null ? String(timeline.queueId) : null,
  endReason: /* prefer match-end source if available, else lapSnap */,
}
```

- [ ] **Step 2: Track finalize `source` into diagnostic `endReason`**

`handleMatchEnd` / `finalizeMatchOnce` already receive `source` (`live-client`, process path activity). Pass that source into `lastMatchDiagnostic.endReason` (or `lapSnap` override) so bundle shows `process` vs `live-client`. Prefer explicit source string over telemetry `'clean'` when present.

- [ ] **Step 3: Type-check**

```bash
cd upforge-desktop && npm run type-check
```

Fix any DevView references that construct partial diagnostics if they break.

---

### Task 5: Wire `app:get-support-bundle`

**Files:**
- Modify: `upforge-desktop/electron/main/index.ts` (~5962)

- [ ] **Step 1: Expand handler**

```ts
ipcMain.handle('app:get-support-bundle', async () => {
  const riotDiag = riotLocalApi.getDiagnostics()
  const network = await runNetworkDiagnostics({ /* existing */ })
  const lcu = await probeLolLcu({ liveClient: lolLiveClientApi })
  const authUser = authManager.getUser()
  const lolPuuid = lolLinkedPuuidFromAuth(authUser as { lol_puuid?: string | null; riot_puuid?: string | null } | null)
  const dedicated = Boolean(authUser && 'lol_puuid' in (authUser as object) && (authUser as { lol_puuid?: string | null }).lol_puuid)

  const last = lastMatchDiagnostic
  const demo =
    last && (last.game === 'cs2' || last.game === 'deadlock')
      ? {
          game: last.game as 'cs2' | 'deadlock',
          demoPresent: last.killsInTimeline > 0 || last.matchDetailsStatus === 'fetched',
          demoBasename: null as string | null, // optional: stash basename on diagnostic in Task 4 if easy
          syncStatus: last.matchDetailsStatus,
        }
      : null

  return formatSupportBundle({
    version: app.getVersion(),
    network,
    activityLog: activityLog.slice(),
    riot: riotDiag,
    lastMatch: last
      ? {
          game: last.game,
          timestamp: last.timestamp,
          matchId: last.matchId,
          map: last.map,
          agent: last.agent,
          gameMode: last.gameMode,
          endReason: last.endReason,
          matchDetailsStatus: last.matchDetailsStatus,
          lolEnrichStatus: last.lolEnrichStatus ?? null,
          queueId: last.queueId ?? null,
          killsInTimeline: last.killsInTimeline,
          clipsExtracted: last.clipsExtracted,
          recordingDuration: last.recordingDuration,
          fileSizeMb: last.fileSizeMb,
        }
      : null,
    lol: {
      lockfileFound: lcu.lockfileFound,
      phase: lcu.phase,
      queueId: lcu.queueId,
      queueLabel: lcu.queueLabel,
      gameMode: lcu.gameMode,
      error: lcu.error,
      liveClientReachable: lcu.liveClient?.reachable ?? false,
      liveClientInMatch: lcu.liveClient?.inMatch ?? false,
      liveClientGameMode: lcu.liveClient?.gameMode ?? null,
      lolPlatform: (authUser as { lol_platform?: string | null } | null)?.lol_platform ?? null,
      hasLolPuuid: Boolean(lolPuuid),
      dedicatedLolAccount: dedicated,
    },
    demo,
  })
})
```

Refine `dedicatedLolAccount` using whatever auth user field already exists (`lol_puuid` on user object). Prefer reading a real helper if one exists near `lolLinkedPuuidFromAuth`.

- [ ] **Step 2: Type-check**

```bash
cd upforge-desktop && npm run type-check
```

---

### Task 6: Emit activity lines at LoL match end / enrich / clips

**Files:**
- Modify: `upforge-desktop/electron/main/index.ts` (match end after timeline built; enrich completion; clip pipeline call site)
- Modify: `upforge-desktop/electron/main/lol-match-v5-enrich.ts` only if needed to surface status to caller (prefer reading `timeline.lolEnrichStatus` after `enrichLolTimelineForCoaching`)
- Modify: `upforge-desktop/electron/main/clip-pipeline.ts` (LoL-specific activity when kills lack offsets) OR call site in index that already logs `No clips extracted — all kills lacked video timestamps`

- [ ] **Step 1: After LoL timeline built in `handleMatchEnd`**

```ts
if (normalizePrimaryGame(game) === 'lol') {
  logActivity(formatLolMatchEndActivity({
    source, // finalize source param
    gameId: timeline?.matchId ?? null,
    queueId: timeline?.queueId ?? null,
  }), 'lol')
}
```

Ensure `source` is in scope (thread from `finalizeMatchOnce(game, source)` into `handleMatchEnd` if needed).

- [ ] **Step 2: After LoL enrich settles** (in `prepareTimelineForCoaching` or upload enrich path)

```ts
if (game === 'lol' && timeline) {
  const status = timeline.lolEnrichStatus
  if (status === 'fetched' || status === 'fetch_failed' || status === 'no_match_id' || status === 'no_auth') {
    logActivity(formatLolLinkActivity({
      status,
      hasGameId: Boolean(timeline.matchId),
      queueId: timeline.queueId,
    }), 'lol')
  }
}
```

Keep existing user-facing enrich `onStatus` messages; this line is the structured one for support.

- [ ] **Step 3: Clips**

Where activity currently says `No clips extracted — all kills lacked video timestamps`, if `timeline?.game === 'lol'`:

```ts
this.ctx.logActivity(formatLolClipsSkippedActivity(killCount))
```

Replace em dash in any nearby new strings; if touching the existing generic string, prefer leaving it unless you are already editing that line for LoL branching.

- [ ] **Step 4: CS2/Deadlock one-liner**

When `usesDemoReplay(game)` and `!pendingReplayPath` at match end:

```ts
logActivity(`${game === 'cs2' ? 'CS2' : 'Deadlock'} demo missing at match end`, game)
```

(Skip if an equivalent line already fires.)

- [ ] **Step 5: Run focused tests + type-check**

```bash
cd upforge-desktop && npx vitest run electron/main/lol-enrich-activity.test.ts electron/main/support-diagnostics.test.ts electron/main/network-diagnostics.test.ts && npm run type-check
```

Expected: all PASS.

---

### Task 7: Spec status + manual checklist

**Files:**
- Modify: `upforge-desktop/docs/superpowers/specs/2026-08-13-non-valorant-support-diagnostics-design.md` (Status → Implemented)

- [ ] **Step 1: Update spec status** to `Implemented` when code is done.

- [ ] **Step 2: Manual checklist (local)**

1. Copy support bundle with no recent match → LAST MATCH empty + LEAGUE probed.
2. After a LoL finalize (or fixture path if available): LAST MATCH has game/matchId/endReason; activity has `Match ended (...)` and `LoL link: ...`.
3. Confirm bundle has no password / full puuid / em dashes.

---

## Spec coverage self-check

| Spec item | Task |
|-----------|------|
| LAST MATCH section | 2, 3, 4, 5 |
| LEAGUE section (LCU + Live Client + account flags) | 2, 3, 5 |
| CS2/DEADLOCK section | 2, 3, 5, 6 |
| Keep Valorant RIOT CLIENT | 3 |
| LoL match-end activity | 1, 6 |
| LoL enrich terminal activity | 1, 6 |
| LoL clips timestamps activity | 1, 6 |
| Extend LastMatchDiagnostic | 4 |
| No secrets / no Match-V5 product fix | Global + 5 |
| Tests | 1–3, 6 |

## Placeholder scan

None intentional. Exact strings use ASCII hyphens.
