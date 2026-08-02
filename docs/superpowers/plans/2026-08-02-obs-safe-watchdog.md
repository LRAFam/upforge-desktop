# OBS Safe Watchdog Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Harden UpForge↔OBS so connected match starts actually arm recording, UpForge never kills a live encode, and OBS process death mid-match reclaims orphan files instead of hanging on reconnect forever.

**Architecture:** Add a pure `obs-watchdog-policy` module as the single kill/reclaim decision source. Strengthen `OBSRecorder.start()` (stale clear + StartRecord verify). Ban hot capture/video mutations. Extend reconnect logic to detect process death and finalize via existing path resolver. Wire DNFs already defined in `match-telemetry.ts`.

**Tech Stack:** Electron main (TypeScript), `obs-websocket-js`, Vitest, existing `obs-*.ts` modules.

**Spec:** `docs/superpowers/specs/2026-08-02-obs-safe-watchdog-design.md`

## Global Constraints

- Never call `terminateObsProcess` while OBS process is alive and (match-owned recording OR `outputActive` OR disconnected-during-recording).
- Mid-match OBS process death → reclaim/finalize only; relaunch only after ownership released (next-match readiness).
- Do not replace OBS; do not rewrite all of `index.ts`.
- Prefer colocated `electron/main/*.test.ts` Vitest patterns.
- Do not commit unless the user asks (skip commit steps or ask first).
- Verification: `cd upforge-desktop && npx vitest run <test-file>` and `npm run type-check` when touching shared types.

## File map

| File | Responsibility |
|------|----------------|
| `electron/main/obs-watchdog-policy.ts` | Pure classify: hard recover / reclaim / relaunch-after-finalize / hot-mutation allowed |
| `electron/main/obs-watchdog-policy.test.ts` | Policy unit tests |
| `electron/main/obs-recorder.ts` | Stronger clear, start verify, process-dead poll in reconnect loop, callbacks |
| `electron/main/obs-recorder-start-arm.test.ts` | Pure helpers for clear/verify if extracted; otherwise policy-adjacent tests |
| `electron/main/obs-ensure.ts` | Use policy when deciding kill (caller still passes `allowProcessRestart`; policy is source of truth at call sites) |
| `electron/main/obs-health.ts` | No logic change required if `canHardRecover` uses policy in `index.ts` |
| `electron/main/obs-setup.ts` | Refuse recreate/prune when `allowHotMutations === false` |
| `electron/main/obs-output-settings.ts` | Skip `SetVideoSettings` when outputs hot / `allowVideoSettings === false` |
| `electron/main/match-telemetry.ts` | Already has `unowned_obs_recording`; add `start_verify_failed` only if needed |
| `electron/main/index.ts` | Policy-gated `canHardRecover` / `allowProcessRestart`; DNF wiring; process-dead finalize hook |
| `electron/main/recording-errors.ts` | Classify start-verify / unowned messages if needed for Sentry filtering |

---

### Task 1: Watchdog policy (pure)

**Files:**
- Create: `upforge-desktop/electron/main/obs-watchdog-policy.ts`
- Create: `upforge-desktop/electron/main/obs-watchdog-policy.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface ObsWatchdogSnapshot {
    processRunning: boolean
    matchOwned: boolean
    activelyRecording: boolean
    disconnectedDuringRecording: boolean
    outputActive: boolean
    matchPerformanceModeActive?: boolean
  }

  /** True only when kill+relaunch cannot interrupt a writing encode. */
  export function canHardRecoverObs(s: ObsWatchdogSnapshot): boolean

  /** Process gone while we still owned a match capture. */
  export function shouldReclaimAfterProcessDeath(s: ObsWatchdogSnapshot): boolean

  /** After finalize, idle hard recover / launch for next match is OK. */
  export function shouldRelaunchAfterFinalize(s: ObsWatchdogSnapshot): boolean

  /** Capture recreate / SetVideoSettings allowed only when cold. */
  export function canMutateObsCaptureHot(s: Pick<
    ObsWatchdogSnapshot,
    'matchOwned' | 'activelyRecording' | 'disconnectedDuringRecording' | 'outputActive'
  >): boolean
  ```

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from 'vitest'
import {
  canHardRecoverObs,
  canMutateObsCaptureHot,
  shouldReclaimAfterProcessDeath,
  shouldRelaunchAfterFinalize,
} from './obs-watchdog-policy'

