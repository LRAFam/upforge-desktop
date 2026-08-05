/**
 * Structured prep-step instrumentation for post-game preparation.
 * Emits heartbeats + failure codes so safety nets are diagnosable.
 */

import log from 'electron-log'
import { classifyActivationError, type ActivationErrorCode } from './activation-error-codes'
import { trackFunnelEvent, trackPreparationStarted, trackPreparationCompleted } from './funnel-events'

export type PrepStepName =
  | 'file_ready'
  | 'dashboard_row'
  | 'vod_probe'
  | 'compress'
  | 'enrich'
  | 'upload_dispatch'

export interface PrepHeartbeat {
  recordingId: string | null
  game: string
  step: PrepStepName
  startedAt: number
  lastHeartbeatAt: number
  attempt: number
}

let activePrep: PrepHeartbeat | null = null
let heartbeatTimer: ReturnType<typeof setInterval> | null = null

export function getActivePrepHeartbeat(): PrepHeartbeat | null {
  return activePrep ? { ...activePrep } : null
}

export function beginPreparation(game: string, recordingId: string | null = null): void {
  clearPrepHeartbeatTimer()
  activePrep = {
    recordingId,
    game,
    step: 'file_ready',
    startedAt: Date.now(),
    lastHeartbeatAt: Date.now(),
    attempt: 1,
  }
  trackPreparationStarted(game)
  log.info('[Prep] started', { game, recordingId })
  heartbeatTimer = setInterval(() => {
    if (!activePrep) return
    activePrep.lastHeartbeatAt = Date.now()
    log.info('[Prep] heartbeat', {
      step: activePrep.step,
      elapsedMs: Date.now() - activePrep.startedAt,
      recordingId: activePrep.recordingId,
    })
  }, 10_000)
}

export function setPrepStep(step: PrepStepName, recordingId?: string | null): void {
  if (!activePrep) return
  activePrep.step = step
  activePrep.lastHeartbeatAt = Date.now()
  if (recordingId !== undefined) activePrep.recordingId = recordingId
  log.info('[Prep] step', step, { recordingId: activePrep.recordingId })
}

export function completePreparation(game?: string): void {
  const g = game ?? activePrep?.game ?? 'valorant'
  if (activePrep) {
    log.info('[Prep] completed', {
      stepsElapsedMs: Date.now() - activePrep.startedAt,
      lastStep: activePrep.step,
    })
  }
  clearPrepHeartbeatTimer()
  activePrep = null
  trackPreparationCompleted(g)
}

export function failPreparation(
  rawReason: string,
  extras?: Record<string, unknown>,
): { code: ActivationErrorCode; userMessage: string; technicalMessage: string; step: PrepStepName | null } {
  const classified = classifyActivationError(rawReason)
  const step = activePrep?.step ?? null
  const game = activePrep?.game ?? 'valorant'
  void trackFunnelEvent('preparation_failed', {
    game,
    failure_code: classified.code,
    prep_step: step,
    reason: rawReason.slice(0, 120),
    elapsed_ms: activePrep ? Date.now() - activePrep.startedAt : undefined,
    ...extras,
  })
  log.error('[Prep] failed', {
    code: classified.code,
    step,
    reason: rawReason.slice(0, 200),
  })
  clearPrepHeartbeatTimer()
  activePrep = null
  return {
    code: classified.code,
    userMessage: classified.userMessage,
    technicalMessage: classified.technicalMessage,
    step,
  }
}

function clearPrepHeartbeatTimer(): void {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer)
    heartbeatTimer = null
  }
}
