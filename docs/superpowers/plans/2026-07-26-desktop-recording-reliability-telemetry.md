# Desktop Recording Reliability & Telemetry (Phase 0–1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make match recording improvements measurable (machine profile + sector times + DNFs), then harden OBS start, path resolve, match-priority abort, deferred uploads, and post-match I/O so fewer VODs drop and FPS/upload recover without guessing.

**Architecture:** Add small pure modules (`machine-profile`, `match-telemetry`, `deferred-upload-queue`, path/checksum helpers) tested with Vitest. Wire them from `index.ts` / `OBSRecorder` / `UploadManager` without rewriting the god-object. Emit per-match `ops_recording_lap` events (not once-deduped funnel milestones). Keep existing product funnel events unchanged.

**Tech Stack:** Electron main (TypeScript), OBS WebSocket (`obs-websocket-js`), Vue 3 (dev timing sheet), Laravel funnel/ops ingest, Vitest, Node `crypto` / `os`.

**Spec:** `docs/superpowers/specs/2026-07-26-desktop-recording-reliability-telemetry-design.md`

**Out of this plan:** Phase 2 durable multipart resume / admin cohorts UI, Phase 3 native capture, full AI/product analytics streams (only `match_correlation_id` handoff).

## Global Constraints

- Do not lower recording resolution, FPS, audio quality, or visual quality.
- Do not replace OBS in this plan.
- Do not put absolute file paths in cloud event properties (local logs OK).
- Do not treat `match_detected` / `recording_started` / `upload_started` as per-match ops events (API once-dedupes them forever).
- Match-priority UX: never show “Upload paused — match recording” merely because a game process is open; abort in-flight heavy work on `game-started`, but **defer-with-message** only while `obsRecorder.isActivelyRecording()`.
- Prefer existing patterns in `electron/main/*.ts` + colocated `*.test.ts`.
- Do not commit unless the user asks (agent sessions: skip commit steps or ask first).
- Desktop verification: `npx --yes vitest run <test-file>` (add `vitest` as a `devDependency` in Task 1 if missing) and `npm run type-check` when touching Vue/preload types.
- API verification: `php artisan test --filter=FunnelEvent` (or new ops test) when changing ingest.

## File map

| File | Responsibility |
|------|----------------|
| `electron/main/machine-profile.ts` | Snapshot CPU/GPU/RAM/OS/encoder/OBS/app; derive `low\|mid\|high` bucket |
| `electron/main/match-telemetry.ts` | Correlation id, sector timers, DNF enums, lap snapshot, emit helper |
| `electron/main/obs-stats-sampler.ts` | Periodic OBS `GetStats` / output status while recording |
| `electron/main/recording-checksum.ts` | Streaming sha256 (or size+partial hash scheme) |
| `electron/main/deferred-upload-queue.ts` | Persist deferred recording IDs to disk; restore on launch |
| `electron/main/funnel-events.ts` | Add `trackOpsRecordingLap` (and thin helpers) |
| `electron/main/obs-output-settings.ts` | Fail-closed when Advanced mode still active after Simple push |
| `electron/main/recording-path-resolver.ts` | Stronger fallback rules + `usedFallback` flag |
| `electron/main/match-priority-guard.ts` | `abortHeavyBackgroundWorkOnGameStart`; keep defer gate recording-only |
| `electron/main/duel-clip-uploader.ts` | Serialize / reduce concurrency when VOD upload active |
| `electron/main/obs-recorder.ts` | Apply fail-closed settings; start/stop telemetry hooks; stats sampler |
| `electron/main/index.ts` | Wire telemetry, checksum, deferred queue, game-start abort, LastMatchDiagnostic |
| `electron/main/upload-manager.ts` | Pass `match_correlation_id`; sector marks for upload |
| Dev UI under `src/views` / dashboard diagnostics | Last Match Timing sheet |
| `upforge-api` FunnelEventController (+ optional model const) | Accept `ops_recording_lap` without once-dedupe |

---

### Task 1: Vitest + machine profile