const idle = {
  processRunning: true,
  matchOwned: false,
  activelyRecording: false,
  disconnectedDuringRecording: false,
  outputActive: false,
}

describe('canHardRecoverObs', () => {
  it('allows hard recover when idle', () => {
    expect(canHardRecoverObs(idle)).toBe(true)
  })

  it('blocks when match-owned / actively recording / disconnected-during / outputActive / perf mode', () => {
    expect(canHardRecoverObs({ ...idle, matchOwned: true })).toBe(false)
    expect(canHardRecoverObs({ ...idle, activelyRecording: true })).toBe(false)
    expect(canHardRecoverObs({ ...idle, disconnectedDuringRecording: true })).toBe(false)
    expect(canHardRecoverObs({ ...idle, outputActive: true })).toBe(false)
    expect(canHardRecoverObs({ ...idle, matchPerformanceModeActive: true })).toBe(false)
  })
})

describe('shouldReclaimAfterProcessDeath', () => {
  it('reclaims when process dead and match owned', () => {
    expect(shouldReclaimAfterProcessDeath({
      ...idle,
      processRunning: false,
      matchOwned: true,
    })).toBe(true)
  })

  it('does not reclaim when process still running', () => {
    expect(shouldReclaimAfterProcessDeath({ ...idle, matchOwned: true })).toBe(false)
  })
})

describe('shouldRelaunchAfterFinalize', () => {
  it('allows relaunch when process dead and ownership already released', () => {
    expect(shouldRelaunchAfterFinalize({
      ...idle,
      processRunning: false,
      matchOwned: false,
    })).toBe(true)
  })

  it('blocks relaunch while still match-owned', () => {
    expect(shouldRelaunchAfterFinalize({
      ...idle,
      processRunning: false,
      matchOwned: true,
    })).toBe(false)
  })
})

describe('canMutateObsCaptureHot', () => {
  it('allows cold mutations', () => {
    expect(canMutateObsCaptureHot(idle)).toBe(true)
  })

  it('blocks while owned / active / disconnected-during / outputActive', () => {
    expect(canMutateObsCaptureHot({ ...idle, outputActive: true })).toBe(false)
    expect(canMutateObsCaptureHot({ ...idle, matchOwned: true })).toBe(false)
  })
})
```

- [ ] **Step 2: Run tests — expect FAIL (module missing)**

```bash
cd upforge-desktop && npx vitest run electron/main/obs-watchdog-policy.test.ts
```

Expected: FAIL cannot find module / export.

- [ ] **Step 3: Implement policy**

```ts
export interface ObsWatchdogSnapshot {
  processRunning: boolean
  matchOwned: boolean
  activelyRecording: boolean
  disconnectedDuringRecording: boolean
  outputActive: boolean
  matchPerformanceModeActive?: boolean
}

function encodeSensitive(s: ObsWatchdogSnapshot): boolean {
  return (
    s.matchOwned
    || s.activelyRecording
    || s.disconnectedDuringRecording
    || s.outputActive
    || s.matchPerformanceModeActive === true
  )
}

export function canHardRecoverObs(s: ObsWatchdogSnapshot): boolean {
  if (!s.processRunning) return false // nothing to kill; launch path is separate
  return !encodeSensitive(s)
}

export function shouldReclaimAfterProcessDeath(s: ObsWatchdogSnapshot): boolean {
  return !s.processRunning && s.matchOwned
}

export function shouldRelaunchAfterFinalize(s: ObsWatchdogSnapshot): boolean {
  return !s.processRunning && !s.matchOwned && !s.activelyRecording && !s.disconnectedDuringRecording
}

