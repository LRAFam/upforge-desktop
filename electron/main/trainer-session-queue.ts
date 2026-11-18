/**
 * trainer-session-queue.ts
 * Uploads finished trainer runs to POST /api/training/sessions and keeps the ones that could not be
 * sent (offline, API down, signed out, rate limited) on disk, retrying with backoff until they land or
 * are a week old. Each run gets a `metadata.client_run_id`, so a resend after a lost response is stored
 * once by the API.
 * A run is written to disk before its first POST and removed only once the API accepts it, so a crash
 * or quit during that first request still leaves it to resend on the next start.
 * A run the API refuses (4xx) or that is still unsent after a week is never deleted: it moves to a small
 * "unsaved" file with the reason, and is not resent automatically.
 * No Electron imports (unit-tested); the IPC layer wires post / token / notify.
 */
import fs from 'fs'
import path from 'path'
import { randomUUID } from 'crypto'

import type { TrainerDrillState, TrainerSyncOutcome, TrainerUploadStatus } from '../../src/lib/trainer-sync'

export type { TrainerDrillState, TrainerSyncOutcome, TrainerUploadStatus } from '../../src/lib/trainer-sync'

interface PendingRun {
  clientRunId: string
  /** UpForge account that played the run. Only ever uploaded while that account is signed in. */
  ownerUserId?: number | null
  key: string
  payload: Record<string, unknown>
  /** Failed tries so far; only sets the backoff (there is no try limit). */
  attempts: number
  nextAt: number
  createdAt: number
}

/** A run that could not be saved: kept with the reason so it is never lost silently. */
interface UnsavedRun {
  clientRunId: string
  ownerUserId?: number | null
  key: string
  payload: Record<string, unknown>
  createdAt: number
  failedAt: number
  /** rejected = the API refused it (4xx); expired = not uploaded within MAX_AGE_MS. */
  reason: 'rejected' | 'expired'
  status: number | null
  message: string
}

/** Files a retry round changed; it writes each one once when the round ends. */
interface WriteRound {
  pending: boolean
  unsaved: boolean
}

export interface TrainerSessionQueueOptions {
  file: string
  /** Where unsaved runs are kept. Default: trainer-unsaved-sessions.json next to `file`. */
  unsavedFile?: string
  post: (payload: Record<string, unknown>) => Promise<unknown>
  hasToken: () => boolean
  /** Signed-in UpForge account, or null. Runs owned by another account are never sent. */
  currentUserId: () => number | null
  notify?: (outcome: TrainerSyncOutcome) => void
  /** Runs waiting or unsaved changed (see uploadStatus). */
  onChange?: () => void
  now?: () => number
  log?: { info: (...a: unknown[]) => void; warn: (...a: unknown[]) => void }
  /** Test hook; defaults to setTimeout (unref'd). */
  schedule?: (fn: () => void, ms: number) => unknown
}

/** A run still unsent after this long moves to the unsaved file (reported as failed). Unsaved runs count as "recent" this long. */
export const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000
/** The unsaved file keeps the newest this many runs. */
export const MAX_UNSAVED_RUNS = 50
const DELAYS_MS = [5_000, 30_000, 120_000, 600_000, 1_800_000]

/** Backoff after the Nth failed attempt (1-based): 5 s, 30 s, 2 min, 10 min, then every 30 min. */
export function retryDelayMs(attempts: number): number {
  return DELAYS_MS[Math.min(Math.max(attempts, 1), DELAYS_MS.length) - 1]
}

/** Network errors, timeouts, auth expiry, rate limits and server errors are worth retrying; 4xx validation is not. */
export function isRetryableUploadError(err: unknown): boolean {
  const status = (err as { status?: unknown } | null)?.status
  if (typeof status !== 'number') return true
  return status === 401 || status === 408 || status === 429 || status >= 500
}

/** One run = one scenario + finish time (what the result screen shows). */
export function trainerRunKey(scenario: unknown, completedAt: unknown): string {
  return `${String(scenario ?? '')}|${String(completedAt ?? '')}`
}

