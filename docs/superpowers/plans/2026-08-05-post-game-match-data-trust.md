# Post-game match-data trust UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hard-block Analyse while Riot match stats are syncing, show a calm waiting state instead of a red failure, and split failures into friendly player copy vs technical ops reporting.

**Architecture:** Keep `getAnalysisReadiness` as the source of truth. Main-process Analyse already calls `ensureAnalysisReadinessForAnalyse`; harden every UI entry point to honor `not_ready` without entering the red error modal. Route player-facing strings through activation catalog overrides on `buildAnalysisErrorPayload`, while `reportPipelineError` keeps the raw technical message. Fix `recordings:save-to-cloud` so it returns structured friendly fields instead of a hard-coded generic string.

**Tech Stack:** Electron main + Vue 3 renderer (TypeScript), Vitest, existing `analysis-readiness.ts`, `activation-error-codes.ts`, `analysis-failure-messages.ts`, `pipeline-errors.ts`.

**Spec:** `docs/superpowers/specs/2026-08-05-post-game-match-data-trust-design.md`

## Global Constraints

- Desktop only (`upforge-desktop`); no API migrate for this pass.
- Analyse must not start unless `getAnalysisReadiness(rec).ready === true` (except existing cloud jobId retry that re-submits an already-uploaded VOD).
- Save-to-cloud / archive-only may run without rich match data.
- Player UI: friendly title/message/hint only. Never show stack traces, S3 XML, or long HTTP dumps.
- Ops: pass `technicalMessage` into `reportPipelineError` / `reportError`; `syncing` / `waiting_match_data` are not failures (no Discord).
- Copy: no emojis, no em dashes (anti-slop / workspace rule).
- Do not commit unless the user explicitly asks.
- Verify with: `npx vitest run <files>` and `npm run type-check` from `upforge-desktop`.

## File map

| File | Responsibility |
|------|----------------|
| `src/lib/analysis-failure-messages.ts` | Prefer explicit friendly overrides; keep classifier as fallback |
| `src/lib/analysis-failure-messages.test.ts` | Friendly override + dual-path expectations |
| `electron/main/index.ts` | Activation catalog → UI payload; save-to-cloud structured return; match-end pending without upload flash |
| `electron/main/pipeline-errors.ts` (+ test) | Narrow over-broad skip of `upload` kind so unexpected upload failures reach ops |
| `electron/main/analysis-readiness.ts` | Waiting copy polish if needed |
| `src/views/PostGameView.vue` | Waiting labels; Analyse/Retry honor `not_ready`; saveToCloud uses structured error |
| `src/composables/useDashboard.ts` | Surface `not_ready` as warning, not connection failure |
| `src/views/RecordingsView.vue` | Same `not_ready` handling if it calls analyse |
| `electron/preload/index.ts`, `src/env.d.ts` | Typed save-to-cloud / analyse result shapes |

---

### Task 1: Friendly override on failure payload

**Files:**
- Modify: `src/lib/analysis-failure-messages.ts`
- Modify: `src/lib/analysis-failure-messages.test.ts`
- Modify: `electron/main/index.ts` (`dispatchAnalysisFailure` / `sendUploadFailure`)

**Interfaces:**
- Consumes: `classifyActivationError(raw)` → `{ code, definition.userMessage, technicalMessage }`
- Produces: `buildAnalysisErrorPayload` still returns `AnalysisErrorPayload`; when callers pass `message` / `title` / `hint` in extras, those win over regex classifier output (already true via `...extras` spread; tests must lock this in). `dispatchAnalysisFailure` must pass catalog `userMessage` as `message` and a short title, while ops still gets `technicalMessage` / `rawError`.

- [ ] **Step 1: Write the failing tests**

Add to `src/lib/analysis-failure-messages.test.ts`:

```ts
it('keeps explicit friendly message/title over technical classifier input', () => {
  const payload = buildAnalysisErrorPayload(
    'S3 upload failed (HTTP 503): <?xml version="1.0"?><Error><Code>ServiceUnavailable</Code><Message>Slow down</Message></Error>',
    {
      title: 'Upload did not finish',
      message: 'Could not finish uploading your recording. Check your connection and try Resume upload.',
      hint: 'Your match is still on the dashboard.',
      failureCode: 'upload_stalled',
    },
  )
  expect(payload.title).toBe('Upload did not finish')
  expect(payload.message).toContain('Resume upload')
  expect(payload.message).not.toMatch(/<\?xml/)
  expect(payload.failureCode).toBe('upload_stalled')
})
```