export function canMutateObsCaptureHot(s: Pick<
  ObsWatchdogSnapshot,
  'matchOwned' | 'activelyRecording' | 'disconnectedDuringRecording' | 'outputActive'
>): boolean {
  return !(
    s.matchOwned
    || s.activelyRecording
    || s.disconnectedDuringRecording
    || s.outputActive
  )
}
```

Note: `canHardRecoverObs` returns false when process is already dead (caller uses launch, not kill). Idle+running → true.

- [ ] **Step 4: Run tests — expect PASS**

```bash
cd upforge-desktop && npx vitest run electron/main/obs-watchdog-policy.test.ts
```

- [ ] **Step 5: Commit (only if user asked)**

```bash
git add electron/main/obs-watchdog-policy.ts electron/main/obs-watchdog-policy.test.ts
git commit -m "$(cat <<'EOF'
feat(obs): add safe watchdog kill/reclaim policy

EOF
)"
```

---

### Task 2: Gate hard recover on policy

**Files:**
- Modify: `upforge-desktop/electron/main/index.ts` (`ensureObsReady`, `startObsHealthMonitor` `canHardRecover`)
- Modify: `upforge-desktop/electron/main/obs-ensure.test.ts` only if needed for clarity (behavior already gated by `allowProcessRestart`)

**Interfaces:**
- Consumes: `canHardRecoverObs` from Task 1
- Produces: shared helper used by both call sites, e.g. in `index.ts`:

```ts
function obsWatchdogSnapshot(extra?: Partial<ObsWatchdogSnapshot>): ObsWatchdogSnapshot {
  return {
    processRunning: true, // caller overrides when known
    matchOwned: obsRecorder.isRecording(),
    activelyRecording: obsRecorder.isActivelyRecording(),
    disconnectedDuringRecording: obsRecorder.hadDisconnectedDuringRecording(),
    outputActive: false, // async; soft-fail closed when unknown at sync gates
    matchPerformanceModeActive,
    ...extra,
  }
}
```

For sync gates (`canHardRecover`, `allowProcessRestart`), treat unknown `outputActive` as `false` only when ownership flags are already checked; ownership flags are the kill ban. Do **not** kill based on “WS down” alone while `isRecording()` or `hadDisconnectedDuringRecording()`.

- [ ] **Step 1: Replace boolean soup in `ensureObsReady`**

Change:

```ts
const allowProcessRestart = opts?.allowProcessRestart !== false
  && !obsRecorder.isActivelyRecording()
  && !obsRecorder.isRecording()
  && !obsRecorder.hadDisconnectedDuringRecording()
  && !matchPerformanceModeActive
```

To:

```ts
const allowProcessRestart = opts?.allowProcessRestart !== false
  && canHardRecoverObs(obsWatchdogSnapshot({ processRunning: true }))
```

- [ ] **Step 2: Replace health `canHardRecover` the same way**

```ts
canHardRecover: () => canHardRecoverObs(obsWatchdogSnapshot({ processRunning: true })),
```

- [ ] **Step 3: Type-check / existing ensure tests**

```bash
cd upforge-desktop && npx vitest run electron/main/obs-ensure.test.ts electron/main/obs-watchdog-policy.test.ts
cd upforge-desktop && npm run type-check
```

Expected: PASS.

- [ ] **Step 4: Commit (only if user asked)**

---

### Task 3: Stronger unowned clear + DNF `unowned_obs_recording`

**Files:**
- Modify: `upforge-desktop/electron/main/obs-recorder.ts` (`_resolveUnownedObsRecordState`)
- Create: `upforge-desktop/electron/main/obs-unowned-clear.ts` (pure settle/retry decisions optional) **OR** keep logic in recorder and test via extracted helpers
- Create: `upforge-desktop/electron/main/obs-unowned-clear.test.ts`
- Modify: `upforge-desktop/electron/main/index.ts` start-failure DNF mapping (~4141)

**Interfaces:**
- Produces:

```ts
/** Decide next action while clearing unowned OBS output. */
export type UnownedClearPhase = 'settle' | 'stop' | 'recheck' | 'cleared' | 'blocked'

