/**
 * Whether a pending recording can be analysed (VOD integrity + match stats + duel moments).
 * CS2 / Deadlock require rich Valve demo/replay stats before Analyse unlocks.
 */
import fs from 'fs'
import { getAnalyseModule } from './analyse-modules/registry'
import type { AnalyseReadiness, AnalyseReadyState } from './analyse-modules/types'
import { resolveGameMode } from './analyse-modules/types'
import { COACHING_UNSUPPORTED_MODES } from './analyse-modules/valorant'
import { MIN_RECORDING_FILE_BYTES } from './recording-limits'
import type { PendingRecording } from './recordings-store'
import { withTimeout } from './promise-timeout'

export { COACHING_UNSUPPORTED_MODES }

/** Max wait for OBS mux / ffprobe before post-game upload proceeds. */
export const VOD_FILE_READY_MAX_MS = 60_000

export type VodFileReadiness = 'ready' | 'finalizing' | 'missing' | 'unreadable' | 'not_required'

export type AnalysisReadinessState = AnalyseReadyState
export type AnalysisReadiness = AnalyseReadiness

type ReadinessRecording = Pick<
  PendingRecording,
  'game' | 'recordedAt' | 'timeline' | 'clipsOnly' | 'matchId' | 'path' | 'cloudArchived' | 'archiveId' | 'gameMode'
>

type VodProbeResult = { ok: boolean; reason?: string; durationMs?: number | null }
const vodProbeCache = new Map<string, VodProbeResult & { mtimeMs: number }>()
const vodProbesInFlight = new Map<string, { mtimeMs: number; promise: Promise<VodProbeResult> }>()

export function clearVodProbeCache(): void {
  vodProbeCache.clear()
}

function coachingModeUnsupportedGate(rec: ReadinessRecording): AnalysisReadiness | null {
  if (rec.game !== 'valorant') return null
  if (!COACHING_UNSUPPORTED_MODES.has(resolveGameMode(rec))) return null
  return getAnalyseModule('valorant').isReady(rec)
}

function localVodPathRequired(rec: ReadinessRecording): boolean {
  if (rec.clipsOnly) return false
  if (rec.cloudArchived && rec.archiveId && (!rec.path || !fs.existsSync(rec.path))) return false
  return Boolean(rec.path)
}

function vodFileGates(rec: ReadinessRecording): AnalysisReadiness | null {
  if (!localVodPathRequired(rec)) return null

  const filePath = rec.path
  if (!fs.existsSync(filePath)) {
    return {
      ready: false,
      state: 'file_missing',
      message: 'Recording file missing on disk — save to cloud first or re-download',
      duelMomentCount: 0,
    }
  }

  try {
    const stat = fs.statSync(filePath)
    if (stat.size < MIN_RECORDING_FILE_BYTES) {
      return {
        ready: false,
        state: 'unavailable',
        message: 'Recording too short for coaching (under 2 minutes)',
        duelMomentCount: 0,
      }
    }

    const cached = vodProbeCache.get(filePath)
    if (!cached || cached.mtimeMs !== stat.mtimeMs) {
      return {
        ready: false,
        state: 'finalizing',
        message: 'Finalizing recording…',
        duelMomentCount: 0,
      }
    }

    if (!cached.ok) {
      return {
        ready: false,
        state: 'file_unreadable',
        message: cached.reason ?? 'Recording file is incomplete or unreadable',
        duelMomentCount: 0,
      }
    }
    if (rec.game === 'valorant' && rec.timeline) {
      const start = rec.timeline.recordingStartTime
      const end = rec.timeline.endTime
      const duration = cached.durationMs
      const timingMissing = !Number.isFinite(start) || end == null || !Number.isFinite(end)
        || end <= start || duration == null || !Number.isFinite(duration) || duration <= 0
      // Allow normal mux/stop latency, but never accept minutes of unexplained
      // footage: it would send unrelated windows to paid video analysis.
      const mismatch = !timingMissing && Math.abs(duration! - (end! - start)) > Math.max(30_000, duration! * 0.02)
      if (timingMissing || mismatch) {
        return {
          ready: false,
          state: 'file_unreadable',
          message: timingMissing
            ? 'Recording timing could not be verified. Analysis is paused.'
            : 'Recording duration does not match its timestamps. Repair video timing before analysis.',
          duelMomentCount: 0,
        }
      }
    }
  } catch {
    return {
      ready: false,
      state: 'file_unreadable',
      message: 'Could not read the recording file',
      duelMomentCount: 0,
    }
  }

  return null
}