- [ ] **Step 2: Run test to verify it fails or already passes**

Run: `cd upforge-desktop && npx vitest run src/lib/analysis-failure-messages.test.ts -t "keeps explicit friendly"`

Expected: PASS if spread order already correct; if FAIL, fix `buildAnalysisErrorPayload` so extras override presentation fields after classify.

- [ ] **Step 3: Wire activation catalog into `dispatchAnalysisFailure`**

In `electron/main/index.ts` inside `dispatchAnalysisFailure`, after `classifyActivationError(rawError)`:

```ts
const classified = classifyActivationError(rawError)
const presentation = classifyAnalysisFailure(rawError)
const payload = buildAnalysisErrorPayload(rawError, {
  recordingId: opts.recordingId ?? undefined,
  needsUpgrade: opts.needsUpgrade,
  upgradeUrl: opts.upgradeUrl,
  ppaUrl: opts.ppaUrl,
  clipsOnly: opts.clipsOnly,
  failureDiagnostics: opts.failureDiagnostics ?? null,
  failureCode: classified.code,
  recoveryAction: classified.definition.recoveryAction,
  // Player-facing: prefer activation catalog when we matched a real code
  ...(classified.code !== 'unknown'
    ? {
        message: classified.definition.userMessage,
        title: presentation.title === 'Analysis could not complete'
          ? titleForActivationCode(classified.code, presentation.title)
          : presentation.title,
      }
    : {}),
})
```

Add a tiny helper in the same file (or next to activation codes):

```ts
function titleForActivationCode(code: string, fallback: string): string {
  if (code.startsWith('upload_')) return 'Upload failed'
  if (code.startsWith('preparation_') || code.startsWith('recording_')) return 'Recording not ready'
  if (code.startsWith('obs_')) return 'OBS needs attention'
  return fallback
}
```

Keep `reportPipelineError('analysis', rawError.slice(0, 500) || …)` using **raw/technical** `rawError`, not `payload.message`.

- [ ] **Step 4: Run tests**

Run: `cd upforge-desktop && npx vitest run src/lib/analysis-failure-messages.test.ts`

Expected: PASS

- [ ] **Step 5: Commit only if user asks**

---

### Task 2: Ops reporting for unexpected upload failures

**Files:**
- Modify: `electron/main/pipeline-errors.ts`
- Modify: `electron/main/pipeline-errors.test.ts`

**Interfaces:**
- Consumes: `AnalysisFailureKind`, raw error string
- Produces: `shouldReportAnalysisPipelineError(kind, rawError)` returns `true` for unexpected upload/technical failures that are not in `SKIP_PATTERNS` / expected config errors. Remove blanket skip of entire `'upload'` kind (or replace with: skip only when `isExpectedPipelineError(rawError)`).

- [ ] **Step 1: Write failing tests**

```ts
it('reports unexpected upload technical failures', () => {
  expect(
    shouldReportAnalysisPipelineError(
      'upload',
      'S3 upload failed (HTTP 503): <?xml><Error><Code>ServiceUnavailable</Code></Error>',
    ),
  ).toBe(true)
})

it('still skips quota / user-recoverable analysis kinds', () => {
  expect(shouldReportAnalysisPipelineError('quota', 'analysis.limit.reached')).toBe(false)
  expect(shouldReportAnalysisPipelineError('refunded_data', 'match data missing')).toBe(false)
})
```

Note: if `SKIP_PATTERNS` already matches `S3 upload failed (HTTP 5xx)`, pick a different unexpected string for the positive case (e.g. `Presign failed: signature mismatch xyz`) so the test asserts the kind-based gate, not the pattern list.

- [ ] **Step 2: Run test (expect FAIL)**

Run: `cd upforge-desktop && npx vitest run electron/main/pipeline-errors.test.ts`

- [ ] **Step 3: Implement**