export function drillStateFrom(response: unknown): TrainerDrillState | null {
  const d = (response as { drill?: unknown } | null)?.drill
  if (!d || typeof d !== 'object') return null
  const o = d as Record<string, unknown>
  if (typeof o.id !== 'number' || typeof o.status !== 'string') return null
  const n = o.next as Record<string, unknown> | null | undefined
  return {
    id: o.id,
    title: typeof o.title === 'string' ? o.title : null,
    status: o.status,
    completed: o.completed === true,
    attempt_count: Number(o.attempt_count) || 0,
    attempts_allowed: Number(o.attempts_allowed) || 3,
    pass_score: Number(o.pass_score) || 70,
    next: n && typeof n === 'object' && typeof n.id === 'number'
      ? {
          id: n.id,
          title: typeof n.title === 'string' ? n.title : null,
          trainer_difficulty: typeof n.trainer_difficulty === 'string' ? n.trainer_difficulty : null,
          pass_score: Number(n.pass_score) || 70,
        }
      : null,
    // Newer APIs only: practice target hit (trainer) is kept apart from verified (match evidence).
    ...(typeof o.practice_passed === 'boolean' ? { practice_passed: o.practice_passed } : {}),
    ...(typeof o.practice_passed_at === 'string' ? { practice_passed_at: o.practice_passed_at } : {}),
    ...(typeof o.verified === 'boolean' ? { verified: o.verified } : {}),
    ...(typeof o.verified_by === 'string' ? { verified_by: o.verified_by } : {}),
  }
}

export class TrainerSessionQueue {
  private pending: PendingRun[] = []
  private unsaved: UnsavedRun[] = []
  private outcomes = new Map<string, TrainerSyncOutcome>()
  private flushing = false
  /** Runs with a POST in flight: a flush must not send them a second time. */
  private inFlight = new Set<string>()
  private timerAt: number | null = null
  private readonly now: () => number
  private readonly unsavedFile: string

  constructor(private readonly opts: TrainerSessionQueueOptions) {
    this.now = opts.now ?? Date.now
    this.unsavedFile = opts.unsavedFile ?? path.join(path.dirname(opts.file), 'trainer-unsaved-sessions.json')
    this.pending = this.read()
    this.unsaved = this.readUnsaved()
  }

  /** Runs still waiting to upload (for tests and diagnostics). */
  get pendingCount(): number { return this.pending.length }

  /** One account's runs (default: the signed-in one) waiting to upload, and those unsaved in the last week. */
  uploadStatus(userId: number | null = this.opts.currentUserId()): TrainerUploadStatus {
    if (userId == null) return { waiting: 0, unsaved: 0 }
    const since = this.now() - MAX_AGE_MS
    return {
      waiting: this.pending.filter(r => r.ownerUserId === userId).length,
      unsaved: this.unsaved.filter(r => r.ownerUserId === userId && r.failedAt >= since).length,
    }
  }

  /** Latest known sync state for a run shown on the results screen. */
  outcomeFor(key: string): TrainerSyncOutcome | null {
    return this.outcomes.get(key) ?? null
  }

  /**
   * Upload a finished run now; if it cannot be sent it is saved and retried.
   * `ownerUserId` is the account that launched the run (defaults to whoever is signed in now).
   */
  async submit(payload: Record<string, unknown>, ownerUserId: number | null = this.opts.currentUserId()): Promise<TrainerSyncOutcome> {
    const clientRunId = randomUUID()
    const metadata = { ...((payload.metadata as Record<string, unknown> | undefined) ?? {}), client_run_id: clientRunId }
    const run: PendingRun = {
      clientRunId,
      ownerUserId,
      key: trainerRunKey(payload.scenario, payload.completed_at),
      payload: { ...payload, metadata },
      attempts: 0,
      nextAt: this.now(),
      createdAt: this.now(),
    }
    // Save first: if the app dies while this POST is pending, the next start resends the same run id.
    this.pending.push(run)
    const stored = this.write()
    return this.attempt(run, true, stored)
  }

