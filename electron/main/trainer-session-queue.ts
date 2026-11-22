/**
 * trainer-session-queue.ts
 * Uploads finished trainer runs to POST /api/training/sessions and keeps the ones that could not be
 * sent (offline, API down, signed out, rate limited) on disk, retrying with backoff in the background for
 * a week after the run (or after the player last pressed Retry). Each run gets a `metadata.client_run_id`,
 * so a resend after a lost response is stored once by the API.
 * A run is written to disk before its first POST and removed only once the API accepts it, so a crash
 * or quit during that first request still leaves it to resend on the next start.
 * A run the API refuses (4xx), or one whose last try after its week of background tries fails, moves to the
 * "unsaved" file with the reason. That file keeps each account's newest MAX_UNSAVED_RUNS runs; the result
 * screen lists them, and its Retry sends them again.
 * No Electron imports (unit-tested); the IPC layer wires post / token / notify.
 */
import fs from 'fs'
import path from 'path'
import { randomUUID } from 'crypto'

import { trainerRunKey, type TrainerDrillState, type TrainerSyncOutcome, type TrainerUnsavedRun, type TrainerUploadStatus } from '../../src/lib/trainer-sync'

export type { TrainerDrillState, TrainerSyncOutcome, TrainerUnsavedRun, TrainerUploadStatus } from '../../src/lib/trainer-sync'
// The same key the screens use to find a run's outcome (Practice's guided steps, the result screen).
export { trainerRunKey }

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
  /** When the player last pressed Retry: background tries run for MAX_AGE_MS from here, else from createdAt. */
  retriedAt?: number
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

/**
 * Background tries stop this long after the run (or the last Retry): the run then gets one last try, in the first
 * round its account is signed in, so an app left open and an app started a week later treat a run alike. If that
 * try fails, the run moves to the unsaved file (reported as failed).
 */
export const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000
/** The unsaved file keeps each account's newest this many runs: one account never pushes out another's. */
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