export function nextUnownedClearAction(opts: {
  attempt: number // 0-based stop attempts completed
  maxStopAttempts: number
  outputActive: boolean
}): 'cleared' | 'stop' | 'blocked'
```

Logic: if `!outputActive` → `cleared`; if `attempt < maxStopAttempts` → `stop`; else `blocked`.  
Use `maxStopAttempts = 2`. Settle delays stay in recorder (1s before first stop, 400–800ms after each stop).

- [ ] **Step 1: Failing tests for `nextUnownedClearAction`**

```ts
import { describe, expect, it } from 'vitest'
import { nextUnownedClearAction } from './obs-unowned-clear'

describe('nextUnownedClearAction', () => {
  it('clears when idle', () => {
    expect(nextUnownedClearAction({ attempt: 0, maxStopAttempts: 2, outputActive: false })).toBe('cleared')
  })

  it('stops while attempts remain', () => {
    expect(nextUnownedClearAction({ attempt: 0, maxStopAttempts: 2, outputActive: true })).toBe('stop')
    expect(nextUnownedClearAction({ attempt: 1, maxStopAttempts: 2, outputActive: true })).toBe('stop')
  })

  it('blocks after max attempts', () => {
    expect(nextUnownedClearAction({ attempt: 2, maxStopAttempts: 2, outputActive: true })).toBe('blocked')
  })
})
```

- [ ] **Step 2: Implement helper + wire `_resolveUnownedObsRecordState`**

Pseudo-flow in recorder:

```ts
// after first GetRecordStatus shows unowned outputActive:
await sleep(1000)
for (let attempt = 0; ; attempt++) {
  const status = await GetRecordStatus()
  const action = nextUnownedClearAction({ attempt, maxStopAttempts: 2, outputActive: !!status.outputActive })
  if (action === 'cleared') return 'cleared' // or 'idle' if never was active — keep existing 'idle'|'cleared'|'blocked'
  if (action === 'blocked') return 'blocked'
  await StopRecord().catch(...)
  await sleep(800)
}
```

Preserve return type `'idle' | 'cleared' | 'blocked'`. If never active → `'idle'`.

- [ ] **Step 3: Wire DNF in `index.ts`**

```ts
if (/already recording/i.test(msg) || /unowned/i.test(msg)) {
  telemetry.setDnf('unowned_obs_recording', msg)
} else if (/Advanced/i.test(msg)) {
  telemetry.setDnf('advanced_output', msg)
} else if (isObsUnavailableError(msg)) {
  telemetry.setDnf('obs_not_ready', msg)
} else {
  telemetry.setDnf('other', msg)
}
```

Keep throw message from start() including “OBS is already recording…” so the regex matches.

- [ ] **Step 4: Run tests**

```bash
cd upforge-desktop && npx vitest run electron/main/obs-unowned-clear.test.ts
```

- [ ] **Step 5: Commit (only if user asked)**

---

### Task 4: StartRecord verify before ownership

**Files:**
- Create: `upforge-desktop/electron/main/obs-start-verify.ts`
- Create: `upforge-desktop/electron/main/obs-start-verify.test.ts`
- Modify: `upforge-desktop/electron/main/obs-recorder.ts` `start()`
- Modify: `upforge-desktop/electron/main/index.ts` DNF for verify failure → `other` with detail, or add `start_verify_failed` to `RecordingDnfReason`

**Interfaces:**
- Produces:

```ts
export async function waitForObsRecordArmed(opts: {
  getOutputActive: () => Promise<boolean>
  timeoutMs?: number // default 5000
  intervalMs?: number // default 250
  now?: () => number
  sleep?: (ms: number) => Promise<void>
}): Promise<{ armed: true } | { armed: false; timedOut: true }>
```

- [ ] **Step 1: Failing tests with fake clock/sleep**

```ts
import { describe, expect, it, vi } from 'vitest'
import { waitForObsRecordArmed } from './obs-start-verify'

