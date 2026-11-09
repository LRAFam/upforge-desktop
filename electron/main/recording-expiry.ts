/**
 * Local-only recording expiry (owner rule: nothing is deleted silently).
 *
 * A local-only recording older than `recordingRetentionDays` may be deleted only
 * after the user was warned (persisted `expiryWarnedAt`) and at least
 * EXPIRY_MIN_NOTICE_MS has passed since. Warnings fire ~3 days and ~1 day before.
 * Recordings still waiting on a CS2/Deadlock demo, with a failed upload/analysis,
 * or mid-pipeline are never auto-deleted.
 */
import { hasRichMatchData } from './match-data-quality'
import type { PendingRecording } from './recordings-store'

const DAY_MS = 24 * 60 * 60 * 1000

export const EXPIRY_FIRST_WARNING_DAYS = 3
export const EXPIRY_FINAL_WARNING_DAYS = 1
/** Minimum time between the first warning and deletion. */
export const EXPIRY_MIN_NOTICE_MS = DAY_MS

export type ExpiryProtection = 'waiting_for_demo' | 'upload_failed' | 'in_progress'
export type ExpiryWarningStage = 'first' | 'final'

export type ExpiryRecording = Pick<
  PendingRecording,
  | 'game'
  | 'timeline'
  | 'recordedAt'
  | 'lastAnalysisError'
  | 'lastFailureCode'
  | 'orphanRecoveryError'
  | 'pipelineStatus'
  | 'pipelineDeferReason'
  | 'manualAnalyseRequested'
  | 'expiryWarnedAt'
  | 'expiryFinalWarnedAt'
>

export type RecordingExpiryPlan =
  | { action: 'none'; deleteAt: number | null }
  | { action: 'protected'; protection: ExpiryProtection }
  | { action: 'warn'; stage: ExpiryWarningStage; deleteAt: number }
  | { action: 'delete'; deleteAt: number }

/** Why this recording must never be auto-deleted, or null. */
export function expiryProtection(rec: ExpiryRecording): ExpiryProtection | null {
  // New rows default to pipelineStatus 'pending' — only an active upload/analysis or a queued one counts.
  if (rec.pipelineStatus === 'uploading' || rec.pipelineStatus === 'analysing') return 'in_progress'
  if (rec.pipelineDeferReason || rec.manualAnalyseRequested) return 'in_progress'
  if (rec.lastAnalysisError || rec.lastFailureCode || rec.orphanRecoveryError) return 'upload_failed'
  // CS2 / Deadlock Analyse stays locked until rich demo stats exist — the match is waiting on its demo.
  if ((rec.game === 'cs2' || rec.game === 'deadlock') && !hasRichMatchData(rec.timeline)) {
    return 'waiting_for_demo'
  }
  return null
}

/** A warning only counts for the current expiry window (e.g. retention was raised since). */
function validWarning(at: number | undefined, expiresAt: number): number | null {
  if (!at) return null
  const windowStart = expiresAt - EXPIRY_FIRST_WARNING_DAYS * DAY_MS - DAY_MS
  return at >= windowStart ? at : null
}

/**
 * Decide what to do with a local-only recording. Callers must already have
 * excluded cloud-backed, clips-only and saved-offline rows.
 */
export function planRecordingExpiry(
  rec: ExpiryRecording,
  retentionDays: number,
  now = Date.now(),
): RecordingExpiryPlan {
  if (retentionDays <= 0) return { action: 'none', deleteAt: null }
  const protection = expiryProtection(rec)
  if (protection) return { action: 'protected', protection }

  const expiresAt = rec.recordedAt + retentionDays * DAY_MS
  const warnedAt = validWarning(rec.expiryWarnedAt, expiresAt)
  const finalWarnedAt = warnedAt ? validWarning(rec.expiryFinalWarnedAt, expiresAt) : null

  const deleteAt = warnedAt
    ? Math.max(expiresAt, warnedAt + EXPIRY_MIN_NOTICE_MS)
    : Math.max(expiresAt, now + EXPIRY_MIN_NOTICE_MS)

  if (warnedAt && now >= deleteAt) return { action: 'delete', deleteAt }

  const msLeft = deleteAt - now
  if (!warnedAt) {
    if (msLeft <= EXPIRY_FIRST_WARNING_DAYS * DAY_MS) return { action: 'warn', stage: 'first', deleteAt }
    return { action: 'none', deleteAt }
  }
  if (!finalWarnedAt && msLeft <= EXPIRY_FINAL_WARNING_DAYS * DAY_MS) {
    return { action: 'warn', stage: 'final', deleteAt }
  }
  return { action: 'none', deleteAt }
}

/** When the UI should say this local recording will be deleted, or null (not expiring soon / protected). */
export function localExpiryDeleteAt(
  rec: ExpiryRecording,
  retentionDays: number,
  now = Date.now(),
): number | null {
  const plan = planRecordingExpiry(rec, retentionDays, now)
  if (plan.action === 'protected' || plan.deleteAt == null) return null
  if (plan.action === 'none' && plan.deleteAt - now > EXPIRY_FIRST_WARNING_DAYS * DAY_MS) return null
  return plan.deleteAt
}

export function daysUntil(at: number, now = Date.now()): number {
  return Math.max(0, Math.ceil((at - now) / DAY_MS))
}

export function expiryNotificationBody(count: number, soonestDeleteAt: number, now = Date.now()): string {
  const days = daysUntil(soonestDeleteAt, now)
  const when = days <= 1 ? 'within a day' : `in ${days} days`
  const what = count === 1 ? 'A local recording' : `${count} local recordings`
  return `${what} will be deleted ${when}. Save to cloud or analyse to keep ${count === 1 ? 'it' : 'them'}, or change auto-delete in Settings → Recording.`
}