/** Why the API saved the run but did not count it (`session.unranked_reason`), or null (counted, or an older API). */
export function unrankedReasonFrom(response: unknown): string | null {
  const s = (response as { session?: unknown } | null)?.session
  const reason = s && typeof s === 'object' ? (s as { unranked_reason?: unknown }).unranked_reason : null
  return typeof reason === 'string' && reason.trim() ? reason.trim() : null
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

  /** One account's runs (default: the signed-in one) waiting to upload, and those in the unsaved file. */
  uploadStatus(userId: number | null = this.opts.currentUserId()): TrainerUploadStatus {
    if (userId == null) return { waiting: 0, unsaved: 0 }
    return {
      waiting: this.pending.filter(r => r.ownerUserId === userId).length,
      unsaved: this.unsavedOf(userId).length,
    }
  }

  /** One account's unsaved runs for the result screen, newest first, without the run data. */
  unsavedRuns(userId: number | null = this.opts.currentUserId()): TrainerUnsavedRun[] {
    if (userId == null) return []
    return [...this.unsavedOf(userId)].sort((a, b) => b.createdAt - a.createdAt).map(u => ({
      clientRunId: u.clientRunId,
      scenario: String(u.payload.scenario ?? ''),
      completedAt: typeof u.payload.completed_at === 'string' ? u.payload.completed_at : null,
      reason: u.reason,
      status: u.status,
      message: u.message,
      failedAt: u.failedAt,
    }))
  }

  /**
   * The player's Retry: one account's unsaved runs go back to the upload queue with their run ids and another
   * MAX_AGE_MS of background tries, then a round sends them. Returns how many went back.
   */
  async retryUnsaved(userId: number | null = this.opts.currentUserId()): Promise<number> {
    if (userId == null) return 0
    const runs = this.unsaved.filter(u => u.ownerUserId === userId)
    if (!runs.length) return 0
    const ids = new Set(runs.map(u => u.clientRunId))
    const at = this.now()
    const before = this.pending
    this.pending = [
      ...this.pending.filter(p => !ids.has(p.clientRunId)),
      ...runs.map((u): PendingRun => ({ clientRunId: u.clientRunId, ownerUserId: userId, key: u.key, payload: u.payload, attempts: 0, nextAt: at, createdAt: u.createdAt, retriedAt: at })),
    ]
    // The queue copy first: a crash in between leaves the runs in both files, never in neither.
    if (!this.write()) {
      this.pending = before
      return 0
    }
    this.unsaved = this.unsaved.filter(u => !ids.has(u.clientRunId))
    this.writeUnsaved()
    await this.flush()
    return runs.length
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

  /** A run also back in the queue (a crash during Retry or a give-up left it in both files) counts as waiting. */
  private unsavedOf(userId: number): UnsavedRun[] {
    const queued = new Set(this.pending.map(p => p.clientRunId))
    return this.unsaved.filter(u => u.ownerUserId === userId && !queued.has(u.clientRunId))
  }

  /** `round`: called from a retry round, which writes the files once at its end. */
  private async attempt(run: PendingRun, isNew: boolean, stored = true, round?: WriteRound): Promise<TrainerSyncOutcome> {
    // Past its week a run still gets one last try, in the first round its account is signed in (the app's first
    // round runs before the saved sign-in loads), whether the app stayed open or was started again later.
    // If that try fails too, the run moves to the unsaved file, where Retry can send it.
    const lastTry = !isNew && this.now() - (run.retriedAt ?? run.createdAt) > MAX_AGE_MS
    if (!this.ownedByCurrentUser(run)) {
      // No account can ever send a run without an owner: it moves once its week is over.
      if (lastTry && run.ownerUserId == null) return this.giveUp(run, 'expired', null, 'Not uploaded within 7 days', round)
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
      this.dropUnsaved(run.clientRunId, round)
      if (!stored) this.opts.log?.warn('[Trainer] Run was sent but could not be saved locally first')
      this.opts.log?.info('[Trainer] Session synced to API', run.attempts ? `(after ${run.attempts} retries)` : '')
      const unrankedReason = unrankedReasonFrom(res)
      return this.report({ key: run.key, clientRunId: run.clientRunId, state: 'saved', drill: drillStateFrom(res), ...(unrankedReason ? { unrankedReason } : {}) })
    } catch (err) {
      const retry = isRetryableUploadError(err)
      this.opts.log?.warn('[Trainer] Session upload failed:', (err as Error)?.message, retry ? '(will retry)' : '(not retried)')
      if (!retry) {
        const status = (err as { status?: unknown } | null)?.status
        return this.giveUp(run, 'rejected', typeof status === 'number' ? status : null, String((err as Error)?.message ?? ''), round)
      }
      if (lastTry) return this.giveUp(run, 'expired', null, 'Not uploaded within 7 days', round)
      return this.keep(run, true, round)
    } finally {
      this.inFlight.delete(run.clientRunId)
    }
  }

  /** Retryable failures never count against a run: it waits until it uploads or its last try fails (see attempt). */
  private keep(run: PendingRun, tried: boolean, round?: WriteRound): TrainerSyncOutcome {
    if (tried) run.attempts += 1
    run.nextAt = this.now() + retryDelayMs(Math.max(run.attempts, 1))
    if (!this.pending.some(p => p.clientRunId === run.clientRunId)) this.pending.push(run)
    // In a retry round the run is already on disk and the round writes the file once at its end.
    let stored = true
    if (round) round.pending = true
    else stored = this.write()
    this.scheduleNext()
    return this.report({ key: run.key, clientRunId: run.clientRunId, state: 'pending', drill: null, ...(stored ? {} : { stored: false }) }, run)
  }

  /** Moves a run from the upload queue to the unsaved file (resent only by Retry) and reports it as failed. */
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
    // The cap is per account: the oldest of this account's runs make room, never another account's.
    const rest = this.unsaved.filter(u => u.clientRunId !== run.clientRunId)
    const sameOwner = rest.filter(u => (u.ownerUserId ?? null) === entry.ownerUserId)
    const over = new Set(sameOwner.slice(0, Math.max(0, sameOwner.length + 1 - MAX_UNSAVED_RUNS)))
    this.unsaved = [...rest.filter(u => !over.has(u)), entry]
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

  /** A run the API took: an unsaved copy a crash left behind (see unsavedOf) goes too. */
  private dropUnsaved(clientRunId: string, round?: WriteRound): void {
    const before = this.unsaved.length
    this.unsaved = this.unsaved.filter(u => u.clientRunId !== clientRunId)
    if (this.unsaved.length === before) return
    if (round) round.unsaved = true
    else this.writeUnsaved()
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
        ? raw.filter((r): r is UnsavedRun => !!r && typeof r === 'object' && typeof (r as UnsavedRun).clientRunId === 'string' && typeof (r as UnsavedRun).failedAt === 'number' && !!(r as UnsavedRun).payload)
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