describe('waitForObsRecordArmed', () => {
  it('returns armed when output becomes active', async () => {
    let n = 0
    const result = await waitForObsRecordArmed({
      getOutputActive: async () => (++n) >= 2,
      timeoutMs: 1000,
      intervalMs: 10,
      sleep: async () => {},
    })
    expect(result).toEqual({ armed: true })
  })

  it('times out when never active', async () => {
    let now = 0
    const result = await waitForObsRecordArmed({
      getOutputActive: async () => false,
      timeoutMs: 100,
      intervalMs: 50,
      now: () => now,
      sleep: async (ms) => { now += ms },
    })
    expect(result).toEqual({ armed: false, timedOut: true })
  })
})
```

- [ ] **Step 2: Implement `waitForObsRecordArmed`**

- [ ] **Step 3: Change `start()` ownership order**

Today (bad):

```ts
await this._obs.call('StartRecord')
this._matchOwnedRecording = true
this._recording = true
```

Replace with:

```ts
if (!this._clipsOnlySession) {
  await this._obs.call('StartRecord')
  const armed = await waitForObsRecordArmed({
    getOutputActive: async () => {
      const s = await this._obs.call('GetRecordStatus') as { outputActive?: boolean }
      return !!s.outputActive
    },
  })
  if (!armed.armed) {
    throw new Error('OBS StartRecord did not become active within 5s')
  }
}
this._matchOwnedRecording = true
// ... rest
```

On throw, existing catch already clears ownership flags.

- [ ] **Step 4: DNF mapping**

```ts
} else if (/did not become active/i.test(msg)) {
  telemetry.setDnf('other', msg) // or add 'start_verify_failed' to RecordingDnfReason + tests
}
```

Prefer adding `'start_verify_failed'` to `RecordingDnfReason` in `match-telemetry.ts` and a one-line test in `match-telemetry.test.ts`.

- [ ] **Step 5: Run tests + type-check**

```bash
cd upforge-desktop && npx vitest run electron/main/obs-start-verify.test.ts electron/main/match-telemetry.test.ts
cd upforge-desktop && npm run type-check
```

- [ ] **Step 6: Commit (only if user asked)**

---

### Task 5: Hot mutation ban (capture + video)

**Files:**
- Modify: `upforge-desktop/electron/main/obs-setup.ts` (`ensureUpForgeCapture` / `retargetUpForgeCapture` options)
- Modify: `upforge-desktop/electron/main/obs-output-settings.ts`
- Modify: `upforge-desktop/electron/main/obs-recorder.ts` (`retargetOptionsForGame`, gameplay refit)
- Create/Modify tests: `obs-setup` may lack tests — add `obs-hot-mutation.test.ts` testing a thin wrapper, or test `canMutateObsCaptureHot` usage via options builder

**Interfaces:**
- Extend options:

```ts
// obs-setup EnsureUpForgeCaptureOptions
allowRecreate?: boolean // default true for backward compat; false → never RemoveInput/CreateInput

