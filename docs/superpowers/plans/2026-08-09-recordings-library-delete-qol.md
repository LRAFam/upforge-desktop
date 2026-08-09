# Recordings Library Delete + QoL Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add delete (with cloud-safe choices), multi-select cleanup, date grouping, status chips, and storage/open-folder to the desktop Recordings tab.

**Architecture:** Pure helpers classify filters/groups/delete choices in the renderer. Main-process dismiss gains explicit `remove` / `localOnly` modes (Dashboard keep working via default `remove`). `RecordingsView` becomes a Clips-adjacent library with collapsed date groups and selection mode; no shared Clips chrome extraction.

**Tech Stack:** Vue 3 + TypeScript, Electron IPC, Vitest, existing `recordings-store` / `deleteLocalRecordingFiles` / `storage.*` APIs.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-08-09-recordings-library-delete-qol-design.md`
- Never delete cloud archives from this tab
- Multi-select Delete always uses `mode: 'remove'`; two-choice modal is single-item only
- Reuse existing IPC where possible; extend `recordings:dismiss` rather than inventing a parallel delete channel
- Copy: “Delete recording” / “Remove from library” (not “Dismiss”)
- Do not extract shared Clips/Recordings toolbar components
- Do not bump `package.json` version in this plan
- Commit only when the user asks (plan steps list commit messages for when they do)

## File map

| File | Responsibility |
|------|----------------|
| `src/lib/recording-library.ts` | Date groups, status chips, delete-choice helpers, bytes label |
| `src/lib/recording-library.test.ts` | Unit tests for those helpers |
| `electron/main/recording-dismiss.ts` | Pure dismiss apply logic (`remove` / `localOnly`) |
| `electron/main/recording-dismiss.test.ts` | Unit tests with temp files + fake store |
| `electron/main/recordings-store.ts` | `clearLocalPath(id)` |
| `electron/main/ipc/recordings-ipc.ts` | Wire dismiss modes + `freedBytes` |
| `electron/preload/index.ts` | Pass `mode` through dismiss |
| `src/env.d.ts` | Typed dismiss opts + return |
| `src/views/RecordingsView.vue` | Toolbar, groups, filters, storage, delete, multi-select |

---

### Task 1: Recording library helpers (TDD)

**Files:**
- Create: `src/lib/recording-library.ts`
- Create: `src/lib/recording-library.test.ts`

**Interfaces:**
- Consumes: `PendingRecording`, `recordingStatusBadge` from `recording-status.ts`, `canWatchRawRecording` from `recording-demo-status.ts`, `canRetryRiotMatchStats` from `match-stats-retry.ts`
- Produces:
  - `export type RecordingLibraryChip = 'all' | 'needs_attention' | 'ready' | 'analysed' | 'cloud'`
  - `export type RecordingDateGroupLabel = 'Today' | 'Yesterday' | 'This Week' | 'This Month' | 'Older'`
  - `export interface RecordingDateGroup { label: RecordingDateGroupLabel; items: PendingRecording[] }`
  - `export function recordingNeedsAttention(rec: PendingRecording): boolean`
  - `export function matchesRecordingLibraryChip(rec: PendingRecording, chip: RecordingLibraryChip): boolean`
  - `export function groupRecordingsByDate(items: PendingRecording[], nowMs?: number): RecordingDateGroup[]`
  - `export function visibleGroupItems<T>(items: T[], expanded: boolean, limit?: number): { shown: T[]; hiddenCount: number }`
  - `export type RecordingDeleteChoice = 'remove' | 'localOnly' | 'cancel'`
  - `export function recordingDeleteOptions(rec: PendingRecording): Array<'remove' | 'localOnly'>`
  - `export function formatRecordingBytes(bytes: number): string`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest'
import {
  groupRecordingsByDate,
  matchesRecordingLibraryChip,
  recordingDeleteOptions,
  recordingNeedsAttention,
  visibleGroupItems,
  formatRecordingBytes,
} from './recording-library'
import type { PendingRecording } from '../env.d.ts'

function rec(overrides: Partial<PendingRecording> = {}): PendingRecording {
  return {
    id: '1',
    path: '/tmp/a.mp4',
    game: 'valorant',
    map: 'Breeze',
    agent: 'Jett',
    gameMode: 'COMPETITIVE',
    recordedAt: Date.now(),
    analysed: false,
    hasLocalFile: true,
    cloudUploaded: false,
    ...overrides,
  } as PendingRecording
}

describe('recordingNeedsAttention', () => {
  it('flags failed, unavailable, stuck sync, and retryable stats', () => {
    expect(recordingNeedsAttention(rec({ lastAnalysisError: 'x' }))).toBe(true)
    expect(recordingNeedsAttention(rec({ hasLocalFile: false, cloudUploaded: false, path: '' }))).toBe(true)
    expect(
      recordingNeedsAttention(
        rec({ analysisReadiness: { ready: false, state: 'finalizing', message: '', duelMomentCount: 0 } }),
      ),
    ).toBe(true)
  })
})

describe('matchesRecordingLibraryChip', () => {
  it('filters by chip', () => {
    const analysed = rec({ analysisId: 9 })
    const cloud = rec({ cloudUploaded: true, analysisId: undefined })
    const ready = rec({
      analysisId: undefined,
      pipelineStatus: undefined,
      analysisReadiness: { ready: true, state: 'ready', message: '', duelMomentCount: 1 },
    })
    expect(matchesRecordingLibraryChip(analysed, 'analysed')).toBe(true)
    expect(matchesRecordingLibraryChip(cloud, 'cloud')).toBe(true)
    expect(matchesRecordingLibraryChip(ready, 'ready')).toBe(true)
    expect(matchesRecordingLibraryChip(ready, 'needs_attention')).toBe(false)
  })
})

describe('groupRecordingsByDate', () => {
  it('buckets like Clips and omits empty groups', () => {
    const now = Date.parse('2026-08-09T15:00:00Z')
    const today = rec({ id: 't', recordedAt: Date.parse('2026-08-09T12:00:00Z') })
    const older = rec({ id: 'o', recordedAt: Date.parse('2026-06-01T12:00:00Z') })
    const groups = groupRecordingsByDate([today, older], now)
    expect(groups.map(g => g.label)).toEqual(['Today', 'Older'])
    expect(groups[0]!.items[0]!.id).toBe('t')
  })
})

describe('visibleGroupItems', () => {
  it('paginates when collapsed past limit', () => {
    const items = Array.from({ length: 15 }, (_, i) => i)
    expect(visibleGroupItems(items, true, 12).shown).toHaveLength(15)
    expect(visibleGroupItems(items, false, 12).shown).toHaveLength(12)
    expect(visibleGroupItems(items, false, 12).hiddenCount).toBe(3)
  })
})

describe('recordingDeleteOptions', () => {
  it('offers localOnly only when cloud-backed with local file', () => {
    expect(recordingDeleteOptions(rec({ hasLocalFile: true, cloudUploaded: false }))).toEqual(['remove'])
    expect(
      recordingDeleteOptions(rec({ hasLocalFile: true, cloudUploaded: true, archiveId: 'a1' })),
    ).toEqual(['remove', 'localOnly'])
    expect(
      recordingDeleteOptions(rec({ hasLocalFile: false, cloudUploaded: true, path: '' })),
    ).toEqual(['remove'])
  })
})

describe('formatRecordingBytes', () => {
  it('formats MB/GB', () => {
    expect(formatRecordingBytes(0)).toBe('0 B')
    expect(formatRecordingBytes(5 * 1024 * 1024)).toMatch(/MB/)
    expect(formatRecordingBytes(1.2 * 1024 * 1024 * 1024)).toMatch(/GB/)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd upforge-desktop && npx vitest run src/lib/recording-library.test.ts`

