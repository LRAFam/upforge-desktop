# Desktop Durable Upload Queue (Phase 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace in-memory / thin deferred-upload persistence with a durable post-match job queue, resume multipart VOD uploads when practical, run one ordered post-match worker, and expose ops cohort stats (hardware bucket × sectors × DNF) in admin analytics.

**Architecture:** Introduce a JSON-file job store (Phase 2a; SQLite optional later if volume warrants) owned by `PostMatchWorker`. Jobs survive restart. `UploadManager` persists multipart `upload_id` + completed part ETags so a crash mid-S3 can continue without a full re-upload when the session is still valid. Admin reads `ops_recording_lap` properties via `AdminFunnelAnalyticsService`.

**Tech Stack:** Electron main TypeScript, existing `UploadManager` / S3 multipart, Laravel funnel events + admin analytics, Vitest, PHPUnit.

**Spec:** `upforge-desktop/docs/superpowers/specs/2026-07-26-desktop-recording-reliability-telemetry-design.md` §9  
**Depends on:** Phase 0–1 committed (`feat/recording-telemetry-harden`).

## Global Constraints

- Do not lower recording quality.
- Defer-with-message remains recording-only; abort-on-game-start stays as Phase 1.
- Never put absolute file paths in cloud ops events (local job store may keep paths).
- Prefer extending existing multipart/presign APIs over inventing a second upload protocol.
- If S3 session expired, fall back to fresh presign (already handled) and clear resumed parts.
- Do not commit unless the user asks.
- Desktop tests: `npm test -- <file>`; API: `php artisan test --filter=...`.

## File map

| File | Responsibility |
|------|----------------|
| `electron/main/post-match-job-store.ts` | Durable job CRUD on disk |
| `electron/main/post-match-worker.ts` | Single-flight queue runner (settle → remux → upload → duels → analyse handoff) |
| `electron/main/multipart-upload-state.ts` | Persist/resume part ETags + upload_id per recording |
| `electron/main/upload-manager.ts` | Resume parts when state present; write state after each part |
| `electron/main/deferred-upload-queue.ts` | Migrate ids into job store; thin wrapper or deprecate |
| `electron/main/index.ts` | Enqueue instead of fire-and-forget `doUploadAndAnalyse` |
| `AdminFunnelAnalyticsService.php` (+ controller/test) | Ops cohort aggregates from `ops_recording_lap` |
| Optional admin UI later | Out of scope unless trivial JSON already consumed |

---

### Task 1: Post-match job store

**Files:**
- Create: `upforge-desktop/electron/main/post-match-job-store.ts`
- Create: `upforge-desktop/electron/main/post-match-job-store.test.ts`

**Interfaces:**
```ts
export type PostMatchJobStage =
  | 'queued'
  | 'remux'
  | 'upload'
  | 'duels'
  | 'complete_api'
  | 'polling'
  | 'done'
  | 'failed'
  | 'deferred'

export interface PostMatchJob {
  id: string                 // same as recordingId when available
  recordingId: string
  videoPath: string          // local only
  game: string
  matchCorrelationId: string | null
  stage: PostMatchJobStage
  attempts: number
  lastError: string | null
  createdAt: number
  updatedAt: number
  // snapshot fields needed to rebuild doUploadAndAnalyse args
  riotName: string
  riotTag: string
  map: string | null
  agent: string | null
  // timeline stored by reference in recordings-store; job may omit heavy payload
}

export class PostMatchJobStore {
  constructor(filePath: string)
  list(): PostMatchJob[]
  get(id: string): PostMatchJob | undefined
  upsert(job: PostMatchJob): void
  update(id: string, patch: Partial<PostMatchJob>): void
  remove(id: string): void
  claimNextRunnable(opts: { deferIfRecording: boolean; isRecording: () => boolean }): PostMatchJob | null
}
```

- [ ] **Step 1:** Write failing tests for upsert, claim order (FIFO), skip `done`/`polling`, defer when recording.
- [ ] **Step 2:** Implement JSON file `{ version: 1, jobs: PostMatchJob[] }` with atomic write (write temp + rename).
- [ ] **Step 3:** Tests PASS.
- [ ] **Step 4:** Commit if asked.

---

### Task 2: Multipart resume state

**Files:**
- Create: `upforge-desktop/electron/main/multipart-upload-state.ts`
- Create: `upforge-desktop/electron/main/multipart-upload-state.test.ts`
- Modify: `upforge-desktop/electron/main/upload-manager.ts`

**Interfaces:**
```ts
export interface MultipartResumeState {
  version: 1
  recordingId: string
  jobId: string            // server analysis/upload job id from presign
  uploadId: string         // S3 upload_id
  partSize: number
  totalBytes: number
  completedParts: Array<{ part_number: number; etag: string }>
  updatedAt: number
}
export function multipartStatePath(userData: string, recordingId: string): string
export function readMultipartState(path: string): MultipartResumeState | null
export function writeMultipartState(path: string, state: MultipartResumeState): void
export function clearMultipartState(path: string): void
```