**Files:**
- Modify: `upforge-desktop/package.json` (add `vitest` devDependency + `"test": "vitest run"`)
- Create: `upforge-desktop/electron/main/machine-profile.ts`
- Create: `upforge-desktop/electron/main/machine-profile.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type HardwareBucket = 'low' | 'mid' | 'high'
  export interface MachineProfile {
    cpuModel: string
    cpuCores: number
    ramGb: number
    gpuNames: string[]
    gpuDriverVersion: string | null
    os: string
    osRelease: string
    appVersion: string
    obsVersion: string | null
    encoder: string | null
    displayCount: number
    primaryResolution: string | null
    freeDiskGb: number | null
    bucket: HardwareBucket
    collectedAt: number
  }
  export function deriveHardwareBucket(input: {
    cpuCores: number
    ramGb: number
    encoder: string | null
  }): HardwareBucket
  export function collectMachineProfile(opts: {
    appVersion: string
    obsVersion?: string | null
    encoder?: string | null
    freeDiskGb?: number | null
    displayCount?: number
    primaryResolution?: string | null
    gpuDriverVersion?: string | null
  }): MachineProfile
  ```
- Bucket rules (document in file header): `low` if cores &lt; 6 or ramGb &lt; 12 or encoder is software (`x264` / empty); `high` if cores &gt;= 12 and ramGb &gt;= 32 and hardware encoder; else `mid`.

- [ ] **Step 1: Add vitest**

```bash
cd upforge-desktop && npm install -D vitest@3
```

Add to `package.json` scripts: `"test": "vitest run"`, `"test:watch": "vitest"`.

- [ ] **Step 2: Write failing tests**

```ts
import { describe, expect, it } from 'vitest'
import { deriveHardwareBucket } from './machine-profile'

describe('deriveHardwareBucket', () => {
  it('marks low when few cores or little RAM or software encoder', () => {
    expect(deriveHardwareBucket({ cpuCores: 4, ramGb: 16, encoder: 'h264_nvenc' })).toBe('low')
    expect(deriveHardwareBucket({ cpuCores: 8, ramGb: 8, encoder: 'h264_nvenc' })).toBe('low')
    expect(deriveHardwareBucket({ cpuCores: 8, ramGb: 16, encoder: 'libx264' })).toBe('low')
  })

  it('marks high when strong CPU/RAM + hardware encoder', () => {
    expect(deriveHardwareBucket({ cpuCores: 16, ramGb: 32, encoder: 'h264_nvenc' })).toBe('high')
  })

  it('marks mid otherwise', () => {
    expect(deriveHardwareBucket({ cpuCores: 8, ramGb: 16, encoder: 'h264_nvenc' })).toBe('mid')
  })
})
```

- [ ] **Step 3: Run tests (expect FAIL)**

Run: `cd upforge-desktop && npm test -- electron/main/machine-profile.test.ts`  
Expected: FAIL module not found / cannot find function.

- [ ] **Step 4: Implement `machine-profile.ts`**

Use `os.cpus()`, `os.totalmem()`, `process.platform`. GPU name/driver: best-effort via `app.getGPUInfo('complete')` when called from a context that has `app`, or accept injected `gpuNames` / `gpuDriverVersion` from caller for testability. `collectMachineProfile` must not throw.

- [ ] **Step 5: Run tests (expect PASS)**

Run: `cd upforge-desktop && npm test -- electron/main/machine-profile.test.ts`  
Expected: PASS.

- [ ] **Step 6: Commit** (only if user asked)

```bash
git add package.json package-lock.json electron/main/machine-profile.ts electron/main/machine-profile.test.ts
git commit -m "$(cat <<'EOF'
feat(desktop): add machine profile + hardware bucket for ops telemetry

EOF
)"
```

---

### Task 2: Match telemetry core

**Files:**
- Create: `upforge-desktop/electron/main/match-telemetry.ts`
- Create: `upforge-desktop/electron/main/match-telemetry.test.ts`