Expected: FAIL (module not found)

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/recording-library.ts
import type { PendingRecording } from '../env.d.ts'
import { canWatchRawRecording } from './recording-demo-status'
import { canRetryRiotMatchStats } from './match-stats-retry'
import { recordingStatusBadge } from './recording-status'

export type RecordingLibraryChip = 'all' | 'needs_attention' | 'ready' | 'analysed' | 'cloud'
export type RecordingDateGroupLabel = 'Today' | 'Yesterday' | 'This Week' | 'This Month' | 'Older'
export interface RecordingDateGroup {
  label: RecordingDateGroupLabel
  items: PendingRecording[]
}
export type RecordingDeleteChoice = 'remove' | 'localOnly' | 'cancel'

export function recordingNeedsAttention(rec: PendingRecording): boolean {
  if (rec.lastAnalysisError) return true
  const badge = recordingStatusBadge(rec)
  if (badge.label === 'Failed') return true
  if (badge.label === 'Syncing') return true
  if (!canWatchRawRecording(rec) && rec.analysisId == null) return true
  if (canRetryRiotMatchStats(rec) && !rec.analysisReadiness?.ready) return true
  return false
}

export function matchesRecordingLibraryChip(rec: PendingRecording, chip: RecordingLibraryChip): boolean {
  if (chip === 'all') return true
  if (chip === 'needs_attention') return recordingNeedsAttention(rec)
  if (chip === 'analysed') return recordingStatusBadge(rec).label === 'Analysed'
  if (chip === 'cloud') return recordingStatusBadge(rec).label === 'Cloud'
  if (chip === 'ready') {
    return (
      rec.analysisId == null
      && !rec.pipelineStatus
      && !recordingNeedsAttention(rec)
      && Boolean(rec.analysisReadiness?.ready)
    )
  }
  return false
}