  /** Try every pending run that is due. Safe to call often (sign-in, app start, timer). */
  async flush(): Promise<void> {
    if (this.flushing) return
    this.flushing = true
    // Each file is written once per round, not once per run: rewriting the whole queue for each of hundreds of
    // waiting runs froze the app for seconds. The runs are already on disk; a crash mid-round loses only retry counts.
    const round: WriteRound = { pending: false, unsaved: false }
    try {
      for (const run of [...this.pending]) {
        if (run.nextAt > this.now() || this.inFlight.has(run.clientRunId)) continue
        await this.attempt(run, false, true, round)
      }
    } finally {
      this.flushing = false
      // The unsaved copy first, as in giveUp: a crash in between leaves a run in both files, never in neither.
      if (round.unsaved) this.writeUnsaved()
      if (round.pending) this.write()
      this.scheduleNext()
    }
  }

  /** Runs from older builds have no owner: they are kept, never claimed by whoever signs in. */
  private ownedByCurrentUser(run: PendingRun): boolean {
    const current = this.opts.currentUserId()
    return run.ownerUserId != null && current != null && run.ownerUserId === current
  }

  /** `round`: called from a retry round, which writes the files once at its end. */
  private async attempt(run: PendingRun, isNew: boolean, stored = true, round?: WriteRound): Promise<TrainerSyncOutcome> {
    if (!this.ownedByCurrentUser(run)) {
      if (run.ownerUserId == null && isNew) {
        this.opts.log?.warn('[Trainer] Run finished while signed out — kept locally, not uploaded')
      }
      return this.keep(run, false, round)
    }
    if (!this.opts.hasToken()) return this.keep(run, false, round)
    this.inFlight.add(run.clientRunId)
    try {
      const res = await this.opts.post(run.payload)
      this.drop(run, round)
      if (!stored) this.opts.log?.warn('[Trainer] Run was sent but could not be saved locally first')
      this.opts.log?.info('[Trainer] Session synced to API', run.attempts ? `(after ${run.attempts} retries)` : '')
      return this.report({ key: run.key, clientRunId: run.clientRunId, state: 'saved', drill: drillStateFrom(res) })
    } catch (err) {
      const retry = isRetryableUploadError(err)
      this.opts.log?.warn('[Trainer] Session upload failed:', (err as Error)?.message, retry ? '(will retry)' : '(not retried)')
      if (!retry) {
        const status = (err as { status?: unknown } | null)?.status
        return this.giveUp(run, 'rejected', typeof status === 'number' ? status : null, String((err as Error)?.message ?? ''), round)
      }
      return this.keep(run, true, round)
    } finally {
      this.inFlight.delete(run.clientRunId)
    }
  }

  /** Retryable failures never count against a run: it waits until it uploads or is MAX_AGE_MS old. */
  private keep(run: PendingRun, tried: boolean, round?: WriteRound): TrainerSyncOutcome {
    if (tried) run.attempts += 1
    if (this.now() - run.createdAt > MAX_AGE_MS) return this.giveUp(run, 'expired', null, 'Not uploaded within 7 days', round)
    run.nextAt = this.now() + retryDelayMs(Math.max(run.attempts, 1))
    if (!this.pending.some(p => p.clientRunId === run.clientRunId)) this.pending.push(run)
    // In a retry round the run is already on disk and the round writes the file once at its end.
    let stored = true
    if (round) round.pending = true
    else stored = this.write()
    this.scheduleNext()
    return this.report({ key: run.key, clientRunId: run.clientRunId, state: 'pending', drill: null, ...(stored ? {} : { stored: false }) }, run)
  }