// applyObsRecordingSettings config flag or param
allowVideoSettings?: boolean // default true; false → skip SetVideoSettings
```

- [ ] **Step 1: In `ensureUpForgeCapture`, when `allowRecreate === false`**

If kind/window needs recreate, only `SetInputSettings` when same `inputKind`; if kind differs, log warning and skip recreate (return existing). Never call `pruneUpForgeCaptureSources` / `CreateInput` when `allowRecreate === false`.

- [ ] **Step 2: `retargetOptionsForGame`**

```ts
private retargetOptionsForGame(game: string, forRecording = false): ObsSceneSwitchOptions {
  const gameChanged = this._lastCaptureGame !== null && this._lastCaptureGame !== game
  const cold = canMutateObsCaptureHot({
    matchOwned: this._matchOwnedRecording,
    activelyRecording: this._recording,
    disconnectedDuringRecording: this._disconnectedDuringRecording,
    outputActive: false, // start() already cleared unowned active; during gameplay refit use stricter path
  })
  return {
    ...this.obsSceneOptions(),
    forceRecreate: cold && gameChanged,
    allowRecreate: cold,
    refitAfterSettle: gameChanged || forRecording,
  }
}
```

For gameplay refit (`_recording === true`), `cold` is false → no recreate.

- [ ] **Step 3: `applyObsRecordingSettings`**

Before `SetVideoSettings`, if `config.allowVideoSettings === false` OR a passed `outputsHot` flag, skip and push warning. From `start()`, after unowned clear, outputs should be idle — keep `allowVideoSettings: true` at pre-start. Gameplay paths must not call apply with video changes while hot.

- [ ] **Step 4: Unit test the options builder if extracted**

```ts
export function buildRetargetMutationFlags(opts: {
  gameChanged: boolean
  matchOwned: boolean
  recording: boolean
  disconnectedDuringRecording: boolean
}): { forceRecreate: boolean; allowRecreate: boolean } {
  const cold = canMutateObsCaptureHot({
    matchOwned: opts.matchOwned,
    activelyRecording: opts.recording,
    disconnectedDuringRecording: opts.disconnectedDuringRecording,
    outputActive: false,
  })
  return {
    forceRecreate: cold && opts.gameChanged,
    allowRecreate: cold,
  }
}
```

- [ ] **Step 5: Run tests**

```bash
cd upforge-desktop && npx vitest run electron/main/obs-watchdog-policy.test.ts electron/main/obs-hot-mutation.test.ts
```

- [ ] **Step 6: Commit (only if user asked)**

---

### Task 6: Process-death reclaim path

**Files:**
- Modify: `upforge-desktop/electron/main/obs-recorder.ts` (`_attemptReconnectDuringRecording`)
- Modify: `upforge-desktop/electron/main/index.ts` (wire `onObsProcessDiedDuringMatch`)
- Create: `upforge-desktop/electron/main/obs-process-death.test.ts` for pure decision helper if extracted

**Interfaces:**
- Consumes: `shouldReclaimAfterProcessDeath`, `isObsProcessRunning`
- Produces on `OBSRecorder`:

```ts
/** Fired once when OBS process exits while match-owned (not mere WS drop). */
onObsProcessDiedDuringMatch: (() => void) | null = null
```

Internal flag `_obsProcessDiedDuringMatch` to avoid double-fire.

- [ ] **Step 1: In `_attemptReconnectDuringRecording`, before/after failed connect**

```ts
const processRunning = await isObsProcessRunning()
if (shouldReclaimAfterProcessDeath({
  processRunning,
  matchOwned: this._matchOwnedRecording,
  activelyRecording: this._recording,
  disconnectedDuringRecording: this._disconnectedDuringRecording,
  outputActive: false,
})) {
  if (!this._obsProcessDiedDuringMatch) {
    this._obsProcessDiedDuringMatch = true
    this._stopReconnectLoop()
    log.warn('[OBSRecorder] OBS process exited during match — reclaiming')
    this.onStatusChange?.(false, 'OBS process exited during recording')
    this.onObsProcessDiedDuringMatch?.()
  }
  return
}
// else existing soft reconnect...
```

Reset `_obsProcessDiedDuringMatch` on successful `start()`.

- [ ] **Step 2: Wire in `index.ts` near `onRecoveredDuringMatch`**

```ts
rec.onObsProcessDiedDuringMatch = () => {
  logActivity('OBS process exited — reclaiming recording file if present')
  // Trigger the same finalize path used for unexpected end:
  // prefer existing finishActiveMatch / handleMatchEnd if a match is in flight.
  void finalizeAfterObsProcessDeath()
}
```

Implement `finalizeAfterObsProcessDeath` using the **existing** match-end entry that already calls `obsRecorder.stop()` / path resolver (find the function that `game-stopped` / presence end uses — e.g. `finishActiveMatch` or `handleMatchEnd`). Must be idempotent with `matchFinalizeInFlight`.

Do **not** call `terminateObsProcess`. After finalize releases ownership, optional `ensureObsReady({ allowProcessRestart: true })` only if `shouldRelaunchAfterFinalize(...)`.

- [ ] **Step 3: stop() / path resolve**

On process-death finalize, `stop()` may fail to reconnect — existing code returns last `_outputPath`; ensure `handleMatchEnd` still runs `resolveReadyRecordingPathDetailed` (already present ~2719). Add activity log if path missing.

- [ ] **Step 4: Test pure guard**

```ts
it('process death while owned triggers reclaim decision', () => {
  expect(shouldReclaimAfterProcessDeath({
    processRunning: false,
    matchOwned: true,
    activelyRecording: false,
    disconnectedDuringRecording: true,
    outputActive: false,
  })).toBe(true)
})
```

(Covered in Task 1; add integration-style comment in recorder if no new file.)

- [ ] **Step 5: type-check**

```bash
cd upforge-desktop && npm run type-check
```

- [ ] **Step 6: Commit (only if user asked)**

---

### Task 7: UX copy + recording-errors classification

**Files:**
- Modify: `upforge-desktop/electron/main/recording-errors.ts`
- Modify: `upforge-desktop/electron/main/index.ts` notifications (rate-limited activity already exists)

- [ ] **Step 1: Extend expected/benign patterns**

Include:
- `already recording`
- `did not become active`
- `OBS process exited`

so they are not noisy in error monitoring (follow existing `recording-errors.ts` style).

- [ ] **Step 2: Distinct activity strings** (already partly specified in Task 6)

| Case | Activity / notify |
|------|-------------------|
| Unowned blocked | “OBS is already recording — stop it in OBS, then UpForge can capture.” |
| Start verify fail | “OBS did not start recording — check OBS Output settings.” |
| WS disconnect mid-match | existing disconnected copy |
| Process died | “OBS process exited — reclaiming recording file if present.” |
| Stuck alive hung | only if we detect outputActive stuck after stop — “OBS looks stuck recording. Stop recording in OBS after the match.” |

- [ ] **Step 3: Commit (only if user asked)**

---

### Task 8: Verification sweep

- [ ] **Step 1: Run unit suite for OBS hardening**

```bash
cd upforge-desktop && npx vitest run \
  electron/main/obs-watchdog-policy.test.ts \
  electron/main/obs-unowned-clear.test.ts \
  electron/main/obs-start-verify.test.ts \
  electron/main/obs-disconnect-guard.test.ts \
  electron/main/obs-ensure.test.ts \
  electron/main/match-telemetry.test.ts