export function groupRecordingsByDate(items: PendingRecording[], nowMs = Date.now()): RecordingDateGroup[] {
  const DAY = 86_400_000
  const today = new Date(nowMs)
  today.setHours(0, 0, 0, 0)
  const todayMs = today.getTime()
  const buckets: Record<RecordingDateGroupLabel, PendingRecording[]> = {
    Today: [],
    Yesterday: [],
    'This Week': [],
    'This Month': [],
    Older: [],
  }
  for (const r of items) {
    const at = r.recordedAt ?? 0
    const diff = nowMs - at
    if (at >= todayMs) buckets.Today.push(r)
    else if (at >= todayMs - DAY) buckets.Yesterday.push(r)
    else if (diff < 7 * DAY) buckets['This Week'].push(r)
    else if (diff < 30 * DAY) buckets['This Month'].push(r)
    else buckets.Older.push(r)
  }
  return (Object.keys(buckets) as RecordingDateGroupLabel[])
    .filter(label => buckets[label].length > 0)
    .map(label => ({ label, items: buckets[label] }))
}

export function visibleGroupItems<T>(items: T[], showAll: boolean, limit = 12): { shown: T[]; hiddenCount: number } {
  if (showAll || items.length <= limit) return { shown: items, hiddenCount: 0 }
  return { shown: items.slice(0, limit), hiddenCount: items.length - limit }
}

export function recordingDeleteOptions(rec: PendingRecording): Array<'remove' | 'localOnly'> {
  const hasLocal = Boolean(rec.hasLocalFile || (rec.path && rec.path.length > 0))
  const cloud = Boolean(rec.cloudUploaded || rec.jobId || rec.analysisId != null || rec.archiveId)
  if (hasLocal && cloud) return ['remove', 'localOnly']
  return ['remove']
}

export function formatRecordingBytes(bytes: number): string {
  if (!bytes || bytes < 0) return '0 B'
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd upforge-desktop && npx vitest run src/lib/recording-library.test.ts`

Expected: PASS

- [ ] **Step 5: Commit (when user asks)**

```bash
git add src/lib/recording-library.ts src/lib/recording-library.test.ts
git commit -m "$(cat <<'EOF'
feat(recordings): add library grouping and delete helper units

EOF
)"
```

---

### Task 2: Dismiss modes in main process (TDD)

**Files:**
- Create: `electron/main/recording-dismiss.ts`
- Create: `electron/main/recording-dismiss.test.ts`
- Modify: `electron/main/recordings-store.ts` (add `clearLocalPath`)

**Interfaces:**
- Consumes: `deleteLocalRecordingFiles` from `vod-compressor.ts`, `hasCloudRecording` / `isLocalOnlyRecording` from store or `storage-cleanup`
- Produces:
  - `export type RecordingDismissMode = 'remove' | 'localOnly'`
  - `export interface RecordingDismissResult { ok: true; deletedLocal: boolean; freedBytes: number; removedFromLibrary: boolean } | { ok: false; error: string }`
  - `export interface RecordingDismissStore { getById(id: string): PendingRecording | undefined; remove(id: string): void; clearLocalPath(id: string): boolean }`
  - `export function applyRecordingDismiss(store, id, opts: { mode: RecordingDismissMode; deleteLocalFiles?: boolean; deleteFiles: (path: string) => number }): RecordingDismissResult`
  - `RecordingsStore.clearLocalPath(id: string): boolean` — sets `path` to `''`, clears `fileSizeBytes`, persists

- [ ] **Step 1: Add `clearLocalPath` on the store**

In `electron/main/recordings-store.ts`, next to `updatePath`:

```ts
  /** Drop the local file path after deleting cloud-backed locals; keep the catalog row. */
  clearLocalPath(id: string): boolean {
    const rec = this.recordings.find(r => r.id === id)
    if (!rec) return false
    rec.path = ''
    delete rec.fileSizeBytes
    this.persist()
    return true
  }