**Interfaces:**
- Consumes: `MachineProfile` / `HardwareBucket` from Task 1
- Produces:
  ```ts
  export type RecordingEndReason =
    | 'clean'
    | 'interrupted'
    | 'crash_suspected'
    | 'manual'
    | 'too_short'
    | 'discarded'
    | 'start_failed'
    | 'path_unresolved'

  export type RecordingDnfReason =
    | 'obs_not_ready'
    | 'advanced_output'
    | 'disk_critical'
    | 'mode_filtered'
    | 'path_fallback'
    | 'settle_timeout'
    | 'probe_failed'
    | 'remux_failed'
    | 'upload_abort'
    | 'quota'
    | 'too_short'
    | 'capture_retarget_failed'
    | 'unowned_obs_recording'
    | 'other'

  export type SectorName =
    | 'detect_to_record_start'
    | 'end_to_file_ready'
    | 'remux_compress'
    | 'upload'
    | 'analysis_accepted'
    | 'lap_end_to_analysis'

  export class MatchTelemetrySession {
    readonly correlationId: string
    constructor(game: string, machine: Pick<MachineProfile, 'bucket' | 'encoder' | 'obsVersion' | 'appVersion'>)
    mark(sector: SectorName, at?: number): void
    startSector(sector: SectorName, at?: number): void
    endSector(sector: SectorName, at?: number): void
    setDnf(reason: RecordingDnfReason, detail?: string): void
    setEndReason(reason: RecordingEndReason): void
    setRecordingFacts(facts: Partial<RecordingFacts>): void
    addObsSample(sample: ObsHealthSample): void
    setPathFallback(used: boolean): void
    setAudioTracks(count: number | null): void
    setCaptureTarget(target: { method: string | null; title: string | null; monitorIndex: number | null }): void
    snapshot(): OpsRecordingLap
  }

  export interface OpsRecordingLap {
    event: 'ops_recording_lap'
    match_correlation_id: string
    game: string
    machine_bucket: HardwareBucket
    sectors_ms: Partial<Record<SectorName, number>>
    dnf: RecordingDnfReason | null
    dnf_detail: string | null
    end_reason: RecordingEndReason | null
    path_fallback: boolean
    // recording facts + obs sample summaries (totals/max lag), no file paths
  }
  ```

- [ ] **Step 1: Write failing tests** for sector timing, DNF, correlation id uniqueness, snapshot shape (no `path` keys).

- [ ] **Step 2: Run tests (expect FAIL)**

Run: `cd upforge-desktop && npm test -- electron/main/match-telemetry.test.ts`

- [ ] **Step 3: Implement session class** with `crypto.randomUUID()` (or fallback string). Sector duration = end − start; `mark` for instantaneous points stored as ms from session `t0` if needed. Strip any accidental path fields in `snapshot()`.

- [ ] **Step 4: Run tests (expect PASS)**

- [ ] **Step 5: Commit** (if asked)

```bash
git commit -m "$(cat <<'EOF'
feat(desktop): add match telemetry session and ops lap snapshot

EOF
)"
```

---

### Task 3: API ingest for `ops_recording_lap`

**Files:**
- Modify: `upforge-api/app/Http/Controllers/API/FunnelEventController.php`
- Modify: `upforge-api/app/Models/UserFunnelEvent.php` (add event to `EVENTS` const for docs)
- Create/Modify test under `upforge-api/tests/Feature/` (e.g. `FunnelEventOpsLapTest.php`)

**Interfaces:**
- `POST /api/funnel-events` with `event: ops_recording_lap` must **never** once-dedupe.
- Remove `match_detected`, `recording_started`, `upload_started` from `$onceEvents` only if product analytics still needs first-time semantics via separate once helpers; **do not** rely on those for per-match ops. Prefer leaving once list as-is and using `ops_recording_lap` exclusively for per-match.

- [ ] **Step 1: Write failing feature test**

```php
public function test_ops_recording_lap_is_not_deduped(): void
{
    $user = User::factory()->create();
    Sanctum::actingAs($user);

    $payload = [
        'event' => 'ops_recording_lap',
        'channel' => 'desktop',
        'properties' => [
            'match_correlation_id' => 'corr-1',
            'machine_bucket' => 'mid',
            'game' => 'valorant',
        ],
        'app_version' => '2.10.37',
    ];

    $this->postJson('/api/funnel-events', $payload)->assertOk();
    $this->postJson('/api/funnel-events', $payload)->assertOk()
        ->assertJsonMissing(['deduped' => true]);

    $this->assertDatabaseCount('user_funnel_events', 2);
}
```

- [ ] **Step 2: Run test (expect FAIL if event rejected or deduped)**