In `pipeline-errors.ts`, remove `'upload'` from `USER_RECOVERABLE_ANALYSIS_KINDS` (keep refunded_*, integrity, quota, clips_only). Rely on `SKIP_PATTERNS` + `isExpectedPipelineError` for noisy expected upload cases.

- [ ] **Step 4: Run tests (expect PASS)**

Run: `cd upforge-desktop && npx vitest run electron/main/pipeline-errors.test.ts`

- [ ] **Step 5: Commit only if user asks**

---

### Task 3: Structured `save-to-cloud` errors

**Files:**
- Modify: `electron/main/index.ts` (`recordings:save-to-cloud` handler ~6216)
- Modify: `electron/preload/index.ts`
- Modify: `src/env.d.ts`
- Modify: `src/views/PostGameView.vue` (`saveToCloudNow`)

**Interfaces:**
- Produces:
  ```ts
  type SaveToCloudResult =
    | { ok: true; archiveId: string; alreadySaved?: boolean }
    | {
        ok: false
        error: string // friendly message
        title?: string
        hint?: string | null
        failureCode?: string
      }
  ```

- [ ] **Step 1: Change IPC handler to return classified friendly fields**

Replace the null-archive branch that returns only `'Could not save recording to cloud'`. Prefer capturing the last failure from `sendUploadFailure` / `doUploadArchiveOnly`. Minimal approach if `doUploadArchiveOnly` does not return the error string today:

```ts
let lastArchiveError: AnalysisErrorPayload | null = null
// Inside doUploadArchiveOnly failure path (or wrap): lastArchiveError = sendUploadFailure(...)
if (!archiveId) {
  return {
    ok: false as const,
    error: lastArchiveError?.message ?? 'Could not save your recording to cloud. Try again from the dashboard.',
    title: lastArchiveError?.title,
    hint: lastArchiveError?.hint,
    failureCode: lastArchiveError?.failureCode,
  }
}
```

If refactoring `doUploadArchiveOnly` is too large, have it return `string | null` error alongside id, then classify once with `sendUploadFailure` / `buildAnalysisErrorPayload`.

- [ ] **Step 2: Update preload + `env.d.ts` types** to match `SaveToCloudResult`.

- [ ] **Step 3: Update `saveToCloudNow` in PostGameView**

```ts
if (!result.ok) {
  state.value = 'error'
  errorDetails.value = {
    title: result.title ?? 'Could not save to cloud',
    message: result.error,
    hint: result.hint ?? 'Try again from the dashboard, or contact support if this keeps happening.',
    creditRefunded: false,
    canRetry: true,
    kind: 'upload',
    failureCode: result.failureCode,
  }
  errorMessage.value = result.error
  // upgrade detection unchanged
}
```

Do not leave `errorTitle` falling back to bare `'Upload failed'` when `errorDetails.title` is set.

- [ ] **Step 4: Type-check**

Run: `cd upforge-desktop && npm run type-check`

Expected: PASS (or only pre-existing unrelated errors)

- [ ] **Step 5: Commit only if user asks**

---

### Task 4: Analyse / Retry honor `not_ready` (no red modal)

**Files:**
- Modify: `src/views/PostGameView.vue` (`analyseNow`, `retryUpload`, pending labels)
- Modify: `src/composables/useDashboard.ts` (analyse handler ~1063)
- Modify: `src/views/RecordingsView.vue` (`analyse`)
- Optionally tighten: `electron/main/index.ts` `handleMatchEnd` auto-analyse pending path (avoid preparing→uploading flash)

**Interfaces:**
- Consumes: `recordings:analyse` result `{ ok?: true } | { error: string; code?: string; state?: string }`
- Produces: UI stays on `pending` when `code === 'not_ready'`; shows readiness message; never sets `state = 'error'` solely for match-data wait.

- [ ] **Step 1: Update pending button labels for Valorant wait**

In `pendingAnalyseButtonLabel`:

```ts
if (pendingAnalysisState.value === 'waiting_match_data' || pendingAnalysisState.value === 'syncing') {
  if (gameInfo.value.game === 'valorant') return 'Waiting for match stats…'
  // keep existing cs2/lol/demo branches
}
```

Ensure pending body uses readiness message (already bound). Soften default readiness copy in `analysis-readiness.ts` for Valorant `waiting_match_data` / `syncing` if needed to match spec:

> Still getting Riot match data. Analyse unlocks when ready (usually about a minute). Keep Valorant / Riot Client open.

- [ ] **Step 2: Fix `analyseNow` / `retryUpload`**

```ts
async function analyseNow() {
  if (!pendingRecordingId.value || analysing.value) return
  if (!pendingAnalysisReady.value) {
    // Stay pending — do not flip to error
    return
  }
  analysing.value = true
  state.value = 'uploading'
  try {
    const result = await window.api.recordings.analyse(pendingRecordingId.value) as {
      ok?: boolean
      error?: string
      code?: string
      state?: string
    }
    if (result?.code === 'not_ready') {
      state.value = 'pending'
      pendingAnalysisReady.value = false
      if (result.state) pendingAnalysisState.value = result.state
      if (result.error) pendingAnalysisMessage.value = result.error
      return
    }
    if (result?.error) {
      state.value = 'error'
      errorMessage.value = result.error
      return
    }
  } catch {
    state.value = 'error'
    errorMessage.value = 'Could not start analysis. Please try from the dashboard.'
  } finally {
    analysing.value = false
  }
}

async function retryUpload() {
  if (!pendingRecordingId.value) {
    errorMessage.value = 'Recording no longer available. Open the dashboard to retry.'
    return
  }
  state.value = 'uploading'
  uploadProgress.value = 0
  try {
    const result = await window.api.recordings.analyse(pendingRecordingId.value) as {
      ok?: boolean
      error?: string
      code?: string
      state?: string
    }
    if (result?.code === 'not_ready') {
      state.value = 'pending'
      pendingAnalysisReady.value = false
      if (result.state) pendingAnalysisState.value = result.state
      if (result.error) pendingAnalysisMessage.value = result.error
      return
    }
    if (result?.error) {
      state.value = 'error'
      errorMessage.value = result.error
    }
  } catch {
    state.value = 'error'
    errorMessage.value = 'Retry failed. Try analysing from the dashboard.'
  }
}
```

- [ ] **Step 3: Dashboard + RecordingsView**

When `result?.code === 'not_ready'`, set warning to `result.error` (readiness message) and do **not** remove the recording from pending / do not treat as connection failure.

- [ ] **Step 4: Match-end flash (optional but in scope)**

In `handleMatchEnd`, when `autoAnalyse` and `!autoReadiness.ready`, do not send prep-step that implies uploading before the pending event. Prefer: complete preparation → send `post-game:pending` only (skip `leaving preparing → uploading` activation step when blocked).

- [ ] **Step 5: Type-check + smoke unit tests for readiness copy if changed**

Run:

```bash
cd upforge-desktop && npx vitest run electron/main/analysis-readiness.test.ts
cd upforge-desktop && npm run type-check
```

Expected: PASS

- [ ] **Step 6: Commit only if user asks**

---

### Task 5: Manual verification checklist (human)

No code commit required. Confirm against the success criteria in the spec:

- [ ] **Step 1:** End a Valorant match with delayed Riot stats (or force sparse timeline in local/dev). Expect calm pending UI, Analyse disabled / “Waiting for match stats…”, no red ANALYSIS FAILED.
- [ ] **Step 2:** When stats land, Analyse unlocks; happy path upload works.
- [ ] **Step 3:** Force an upload failure (disconnect network mid-save-to-cloud). Expect friendly title/message; Discord/website error flow receives technical detail (if not skipped by remaining `SKIP_PATTERNS`).
- [ ] **Step 4:** Confirm Save to cloud still works while waiting for match stats.

---

## Spec coverage (self-review)

| Spec section | Task |
|--------------|------|
| §4 Match-stats gate | Task 4 (UI + existing main gate); cloud jobId retry unchanged |
| §5 Waiting UI | Task 4 |
| §6 Real failure UI | Tasks 1, 3 |
| §7 Dual error path | Tasks 1, 2 |
| §8 IPC save-to-cloud / analyse | Tasks 3, 4 |
| §9 Files | File map above |
| §10 Testing | Tasks 1–4 automated + Task 5 manual |
| §11 Rollout | Desktop release note on ship (version bump separate) |

No placeholders left. Types named consistently as `SaveToCloudResult`, `not_ready`, `AnalysisErrorPayload`.