```

- [ ] **Step 2: Write the failing dismiss tests**

```ts
import { describe, expect, it } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { applyRecordingDismiss } from './recording-dismiss'
import type { PendingRecording } from '../../src/env'

function makeFile(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'upforge-dismiss-'))
  const file = path.join(dir, 'vod.mp4')
  fs.writeFileSync(file, 'x'.repeat(2048))
  return file
}

describe('applyRecordingDismiss', () => {
  it('remove deletes local file and removes catalog for local-only', () => {
    const file = makeFile()
    const rec = {
      id: 'r1',
      path: file,
      clipsOnly: false,
    } as PendingRecording
    const store = {
      getById: (id: string) => (id === 'r1' ? rec : undefined),
      remove: (id: string) => { expect(id).toBe('r1'); (rec as { gone?: boolean }).gone = true },
      clearLocalPath: () => false,
    }
    const result = applyRecordingDismiss(store, 'r1', {
      mode: 'remove',
      deleteFiles: (p) => {
        fs.unlinkSync(p)
        return 2048
      },
    })
    expect(result).toEqual({
      ok: true,
      deletedLocal: true,
      freedBytes: 2048,
      removedFromLibrary: true,
    })
    expect(fs.existsSync(file)).toBe(false)
  })

  it('localOnly deletes file, keeps catalog, clears path', () => {
    const file = makeFile()
    const rec = {
      id: 'r2',
      path: file,
      clipsOnly: false,
      archiveId: 'arch',
      cloudArchived: true,
    } as PendingRecording
    let cleared = false
    const store = {
      getById: () => rec,
      remove: () => { throw new Error('should not remove') },
      clearLocalPath: (id: string) => {
        expect(id).toBe('r2')
        cleared = true
        rec.path = ''
        return true
      },
    }
    const result = applyRecordingDismiss(store, 'r2', {
      mode: 'localOnly',
      deleteFiles: (p) => {
        fs.unlinkSync(p)
        return 100
      },
    })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.removedFromLibrary).toBe(false)
      expect(result.deletedLocal).toBe(true)
    }
    expect(cleared).toBe(true)
  })

  it('localOnly rejects local-only recordings', () => {
    const store = {
      getById: () => ({ id: 'r3', path: '/x', clipsOnly: false } as PendingRecording),
      remove: () => {},
      clearLocalPath: () => false,
    }
    const result = applyRecordingDismiss(store, 'r3', {
      mode: 'localOnly',
      deleteFiles: () => 0,
    })
    expect(result.ok).toBe(false)
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd upforge-desktop && npx vitest run electron/main/recording-dismiss.test.ts`

Expected: FAIL (module not found)

- [ ] **Step 4: Implement `applyRecordingDismiss`**

```ts
// electron/main/recording-dismiss.ts
import type { PendingRecording } from '../../src/env'
import { hasCloudRecording } from './recordings-store'

export type RecordingDismissMode = 'remove' | 'localOnly'

export interface RecordingDismissStore {
  getById(id: string): PendingRecording | undefined
  remove(id: string): void
  clearLocalPath(id: string): boolean
}

export type RecordingDismissResult =
  | { ok: true; deletedLocal: boolean; freedBytes: number; removedFromLibrary: boolean }
  | { ok: false; error: string }

export function applyRecordingDismiss(
  store: RecordingDismissStore,
  id: string,
  opts: {
    mode: RecordingDismissMode
    /** When mode is remove, default true. */
    deleteLocalFiles?: boolean
    deleteFiles: (filePath: string) => number
  },
): RecordingDismissResult {
  const recording = store.getById(id)
  if (!recording) return { ok: false, error: 'Recording not found' }

  if (opts.mode === 'localOnly') {
    if (!hasCloudRecording(recording)) {
      return { ok: false, error: 'Local-only recordings must be removed from the library' }
    }
    if (!recording.path) {
      return { ok: false, error: 'No local file to delete' }
    }
    const freedBytes = opts.deleteFiles(recording.path)
    store.clearLocalPath(id)
    return { ok: true, deletedLocal: true, freedBytes, removedFromLibrary: false }
  }

  // mode === 'remove'
  let freedBytes = 0
  let deletedLocal = false
  const shouldDelete = opts.deleteLocalFiles !== false
  if (shouldDelete && recording.path && !recording.clipsOnly) {
    freedBytes = opts.deleteFiles(recording.path)
    deletedLocal = true
  }
  store.remove(id)
  return { ok: true, deletedLocal, freedBytes, removedFromLibrary: true }
}
```

- [ ] **Step 5: Run tests**

Run: `cd upforge-desktop && npx vitest run electron/main/recording-dismiss.test.ts`

Expected: PASS

- [ ] **Step 6: Commit (when user asks)**

```bash
git add electron/main/recording-dismiss.ts electron/main/recording-dismiss.test.ts electron/main/recordings-store.ts
git commit -m "$(cat <<'EOF'
feat(recordings): add remove and localOnly dismiss modes

EOF
)"
```

---

### Task 3: Wire IPC + preload + types

**Files:**
- Modify: `electron/main/ipc/recordings-ipc.ts` (`recordings:dismiss` handler)
- Modify: `electron/preload/index.ts` (dismiss signature)
- Modify: `src/env.d.ts` (dismiss types)

**Interfaces:**
- Consumes: `applyRecordingDismiss`, `deleteLocalRecordingFiles`, existing abort-in-flight
- Produces: renderer API
  - `dismiss(id: string, opts?: { mode?: 'remove' | 'localOnly'; deleteLocal?: boolean }): Promise<{ ok: boolean; deletedLocal?: boolean; freedBytes?: number; removedFromLibrary?: boolean; error?: string }>`
- Backward compat: omit `mode` → `'remove'`; `deleteLocal: false` still skips file delete on remove

- [ ] **Step 1: Update handler**

Replace body of `recordings:dismiss` with:

```ts
ipcMain.handle(
  'recordings:dismiss',
  (
    _e,
    {
      id,
      deleteLocal = true,
      mode = 'remove',
    }: { id: string; deleteLocal?: boolean; mode?: 'remove' | 'localOnly' },
  ) => {
    const recording = recordingsStore.getById(id)
    if (
      recording
      && (recording.pipelineStatus === 'uploading' || recording.pipelineStatus === 'analysing'
        || (recording.analysed && recording.analysisId == null && !recording.lastAnalysisError))
    ) {
      abortInFlightAnalysisForRecording(id)
    }

    const result = applyRecordingDismiss(recordingsStore, id, {
      mode,
      deleteLocalFiles: deleteLocal,
      deleteFiles: (filePath) => deleteLocalRecordingFiles(filePath),
    })

    if (result.ok) {
      if (result.freedBytes > 0) {
        log.info(`[Recordings] Dismiss freed ${result.freedBytes} bytes (mode=${mode}) id=${id}`)
      }
      getMainWindow()?.webContents.send('recordings:updated')
    }
    return result
  },
)
```

Import `applyRecordingDismiss` from `../recording-dismiss`.

- [ ] **Step 2: Preload**

```ts
dismiss: (id: string, opts?: { deleteLocal?: boolean; mode?: 'remove' | 'localOnly' }) =>
  ipcRenderer.invoke('recordings:dismiss', {
    id,
    deleteLocal: opts?.deleteLocal,
    mode: opts?.mode,
  }),
```

- [ ] **Step 3: `env.d.ts`**

```ts
dismiss: (
  id: string,
  opts?: { deleteLocal?: boolean; mode?: 'remove' | 'localOnly' },
) => Promise<{
  ok: boolean
  deletedLocal?: boolean
  freedBytes?: number
  removedFromLibrary?: boolean
  error?: string
}>
```

- [ ] **Step 4: Confirm Dashboard still compiles**

`useDashboard` keeps `dismiss(id, { deleteLocal: true })` (defaults to `remove`, now also deletes cloud-backed locals — intended).

- [ ] **Step 5: Type-check**

Run: `cd upforge-desktop && npm run type-check`

Expected: PASS (or only pre-existing unrelated errors)

- [ ] **Step 6: Commit (when user asks)**

```bash
git add electron/main/ipc/recordings-ipc.ts electron/preload/index.ts src/env.d.ts
git commit -m "$(cat <<'EOF'
feat(recordings): expose dismiss modes to the renderer

EOF
)"
```

---

### Task 4: RecordingsView chrome (groups, chips, storage)

**Files:**
- Modify: `src/views/RecordingsView.vue`

**Interfaces:**
- Consumes: helpers from Task 1; `window.api.storage.getUsage` / `openFolder`
- Produces: filtered + grouped UI; no delete UI yet (Task 5)

- [ ] **Step 1: State + load storage**

Add refs/computeds:

```ts
import {
  formatRecordingBytes,
  groupRecordingsByDate,
  matchesRecordingLibraryChip,
  type RecordingLibraryChip,
  visibleGroupItems,
} from '../lib/recording-library'