Run: `cd upforge-api && php artisan test --filter=FunnelEventOpsLapTest`

- [ ] **Step 3: Ensure validation allows the event; confirm not in `$onceEvents`**

- [ ] **Step 4: Run test (expect PASS)**

- [ ] **Step 5: Commit** (if asked) in `upforge-api` repo

---

### Task 4: Desktop `trackOpsRecordingLap` + privacy strip

**Files:**
- Modify: `upforge-desktop/electron/main/funnel-events.ts`
- Create: `upforge-desktop/electron/main/funnel-events.test.ts` (pure sanitize helper)

**Interfaces:**
- Produces:
  ```ts
  export function sanitizeOpsProperties(props: Record<string, unknown>): Record<string, unknown>
  export function trackOpsRecordingLap(lap: OpsRecordingLap): void
  ```
- `sanitizeOpsProperties` drops keys matching `/path|dir|file/i` or string values that look like absolute paths (`/Users/`, `C:\\`, etc.).

- [ ] **Step 1: Failing sanitize tests**
- [ ] **Step 2: Implement + call existing `trackFunnelEvent('ops_recording_lap', …)`** — extend `FunnelEventName` union.
- [ ] **Step 3: Tests PASS**
- [ ] **Step 4: Commit** (if asked)

---

### Task 5: OBS Advanced fail-closed

**Files:**
- Modify: `upforge-desktop/electron/main/obs-output-settings.ts`
- Modify: `upforge-desktop/electron/main/obs-output-settings.test.ts`
- Modify: `upforge-desktop/electron/main/obs-recorder.ts` (honor `ok: false` / new `blocking` flag before `StartRecord`)

**Interfaces:**
- Extend `ObsApplyResult`:
  ```ts
  export interface ObsApplyResult {
    ok: boolean
    blocking: boolean  // true => must not start recording
    outputMode: string | null
    outputWidth: number | null
    outputHeight: number | null
    warnings: string[]
    errors: string[]
  }
  ```
- After pushing Simple, re-read `Output/Mode`. If still `Advanced`, set `blocking: true`, `ok: false`, `errors: ['advanced_output']`.
- `OBSRecorder.start` / reclaim path: if `blocking`, throw or return failure that `index.ts` maps to `trackRecordingFailed` + telemetry DNF `advanced_output`.

- [ ] **Step 1: Failing test** — mock GetProfileParameter still returning Advanced after set → `blocking === true`.
- [ ] **Step 2: Implement re-read + blocking flag.**
- [ ] **Step 3: Wire recorder to refuse start when blocking.**
- [ ] **Step 4: Tests PASS**
- [ ] **Step 5: Commit** (if asked)

---

### Task 6: Safer path resolve + checksum

**Files:**
- Modify: `upforge-desktop/electron/main/recording-path-resolver.ts`
- Create/Modify: `upforge-desktop/electron/main/recording-path-resolver.test.ts`
- Create: `upforge-desktop/electron/main/recording-checksum.ts`
- Create: `upforge-desktop/electron/main/recording-checksum.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface ResolveRecordingResult {
    file: ResolvedRecordingFile | null
    usedFallback: boolean
  }
  export function resolveReadyRecordingPathDetailed(
    preferredPath: string | null | undefined,
    savePath: string,
    notBeforeMs: number,
    opts?: { minSizeBytes?: number; maxAgeMsBeyondNotBefore?: number },
  ): ResolveRecordingResult
  ```
- Keep existing `resolveReadyRecordingPath` as thin wrapper for callers not yet migrated.
- Fallback: only accept candidate if `mtimeMs >= notBeforeMs - 15_000` AND size &gt;= min AND (if preferred existed but missing) candidate is the newest among those within the window (prefer newest mtime, break ties by size). Do **not** pick an older huge unrelated file outside the window.
- Checksum:
  ```ts
  export async function sha256File(filePath: string): Promise<string>
  ```
  Streaming hash; tests use a temp file.

- [ ] **Step 1: Failing tests** for fallback rejection of stale large file; checksum stability.
- [ ] **Step 2: Implement.**
- [ ] **Step 3: Tests PASS**
- [ ] **Step 4: Commit** (if asked)

---

### Task 7: Persist deferred uploads