  /** Moves a run from the upload queue to the unsaved file (not resent automatically) and reports it as failed. */
  private giveUp(run: PendingRun, reason: UnsavedRun['reason'], status: number | null, message: string, round?: WriteRound): TrainerSyncOutcome {
    const entry: UnsavedRun = {
      clientRunId: run.clientRunId,
      ownerUserId: run.ownerUserId ?? null,
      key: run.key,
      payload: run.payload,
      createdAt: run.createdAt,
      failedAt: this.now(),
      reason,
      status,
      message,
    }
    this.unsaved = [...this.unsaved.filter(u => u.clientRunId !== run.clientRunId), entry].slice(-MAX_UNSAVED_RUNS)
    // The unsaved copy is written first: a crash in between leaves the run in both files, never in neither.
    if (round) round.unsaved = true
    else this.writeUnsaved()
    this.drop(run, round)
    return this.report({ key: run.key, clientRunId: run.clientRunId, state: 'failed', drill: null }, run)
  }

  private drop(run: PendingRun, round?: WriteRound): void {
    const before = this.pending.length
    this.pending = this.pending.filter(p => p.clientRunId !== run.clientRunId)
    if (this.pending.length === before) return
    if (round) round.pending = true
    else this.write()
  }

  private report(outcome: TrainerSyncOutcome, run?: PendingRun): TrainerSyncOutcome {
    // Another account's run: no sync status or UI events in this account's session.
    if (run && (run.ownerUserId ?? null) !== this.opts.currentUserId()) return outcome
    this.outcomes.set(outcome.key, outcome)
    if (this.outcomes.size > 50) this.outcomes.delete(this.outcomes.keys().next().value as string)
    this.opts.notify?.(outcome)
    return outcome
  }

  private scheduleNext(): void {
    if (!this.pending.length) return
    const due = Math.min(...this.pending.map(p => p.nextAt))
    if (this.timerAt !== null && this.timerAt <= due) return
    this.timerAt = due
    const schedule = this.opts.schedule ?? ((fn: () => void, ms: number) => {
      const t = setTimeout(fn, ms)
      ;(t as { unref?: () => void }).unref?.()
      return t
    })
    schedule(() => { this.timerAt = null; void this.flush() }, Math.max(0, due - this.now()))
  }

  private read(): PendingRun[] {
    try {
      const raw = JSON.parse(fs.readFileSync(this.opts.file, 'utf8')) as unknown
      return Array.isArray(raw)
        ? raw.filter((r): r is PendingRun => !!r && typeof r === 'object' && typeof (r as PendingRun).clientRunId === 'string' && !!(r as PendingRun).payload)
        : []
    } catch {
      return []
    }
  }

  private readUnsaved(): UnsavedRun[] {
    try {
      const raw = JSON.parse(fs.readFileSync(this.unsavedFile, 'utf8')) as unknown
      return Array.isArray(raw)
        ? raw.filter((r): r is UnsavedRun => !!r && typeof r === 'object' && typeof (r as UnsavedRun).clientRunId === 'string' && typeof (r as UnsavedRun).failedAt === 'number')
        : []
    } catch {
      return []
    }
  }

  private write(): boolean {
    return this.writeFile(this.opts.file, this.pending, 'pending sessions')
  }

  private writeUnsaved(): boolean {
    return this.writeFile(this.unsavedFile, this.unsaved, 'unsaved sessions')
  }

  /** Atomic write (temp file + rename) so a crash mid-write never leaves a half-written file. */
  private writeFile(file: string, data: unknown, what: string): boolean {
    const tmp = `${file}.tmp`
    try {
      fs.mkdirSync(path.dirname(file), { recursive: true })
      const json = JSON.stringify(data)
      fs.writeFileSync(tmp, json)
      try {
        fs.renameSync(tmp, file)
      } catch {
        // Windows can refuse the rename while another process holds the file: write it directly.
        fs.writeFileSync(file, json)
        fs.rmSync(tmp, { force: true })
      }
      return true
    } catch (err) {
      this.opts.log?.warn(`[Trainer] Could not save ${what}:`, (err as Error)?.message)
      return false
    } finally {
      try { this.opts.onChange?.() } catch { /* a listener error never breaks the queue */ }
    }
  }
}