const statusChip = ref<RecordingLibraryChip>('all')
const recordingsBytes = ref(0)
const collapsedGroups = ref<Set<string>>(new Set())
const showAllByGroup = ref<Set<string>>(new Set())

const chipFiltered = computed(() =>
  filtered.value.filter(r => matchesRecordingLibraryChip(r, statusChip.value)),
)
const dateGroups = computed(() => groupRecordingsByDate(chipFiltered.value))

async function loadStorage() {
  const usage = await window.api.storage.getUsage().catch(() => null)
  recordingsBytes.value = usage?.recordingsBytes ?? 0
}

// in load(): also void loadStorage()
// on recordings:updated: also void loadStorage()

onMounted: after first group compute, collapse all labels except the first group's label
```

Initialize collapsed set when `dateGroups` changes: keep first group expanded; collapse the rest if user has not toggled yet (mirror Clips: collapse older by default).

- [ ] **Step 2: Toolbar UI under header**

After game pills (or below header if single game), add a row:

- Chips: All / Needs attention / Ready / Analysed / Cloud
- Right: `{{ chipFiltered.length }}` count · `{{ formatRecordingBytes(recordingsBytes) }} local` · button **Open folder** → `window.api.storage.openFolder()`
- **Select** button (disabled styling ok until Task 5 wires selection; can leave handler stub `selecting = false` for now or skip Select until Task 5)

- [ ] **Step 3: Replace flat grid with grouped list**

For each group in `dateGroups`:

- Collapsible header: label + count + chevron
- Body: grid of cards (existing card markup) using `visibleGroupItems(group.items, showAllByGroup.has(label))`
- If `hiddenCount > 0`: **Show more** sets that group key into `showAllByGroup`

Preserve existing Watch / Analyse / Retry sync buttons for now.

- [ ] **Step 4: Manual smoke**

Run desktop app, open Recordings: groups appear, chips filter, Open folder works, storage line shows.

- [ ] **Step 5: Commit (when user asks)**

```bash
git add src/views/RecordingsView.vue
git commit -m "$(cat <<'EOF'
feat(recordings): add date groups, status chips, and storage chrome