```

Expected: all PASS.

- [ ] **Step 2: Type-check**

```bash
cd upforge-desktop && npm run type-check
```

- [ ] **Step 3: Manual QA checklist (human)**

1. Valorant: normal match → recording arms (UI + OBS shows Recording).
2. Manually start OBS recording, then queue a match → UpForge clears or DNFs `unowned_obs_recording` (no silent miss).
3. Mid-match: kill `obs64.exe` externally → UpForge logs process exited, attempts file reclaim, does **not** `taskkill` a live encode earlier.
4. Mid-match: disable network to WS only if possible / restart obs-websocket — soft reconnect, no kill.
5. CS2 or Deadlock: cold start retarget works; no recreate spam mid-match.

- [ ] **Step 4: Update spec status to Implemented (optional note in design doc)**

---

## Spec coverage check

| Spec section | Task |
|--------------|------|
| §4 Kill/restart policy | 1, 2 |
| §6.1 Start-arm clear + verify + DNF | 3, 4 |
| §6.2 Hot mutation ban | 5 |
| §6.3 Process-dead reclaim | 6 |
| §6.4 Stop→file settle | 6 (reuse resolver); no change to Hybrid MP4 |
| §6.5 Telemetry/UX | 3, 4, 7 |
| §7 Testing | each task + 8 |
| Never kill writing encode | 1, 2, 6 |

## Placeholder / consistency notes

- DNF name for verify failure: prefer `start_verify_failed` added in Task 4 (not left as vague `other` only).
- `obsWatchdogSnapshot` lives in `index.ts` for wiring; policy stays pure.
- Commit steps are optional per repo/user rules.