**Files:**
- Create: `upforge-desktop/electron/main/deferred-upload-queue.ts`
- Create: `upforge-desktop/electron/main/deferred-upload-queue.test.ts`
- Modify: `upforge-desktop/electron/main/match-priority-guard.ts` (delegate persist calls)
- Modify: `upforge-desktop/electron/main/index.ts` (on register defer + on startup flush)

**Interfaces:**
- Produces:
  ```ts
  export function getDeferredUploadQueuePath(userDataPath: string): string
  export function readDeferredUploadIds(filePath: string): string[]
  export function writeDeferredUploadIds(filePath: string, ids: string[]): void
  export function addDeferredUploadId(filePath: string, id: string): void
  export function removeDeferredUploadId(filePath: string, id: string): void
  ```
- Store JSON `{ version: 1, recordingIds: string[] }` under userData (e.g. `deferred-uploads.json`).
- On `registerDeferredUploadRetry`, also `addDeferredUploadId`.
- On successful upload / clear, `removeDeferredUploadId`.
- At startup after `RecordingsStore` ready: for each id still `pending`/`failed`, re-register retry closure (same as today’s flush), then clear stale ids missing from store.

- [ ] **Step 1: Failing tests** with temp dir.
- [ ] **Step 2: Implement + wire.**
- [ ] **Step 3: Tests PASS**
- [ ] **Step 4: Commit** (if asked)

---

### Task 8: Abort heavy work on game-started (FPS)

**Files:**
- Modify: `upforge-desktop/electron/main/match-priority-guard.ts`
- Modify: `upforge-desktop/electron/main/match-priority-guard.test.ts`
- Modify: `upforge-desktop/electron/main/index.ts` (`game-started` handler)

**Interfaces:**
- Produces:
  ```ts
  export function abortHeavyBackgroundWorkOnGameStart(deps: {
    abortUploads: () => void
    abortVodCompression?: () => boolean
  }): void
  ```
- Calls existing upload abort + `abortVodCompression()`.
- **Do not** change `shouldDeferHeavyBackgroundWork` to key off game process (regression tests in file must keep passing).
- On `game-started`, call `abortHeavyBackgroundWorkOnGameStart` **before** OBS ensure / record start.
- Telemetry: if an upload was aborted, current lap or a one-off ops note may set DNF detail `upload_abort` on the *previous* pending upload’s retry path (best-effort: mark recordings-store / emit property on next lap).

- [ ] **Step 1: Failing test** that abort helper invokes both abort hooks; existing defer tests still green.
- [ ] **Step 2: Implement + wire `game-started`.**
- [ ] **Step 3: Tests PASS**
- [ ] **Step 4: Commit** (if asked)

---

### Task 9: Serialize post-match disk (VOD then duels)

**Files:**
- Modify: `upforge-desktop/electron/main/duel-clip-uploader.ts`
- Modify: `upforge-desktop/electron/main/index.ts` / upload orchestration (order of `doUploadAndAnalyse` vs duel upload)
- Test: extend duel uploader tests if present, else add `duel-clip-uploader.test.ts` for concurrency helper

**Interfaces:**
- When full VOD multipart is in progress, duel extract concurrency = 1 and upload concurrency = 1, **or** await VOD remux+multipart completion before starting duel extract (prefer **await VOD remux complete, then duel extract while multipart may run only if disk read contention stays low**; simplest correct approach: **finish remux → start VOD multipart → only then duel extract/upload**).
- Emit telemetry sector `remux_compress` around remux; `upload` around VOD; optional note `duels_after_vod: true` in lap props.

- [ ] **Step 1: Document chosen order in code comment; add test for concurrency cap function if extracted.**
- [ ] **Step 2: Reorder call sites in `index.ts` upload path.**
- [ ] **Step 3: Focused tests + type-check.**
- [ ] **Step 4: Commit** (if asked)

---

### Task 10: Wire telemetry end-to-end + Last Match Timing UI

**Files:**
- Modify: `upforge-desktop/electron/main/index.ts` (create session on match detect / record start; mark sectors; set facts; checksum; emit lap on terminal state)
- Modify: `upforge-desktop/electron/main/obs-recorder.ts` (optional callbacks / return apply result for telemetry)
- Create: `upforge-desktop/electron/main/obs-stats-sampler.ts`
- Modify: diagnostics IPC payload `lastMatch` in `index.ts` + `src/env.d.ts`
- Modify: developer diagnostics view that already shows `lastMatch` (search `lastMatch` in `src/`)