EOF
)"
```

---

### Task 5: Delete UX + multi-select + stale card lines

**Files:**
- Modify: `src/views/RecordingsView.vue`

**Interfaces:**
- Consumes: `recordingDeleteOptions`, `window.api.recordings.dismiss`, Task 4 chrome
- Produces: full delete + selection flows from the spec

- [ ] **Step 1: Selection state**

```ts
const selecting = ref(false)
const selectedIds = ref<Set<string>>(new Set())

function toggleSelectMode() {
  selecting.value = !selecting.value
  selectedIds.value = new Set()
}

function toggleSelected(id: string) {
  const next = new Set(selectedIds.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  selectedIds.value = next
}
```

- [ ] **Step 2: Single delete confirm**

```ts
async function deleteRecording(rec: PendingRecording) {
  const options = recordingDeleteOptions(rec)
  const inFlight = rec.pipelineStatus === 'uploading' || rec.pipelineStatus === 'analysing'

  if (options.includes('localOnly')) {
    // Use window.confirm for two buttons is awkward — use a small inline modal state:
    // pendingDelete = { rec, kind: 'cloud' }
    // UI offers: Cancel | Delete local only | Remove from library
    pendingDelete.value = { rec, variant: 'cloud' }
    return
  }

  const label = inFlight
    ? 'This recording is still uploading or analysing. Abort and delete it from this PC?'
    : 'Delete this recording from your library and remove the local file?'
  if (!window.confirm(label)) return
  await runDismiss(rec.id, 'remove')
}

async function runDismiss(id: string, mode: 'remove' | 'localOnly') {
  busyId.value = id
  message.value = null
  try {
    const result = await window.api.recordings.dismiss(id, { mode, deleteLocal: true })
    if (!result?.ok) {
      message.value = result?.error ?? 'Could not delete recording.'
      return
    }
    const freed = result.freedBytes ?? 0
    message.value = freed > 0
      ? `Deleted — freed ${formatRecordingBytes(freed)}.`
      : (mode === 'localOnly' ? 'Local file removed — still available from cloud.' : 'Removed from library.')
    await load()
  } catch {
    message.value = 'Could not delete recording — try again.'
  } finally {
    busyId.value = null
    pendingDelete.value = null
  }
}
```

Add a compact modal/panel in the template for `pendingDelete.variant === 'cloud'` with the three actions. Prefer existing panel styles (no new design system).

- [ ] **Step 3: Multi-select delete**

Sticky bar when `selecting && selectedIds.size`:

- `N selected` · **Delete** · **Cancel**

On Delete:

```ts
const selected = recordings.value.filter(r => selectedIds.value.has(r.id))
const cloudBackedLocal = selected.filter(r => recordingDeleteOptions(r).includes('localOnly')).length
const ok = window.confirm(
  cloudBackedLocal > 0
    ? `Remove ${selected.length} recording(s) from your library? Local files will be deleted. Cloud copies stay (${cloudBackedLocal} cloud-backed).`
    : `Delete ${selected.length} recording(s) from your library and remove local files?`,
)
if (!ok) return
let freed = 0
let failed = 0
for (const r of selected) {
  const result = await window.api.recordings.dismiss(r.id, { mode: 'remove', deleteLocal: true }).catch(() => null)
  if (!result?.ok) failed++
  else freed += result.freedBytes ?? 0
}
message.value = failed
  ? `Removed ${selected.length - failed}, ${failed} failed.${freed ? ` Freed ${formatRecordingBytes(freed)}.` : ''}`
  : `Deleted ${selected.length}.${freed ? ` Freed ${formatRecordingBytes(freed)}.` : ''}`
selecting.value = false
selectedIds.value = new Set()
await load()
```

- [ ] **Step 4: Card affordances**

Normal mode:

- Trash / Delete button → `deleteRecording(rec)`
- If `recordingNeedsAttention(rec)`: one-line hint under date (`rec.lastAnalysisError` or readiness message or “File missing”) + Retry when `canRetryRiotMatchStats` / existing Analyse path

Select mode:

- Checkbox on card; click toggles selection
- Hide Watch / Analyse / Retry

Wire **Select** from Task 4 toolbar to `toggleSelectMode`.

- [ ] **Step 5: Manual smoke checklist**

1. Local-only: Delete → gone from list + file removed  
2. Cloud+local: Delete local only → badge Cloud, Watch still works via cloud  
3. Cloud+local: Remove from library → row gone, cloud intact  
4. Multi-select mixed batch → summary confirm, partial failure message works  
5. Needs attention chip shows failed/missing  
6. Open folder + storage update after delete  

- [ ] **Step 6: Automated tests still pass**

Run:

```bash
cd upforge-desktop && npx vitest run src/lib/recording-library.test.ts electron/main/recording-dismiss.test.ts src/lib/recording-status.test.ts
cd upforge-desktop && npm run type-check
```

Expected: PASS

- [ ] **Step 7: Commit (when user asks)**

```bash
git add src/views/RecordingsView.vue
git commit -m "$(cat <<'EOF'
feat(recordings): delete, multi-select, and stale actions on library tab

EOF
)"
```

---

## Spec coverage checklist

| Spec requirement | Task |
|------------------|------|
| Delete local + library; never delete cloud archive | 2, 3, 5 |
| Cloud-backed: localOnly vs remove | 1, 2, 5 |
| Cloud-only remove from library | 1, 5 |
| Abort in-flight then dismiss | 3 |
| Multi-select + summary confirm; continue on failure | 5 |
| Status chips | 1, 4 |
| Date groups + collapse + Show more (~12) | 1, 4 |
| Storage line + Open folder | 4 |
| Failed/stale status line + Retry/Delete | 5 |
| Copy: Delete / Remove from library | 5 |
| Out of scope: cloud API delete, save-to-cloud, demo attach, Clips extract | — |

## Self-review notes

- `deletedLocal` semantics clarified in Task 2 (path existed + delete requested).
- Multi-select always `remove` (no batch `localOnly`) — matches spec “one confirm with summary”.
- Dashboard dismiss becomes slightly more aggressive (also deletes cloud-backed locals on remove); intentional and documented in Task 3.