export function getVodFileReadiness(rec: ReadinessRecording): VodFileReadiness {
  if (!localVodPathRequired(rec)) return 'not_required'

  const gate = vodFileGates(rec)
  if (!gate) return 'ready'
  if (gate.state === 'finalizing') return 'finalizing'
  if (gate.state === 'file_missing') return 'missing'
  return 'unreadable'
}

export async function waitUntilVodFileReady(
  getRecording: (id: string) => ReadinessRecording | undefined,
  recordingId: string,
  refreshProbe: (rec: ReadinessRecording) => Promise<void>,
  opts?: {
    maxWaitMs?: number
    onReadiness?: (readiness: AnalysisReadiness) => void
    pollMs?: number
  },
): Promise<{ ok: boolean; readiness: AnalysisReadiness }> {
  const maxWaitMs = opts?.maxWaitMs ?? VOD_FILE_READY_MAX_MS
  const pollMs = opts?.pollMs ?? 1500
  const startedAt = Date.now()

  while (Date.now() - startedAt < maxWaitMs) {
    const rec = getRecording(recordingId)
    if (!rec) {
      return {
        ok: false,
        readiness: {
          ready: false,
          state: 'unavailable',
          message: 'Recording not found',
          duelMomentCount: 0,
        },
      }
    }

    await refreshProbe(rec)
    const current = getRecording(recordingId) ?? rec
    const readiness = getAnalysisReadiness(current)
    opts?.onReadiness?.(readiness)

    const vodState = getVodFileReadiness(current)
    if (vodState === 'not_required' || vodState === 'ready') {
      return { ok: true, readiness }
    }
    if (vodState === 'missing' || vodState === 'unreadable') {
      return { ok: false, readiness }
    }

    await new Promise((resolve) => setTimeout(resolve, pollMs))
  }

  const rec = getRecording(recordingId)
  if (!rec) {
    return {
      ok: false,
      readiness: {
        ready: false,
        state: 'unavailable',
        message: 'Recording not found',
        duelMomentCount: 0,
      },
    }
  }

  const readiness = getAnalysisReadiness(rec)
  const vodState = getVodFileReadiness(rec)
  return {
    ok: vodState === 'not_required' || vodState === 'ready',
    readiness,
  }
}

export async function refreshVodProbe(
  filePath: string,
  probe: (path: string) => Promise<VodProbeResult>,
): Promise<VodProbeResult> {
  if (!filePath || !fs.existsSync(filePath)) {
    return { ok: false, reason: 'Recording file missing on disk' }
  }

  let mtimeMs: number
  try {
    mtimeMs = fs.statSync(filePath).mtimeMs
  } catch {
    return { ok: false, reason: 'Could not read the recording file' }
  }

  const cached = vodProbeCache.get(filePath)
  if (cached && cached.mtimeMs === mtimeMs) {
    return { ok: cached.ok, reason: cached.reason, durationMs: cached.durationMs }
  }

  const inFlight = vodProbesInFlight.get(filePath)
  if (inFlight?.mtimeMs === mtimeMs) return inFlight.promise
  const promise = withTimeout(probe(filePath), 45_000, 'Recording check timed out — retry when the disk is available')
    .catch((err: unknown) => ({ ok: false, reason: err instanceof Error ? err.message : String(err) }))
    .then((result) => {
      // Do not cache an older probe over a newer file revision.
      if (vodProbesInFlight.get(filePath)?.promise === promise) {
        vodProbeCache.set(filePath, { mtimeMs, ...result })
        vodProbesInFlight.delete(filePath)
      }
      return result
    })
  vodProbesInFlight.set(filePath, { mtimeMs, promise })
  return promise
}

export function isTerminalAnalysisReadinessState(state: AnalysisReadinessState): boolean {
  return state === 'ready'
    || state === 'no_deaths'
    || state === 'unavailable'
    || state === 'file_missing'
    || state === 'mode_unsupported'
    || state === 'file_unreadable'
}

export function getAnalysisReadiness(rec: ReadinessRecording): AnalysisReadiness {
  if (rec.clipsOnly) {
    return {
      ready: false,
      state: 'unavailable',
      message: 'Clips-only session — no full VOD to analyse',
      duelMomentCount: 0,
    }
  }

  const modeGate = coachingModeUnsupportedGate(rec)
  if (modeGate) return modeGate

  const vodGate = vodFileGates(rec)
  if (vodGate) return vodGate

  return getAnalyseModule(rec.game).isReady(rec)
}

export function withAnalysisReadiness<T extends PendingRecording>(rec: T): T & { analysisReadiness: AnalysisReadiness } {
  return { ...rec, analysisReadiness: getAnalysisReadiness(rec) }
}
