/**
 * Untracked recording files (owner rule: nothing is deleted silently).
 *
 * An untracked file is an .mp4 in the recordings folder that no catalogue knows about. Automatic
 * cleanup used to delete these straight away. Now a file only becomes due for removal when it is
 * older than `recordingRetentionDays`, or when untracked files take more than UNTRACKED_CAP_BYTES
 * (oldest first, so they cannot fill the disk). A due file is warned first (persisted), and is
 * deleted only once UNTRACKED_GRACE_MS has passed since that warning. "Never" auto-delete keeps them all.
 */
import fs from 'fs'
import path from 'path'

const DAY_MS = 24 * 60 * 60 * 1000

/** Time between the first warning and deletion. */
export const UNTRACKED_GRACE_MS = 7 * DAY_MS
/** Last reminder this long before deletion. */
export const UNTRACKED_FINAL_WARNING_MS = DAY_MS
/** Untracked files above this total are due for removal (oldest first), whatever their age. */
export const UNTRACKED_CAP_BYTES = 30 * 1024 ** 3

export interface UntrackedFile {
  path: string
  size: number
  mtimeMs: number
}

export interface UntrackedEntry {
  /** First time this file was due for removal and the user was warned. */
  warnedAt: number
  /** Last-day reminder. */
  finalWarnedAt?: number
  size: number
}

export type UntrackedState = Record<string, UntrackedEntry>

export type UntrackedReason = 'age' | 'size_cap'

export interface UntrackedWarning {
  path: string
  size: number
  stage: 'first' | 'final'
  reason: UntrackedReason
  deleteAt: number
}

export interface UntrackedPlan {
  warn: UntrackedWarning[]
  delete: UntrackedFile[]
  /** State to persist (files that are gone, tracked again or no longer due are dropped). */
  state: UntrackedState
}

function key(filePath: string): string {
  return path.normalize(filePath)
}

/** Files due for removal and why — age past retention, or over the size cap (oldest first). */
function dueReasons(
  files: UntrackedFile[],
  retentionDays: number,
  capBytes: number,
  now: number,
): Map<string, UntrackedReason> {
  const due = new Map<string, UntrackedReason>()
  if (retentionDays <= 0) return due

  const cutoff = now - retentionDays * DAY_MS
  for (const f of files) if (f.mtimeMs < cutoff) due.set(key(f.path), 'age')

  let total = files.reduce((sum, f) => sum + f.size, 0)
  for (const f of [...files].sort((a, b) => a.mtimeMs - b.mtimeMs)) {
    if (total <= capBytes) break
    if (!due.has(key(f.path))) due.set(key(f.path), 'size_cap')
    total -= f.size
  }
  return due
}

export function planUntrackedRecordings(
  files: UntrackedFile[],
  previous: UntrackedState,
  opts: { retentionDays: number; now?: number; capBytes?: number; graceMs?: number },
): UntrackedPlan {
  const now = opts.now ?? Date.now()
  const graceMs = opts.graceMs ?? UNTRACKED_GRACE_MS
  const due = dueReasons(files, opts.retentionDays, opts.capBytes ?? UNTRACKED_CAP_BYTES, now)

  const plan: UntrackedPlan = { warn: [], delete: [], state: {} }
  for (const f of files) {
    const k = key(f.path)
    const reason = due.get(k)
    if (!reason) continue // not due (or no longer due) → forget any earlier warning

    const prev = previous[k]
    if (!prev) {
      plan.state[k] = { warnedAt: now, size: f.size }
      plan.warn.push({ path: f.path, size: f.size, stage: 'first', reason, deleteAt: now + graceMs })
      continue
    }

    const deleteAt = prev.warnedAt + graceMs
    if (now >= deleteAt) {
      plan.delete.push(f)
      continue
    }
    const entry: UntrackedEntry = { ...prev, size: f.size }
    if (!prev.finalWarnedAt && deleteAt - now <= UNTRACKED_FINAL_WARNING_MS) {
      entry.finalWarnedAt = now
      plan.warn.push({ path: f.path, size: f.size, stage: 'final', reason, deleteAt })
    }
    plan.state[k] = entry
  }
  return plan
}

/** Soonest scheduled deletion among warned files that still exist, for the Settings countdown. */
export function untrackedSchedule(
  state: UntrackedState,
  existingPaths: Iterable<string>,
  graceMs = UNTRACKED_GRACE_MS,
): { count: number; bytes: number; deleteAt: number | null } {
  let count = 0
  let bytes = 0
  let deleteAt: number | null = null
  for (const p of existingPaths) {
    const entry = state[key(p)]
    if (!entry) continue
    count++
    bytes += entry.size
    const at = entry.warnedAt + graceMs
    deleteAt = deleteAt == null ? at : Math.min(deleteAt, at)
  }
  return { count, bytes, deleteAt }
}

export function readUntrackedState(statePath: string): UntrackedState {
  try {
    const parsed = JSON.parse(fs.readFileSync(statePath, 'utf8')) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    const state: UntrackedState = {}
    for (const [p, v] of Object.entries(parsed as Record<string, Partial<UntrackedEntry>>)) {
      if (v && typeof v.warnedAt === 'number' && Number.isFinite(v.warnedAt)) {
        state[p] = { warnedAt: v.warnedAt, size: typeof v.size === 'number' ? v.size : 0, ...(typeof v.finalWarnedAt === 'number' ? { finalWarnedAt: v.finalWarnedAt } : {}) }
      }
    }
    return state
  } catch {
    return {}
  }
}

export function writeUntrackedState(statePath: string, state: UntrackedState): void {
  fs.mkdirSync(path.dirname(statePath), { recursive: true })
  fs.writeFileSync(statePath, JSON.stringify(state))
}

function formatGb(bytes: number): string {
  const gb = bytes / 1024 ** 3
  return gb >= 0.1 ? `${gb.toFixed(1)} GB` : `${Math.max(1, Math.round(bytes / 1024 ** 2))} MB`
}

export function untrackedNotificationBody(warnings: UntrackedWarning[], now = Date.now()): string {
  const count = warnings.length
  const bytes = warnings.reduce((sum, w) => sum + w.size, 0)
  const soonest = Math.min(...warnings.map(w => w.deleteAt))
  const days = Math.max(0, Math.ceil((soonest - now) / DAY_MS))
  const when = days <= 1 ? 'within a day' : `in ${days} days`
  const what = count === 1 ? '1 untracked recording file' : `${count} untracked recording files`
  return `${what} (${formatGb(bytes)}) will be deleted ${when}. They are not in your match list — move them out of the recordings folder to keep them, or change auto-delete in Settings → Recording.`
}