**Interfaces:**
- `obs-stats-sampler.ts`:
  ```ts
  export function startObsStatsSampler(obs: OBSWebSocket, onSample: (s: ObsHealthSample) => void, intervalMs = 12_000): () => void
  ```
  Call `GetStats` (and/or record status). On failure, skip sample. Stop on record end.
- Expand `LastMatchDiagnostic` with: `correlationId`, `sectorsMs`, `dnf`, `endReason`, `pathFallback`, `machineBucket`, `obsSkippedFrames`, `audioTracks`, `outputMode`, `checksumPrefix` (first 12 hex chars only in UI).
- Emit `trackOpsRecordingLap(session.snapshot())` once per terminal outcome (success or DNF). Guard with a `lapEmitted` flag.
- Pass `match_correlation_id` into upload/analyse API body if the endpoint already accepts arbitrary metadata; otherwise send in funnel props only and add API field in a small follow-up. Prefer attaching to desktop submission payload when a `metadata` / `client` object already exists (grep `DesktopSubmission` / upload complete).

- [ ] **Step 1: Implement sampler + wire session lifecycle (detect → start → end → file ready → remux → upload → analysis).**
- [ ] **Step 2: Expand IPC `lastMatch` + Dev UI timing sheet (sectors as simple list, not a dashboard).**
- [ ] **Step 3: Manual check list in PR: play/shorten one match or use existing demo path; confirm lap event + UI.
- [ ] **Step 4: `npm test -- electron/main/match-telemetry.test.ts electron/main/machine-profile.test.ts electron/main/obs-output-settings.test.ts electron/main/recording-path-resolver.test.ts electron/main/match-priority-guard.test.ts` + `npm run type-check`
- [ ] **Step 5: Commit** (if asked)

---

### Task 11: Spec checklist + README pointer

**Files:**
- Modify: `upforge-desktop/README.md` (OBS-first capture; link to spec; note FFmpeg is post-match)
- Modify: `docs/superpowers/specs/2026-07-26-desktop-recording-reliability-telemetry-design.md` status → `Phase 0–1 planned`

- [ ] **Step 1: Short README correction** (replace ffmpeg-as-recorder narrative).
- [ ] **Step 2: Commit** (if asked)

---

## Phase 2 / 3 (separate plans later)

- Phase 2: SQLite/disk job queue, resumable multipart, admin cohort queries by `machine_bucket`, p50/p95 sectors.
- Phase 3: Native capture dual-run vs OBS with audio/cursor/monitor quality bar.

Do not implement in this plan.

---

## Spec coverage self-review

| Spec item | Task |
|-----------|------|
| Machine profile + bucket | Task 1 |
| Sector times + DNF + correlation id | Task 2, 10 |
| Audio tracks / capture target / end reasons | Task 2 fields + Task 10 wire |
| Checksum / integrity | Task 6, 10 |
| GPU driver | Task 1 |
| Consent / no paths in cloud | Task 4 sanitize; Global Constraints |
| Advanced fail-closed | Task 5 |
| Persist deferred uploads | Task 7 |
| Match priority earlier (abort on game start) | Task 8 |
| Serialize post-match disk | Task 9 |
| Last Match Timing UI | Task 10 |
| Ops events not once-deduped | Task 3 |
| Phase 2/3 deferred | Section above |
| Platform AI/product backlog | Out of plan |

**Placeholder scan:** none intentional.  
**Type consistency:** `OpsRecordingLap`, `ObsApplyResult.blocking`, `ResolveRecordingResult.usedFallback`, `MatchTelemetrySession` used consistently across tasks.

---

## Execution handoff

Plan complete and saved to `upforge-desktop/docs/superpowers/plans/2026-07-26-desktop-recording-reliability-telemetry.md`.

**Two execution options:**

1. **Subagent-Driven (recommended)** — fresh subagent per task, review between tasks  
2. **Inline Execution** — this session, batch with checkpoints  

Which approach?