- [ ] **Step 1:** Unit tests for read/write/clear.
- [ ] **Step 2:** In `_putToS3Multipart`, after each successful part, persist state. On start, if state matches current `upload_id` + size, skip completed part numbers.
- [ ] **Step 3:** On `upload_session_expired`, clear state and rethrow for full cycle.
- [ ] **Step 4:** On successful complete, clear state.
- [ ] **Step 5:** Focused tests + manual note in code comment: resume only within same S3 session.
- [ ] **Step 6:** Commit if asked.

**API note:** If presign does not return a stable `upload_id` across process restart for the same `job_id`, document that resume is best-effort within one app session crash only; still persist parts for mid-upload crash before complete. Grep Laravel desktop-submissions presign for `upload_id` lifetime.

---

### Task 3: Post-match worker (single flight)

**Files:**
- Create: `upforge-desktop/electron/main/post-match-worker.ts`
- Create: `upforge-desktop/electron/main/post-match-worker.test.ts`
- Modify: `upforge-desktop/electron/main/index.ts`

**Interfaces:**
```ts
export interface PostMatchWorkerDeps {
  store: PostMatchJobStore
  isRecording: () => boolean
  runJob: (job: PostMatchJob) => Promise<void>
  log?: (msg: string) => void
}
export class PostMatchWorker {
  constructor(deps: PostMatchWorkerDeps)
  enqueue(job: PostMatchJob): void
  kick(): void                 // try claim+run if idle
  isBusy(): boolean
}
```

- [ ] **Step 1:** Tests: second enqueue while busy does not start parallel `runJob`; after finish, next job runs; recording defers claim.
- [ ] **Step 2:** Implement single-flight with `busy` flag + `kick` after each completion / `flushDeferredUploadRetries` replacement.
- [ ] **Step 3:** In `index.ts`, replace direct `doUploadAndAnalyse` post-match call with `worker.enqueue` + `kick`. Keep `doUploadAndAnalyse` as `runJob` implementation (or thin adapter).
- [ ] **Step 4:** On startup: migrate `deferred-uploads.json` ids into job store (`stage: deferred`/`queued`), then `kick`.
- [ ] **Step 5:** Tests PASS.
- [ ] **Step 6:** Commit if asked.

---

### Task 4: Wire telemetry sectors to worker stages

**Files:**
- Modify: `upforge-desktop/electron/main/index.ts` (and/or upload path)

- [ ] **Step 1:** Mark `remux_compress`, `upload`, `analysis_accepted` around worker stages; set `duels_after_vod: true` (already).
- [ ] **Step 2:** On job `failed`, emit ops lap DNF `upload_abort` / `other` with stage in `dnf_detail` if lap not yet emitted.
- [ ] **Step 3:** Manual checklist in plan completion notes.

---

### Task 5: Admin ops cohorts (API)

**Files:**
- Modify: `upforge-api/app/Services/AdminFunnelAnalyticsService.php`
- Modify: `upforge-api/app/Http/Controllers/API/AdminFunnelAnalyticsController.php` (if response shape needs documenting)
- Create: `upforge-api/tests/Feature/AdminOpsRecordingLapAnalyticsTest.php`

**Interfaces (response addition):**
```json
{
  "ops_recording": {
    "laps_count": 42,
    "dnf_rates": { "advanced_output": 0.05, "too_short": 0.1 },
    "by_bucket": {
      "low": { "count": 10, "sector_p50_ms": { "upload": 120000 }, "sector_p95_ms": { "upload": 400000 } },
      "mid": { "...": "..." },
      "high": { "...": "..." }
    }
  }
}
```

- [ ] **Step 1:** Seed `ops_recording_lap` events in test; assert aggregation keys.
- [ ] **Step 2:** Implement query over last N days (`period` param), only `event = ops_recording_lap`, parse `properties->machine_bucket`, `sectors_ms`, `dnf`.
- [ ] **Step 3:** PHPUnit PASS.
- [ ] **Step 4:** Commit if asked.

**UI:** If admin frontend already renders arbitrary funnel JSON, document the new key. Do not build a new Vue page in this plan unless a tiny existing panel is trivial to extend (YAGNI).

---

### Task 6: Deprecate thin deferred queue + docs

**Files:**
- Modify: `upforge-desktop/electron/main/deferred-upload-queue.ts` (migrate helper only)
- Modify: `docs/superpowers/specs/2026-07-26-desktop-recording-reliability-telemetry-design.md` status → Phase 2 in progress / done
- Create: `docs/superpowers/plans/2026-07-26-desktop-durable-upload-queue.md` (this file)

- [ ] **Step 1:** Ensure README one-liner mentions durable post-match queue.
- [ ] **Step 2:** Verification: `npm test` focused files + `php artisan test --filter=AdminOpsRecordingLap`.

---

## Spec coverage

| Spec §9 item | Task |
|--------------|------|
| Disk-backed upload/analyse queue | 1, 3 |
| Resumable multipart | 2 |
| Single post-match worker | 3 |
| Admin cohorts by bucket / sectors / DNF | 5 |
| Telemetry continuity | 4 |

**Out of scope:** Phase 3 native capture; SQLite (unless JSON proves painful); full admin Vue redesign.

---

## Execution handoff

Plan saved to `upforge-desktop/docs/superpowers/plans/2026-07-26-desktop-durable-upload-queue.md`.

**Branches:** `feat/recording-durable-queue` on desktop + API (from Phase 0–1 commits).

**Execute:** Inline (this session) or Subagent-Driven?
