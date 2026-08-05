# Valorant The Range Recording Opt-in Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add The Range as an opt-in chip under Settings → Recording → Record game modes, default off, so Range sessions are not recorded unless selected.

**Architecture:** Reuse the existing `recordedModes` / `ALL_MODES` filter in `electron/main/index.ts`. Map Riot `rangev2` → `SHOOTING_RANGE`, add that id to the settings chip list and to `ALL_MODES` so “all listed modes selected” no longer silently includes Range.

**Tech Stack:** Electron main process TypeScript, Vue 3 settings UI, Vitest.

## Global Constraints

- Value id: `SHOOTING_RANGE` (matches `PRACTICE_MODES` in `match-details-validation.ts`)
- Default `recordedModes` stays `['COMPETITIVE', 'PREMIER']` (Range never auto-enabled)
- No separate toggle flag; one chip in the existing grid
- No em dashes in user-facing copy; no Discord announcement in this change
- Do not commit unless the user asks

---

### Task 1: Map `rangev2` → `SHOOTING_RANGE`

**Files:**
- Modify: `electron/main/riot-local-api.ts` (`_normalizeQueueId` map)
- Modify: `electron/main/match-details-validation.ts` (local `normalizeQueueId` map, keep in sync)
- Create: `electron/main/riot-queue-id.test.ts`

**Interfaces:**
- Consumes: existing `export function normalizeQueueId(queueId: string): string`
- Produces: `normalizeQueueId('rangev2') === 'SHOOTING_RANGE'`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest'
import { normalizeQueueId } from './riot-local-api'

describe('normalizeQueueId', () => {
  it('maps The Range queue id to SHOOTING_RANGE', () => {
    expect(normalizeQueueId('rangev2')).toBe('SHOOTING_RANGE')
    expect(normalizeQueueId('RANGEV2')).toBe('SHOOTING_RANGE')
  })

  it('still maps competitive and hurm', () => {
    expect(normalizeQueueId('competitive')).toBe('COMPETITIVE')
    expect(normalizeQueueId('hurm')).toBe('TEAMDEATHMATCH')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd upforge-desktop && npx vitest run electron/main/riot-queue-id.test.ts`

Expected: FAIL (`RANGEV2` received, or similar)

- [ ] **Step 3: Implement mapping**

In both `_normalizeQueueId` maps add:

```ts
rangev2: 'SHOOTING_RANGE',
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd upforge-desktop && npx vitest run electron/main/riot-queue-id.test.ts`

Expected: PASS

---

### Task 2: Include `SHOOTING_RANGE` in `ALL_MODES` filter sets

**Files:**
- Modify: `electron/main/index.ts` (~line 2494 `ALL_MODES` Set)
- Modify: `electron/main/settings-manager.ts` (~line 253 legacy `recordingMode: 'all'` list)

**Interfaces:**
- Consumes: Task 1 mode id `SHOOTING_RANGE`
- Produces: `filterByMode` stays true for installs that selected every *pre-Range* mode

- [ ] **Step 1: Update runtime `ALL_MODES`**

```ts
const ALL_MODES = new Set([
  'COMPETITIVE', 'PREMIER', 'CLASSIC', 'DEATHMATCH', 'TEAMDEATHMATCH',
  'SPIKERUSH', 'SWIFTPLAY', 'SNOWBALL', 'SHOOTING_RANGE',
])
```

- [ ] **Step 2: Update legacy migration list in `settings-manager.ts`**

```ts
const ALL_MODES = [
  'COMPETITIVE', 'PREMIER', 'CLASSIC', 'DEATHMATCH', 'SPIKERUSH',
  'SWIFTPLAY', 'TEAMDEATHMATCH', 'SNOWBALL', 'SHOOTING_RANGE',
]
```

(Keep defaults `recordedModes: ['COMPETITIVE', 'PREMIER']` unchanged.)

- [ ] **Step 3: Smoke type-check / existing ensure tests still pass**

Run: `cd upforge-desktop && npx vitest run electron/main/settings-manager.test.ts electron/main/riot-queue-id.test.ts 2>&1 | tail -20`

(If `settings-manager.test.ts` does not exist, run `riot-queue-id.test.ts` only.)

---

### Task 3: Settings chip + display label

**Files:**
- Modify: `src/composables/useSettings.ts` (`GAME_MODES` array)
- Modify: `src/lib/valorant.ts` (mode label map used by `formatGameMode`)

**Interfaces:**
- Consumes: value `SHOOTING_RANGE`
- Produces: chip visible in Settings → Recording; `formatGameMode('SHOOTING_RANGE')` → `The Range`

- [ ] **Step 1: Add chip**

```ts
{ value: 'SHOOTING_RANGE', label: 'The Range', hint: 'Practice range' },
```

Append after `TEAMDEATHMATCH` in `GAME_MODES`.

- [ ] **Step 2: Add label**

In the mode labels object in `src/lib/valorant.ts`:

```ts
SHOOTING_RANGE: 'The Range',
RANGEV2: 'The Range', // legacy uppercase queue fallback
```

- [ ] **Step 3: Verify type-check clean for touched files**

Run: `cd upforge-desktop && npm run type-check 2>&1 | rg "useSettings|valorant\.ts|riot-local|settings-manager|index\.ts" || echo CLEAN`

---

### Task 4: Verify end-to-end gate behaviour (automated where cheap)

**Files:**
- Create if helpful: `electron/main/recorded-modes-filter.test.ts` (pure helper optional)

Prefer extracting a tiny pure helper only if the gate is hard to test in place:

```ts
export function isValorantModeFilteredOut(
  recordedModes: string[],
  allModes: readonly string[],
  gameMode: string | null,
): boolean {
  if (!gameMode || recordedModes.length === 0) return false
  const filterByMode = !allModes.every((m) => recordedModes.includes(m))
  return filterByMode && !recordedModes.includes(gameMode)
}
```

Only extract if wiring is trivial; otherwise document manual check:

1. Chip off → enter The Range → activity: mode not in recorded modes / no OBS record
2. Chip on → Range records

- [ ] **Step 1: Prefer pure helper test** covering:
  - `recordedModes = ['COMPETITIVE','PREMIER']`, `gameMode = 'SHOOTING_RANGE'` → filtered out
  - same + `SHOOTING_RANGE` in recordedModes → not filtered out
  - all modes including `SHOOTING_RANGE` selected → not filtered (filterByMode false)

- [ ] **Step 2: Run full related vitest**

Run: `cd upforge-desktop && npx vitest run electron/main/riot-queue-id.test.ts electron/main/recorded-modes-filter.test.ts src/lib --exclude '.worktrees/**' 2>&1 | tail -15`

---

## Spec coverage

| Spec item | Task |
|-----------|------|
| Settings chip The Range / Practice range / `SHOOTING_RANGE` | 3 |
| `rangev2` → `SHOOTING_RANGE` | 1 |
| `ALL_MODES` includes Range | 2 |
| Defaults unchanged | 2 (explicit non-change) |
| Skip via existing filter | 2 + 4 |
| Unit test normalize | 1 |
| Manual Range on/off | 4 |

## Self-review

- No placeholders.
- Mode id consistent: `SHOOTING_RANGE` everywhere.
- Out of scope (Custom/NEWMAP, Discord) not in tasks.
