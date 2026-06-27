/**
 * Whether a pending recording can be analysed (VOD integrity + Riot stats + duel moments).
 */
import fs from 'fs'
import { hasRichMatchData, MATCH_DETAILS_ENRICH_MAX_MS } from './match-data-quality'
import { duelMomentsForUpload } from './moment-picker'
import { MIN_RECORDING_FILE_BYTES } from './recording-limits'
import type { PendingRecording } from './recordings-store'

export const COACHING_UNSUPPORTED_MODES = new Set(['DEATHMATCH', 'TEAMDEATHMATCH'])

export type AnalysisReadinessState =
  | 'ready'
  | 'syncing'
  | 'no_deaths'
  | 'unavailable'
  | 'file_missing'
  | 'finalizing'
  | 'mode_unsupported'
  | 'file_unreadable'

export interface AnalysisReadiness {
  ready: boolean
  state: AnalysisReadinessState
  message: string
  duelMomentCount: number
}

type ReadinessRecording = Pick<
  PendingRecording,
  'game' | 'recordedAt' | 'timeline' | 'clipsOnly' | 'matchId' | 'path' | 'cloudArchived' | 'archiveId' | 'gameMode'
>

const vodProbeCache = new Map<string, { mtimeMs: number; ok: boolean; reason?: string }>()

export function clearVodProbeCache(): void {
  vodProbeCache.clear()
}

function resolveGameMode(rec: ReadinessRecording): string {
  return (rec.gameMode ?? rec.timeline?.gameMode ?? '').toUpperCase()
}

function localVodPathRequired(rec: ReadinessRecording): boolean {
  if (rec.clipsOnly) return false
  if (rec.cloudArchived && rec.archiveId) return false
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

export async function refreshVodProbe(
  filePath: string,
  probe: (path: string) => Promise<{ ok: boolean; reason?: string }>,
): Promise<{ ok: boolean; reason?: string }> {
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
    return { ok: cached.ok, reason: cached.reason }
  }

  const result = await probe(filePath)
  vodProbeCache.set(filePath, { mtimeMs, ok: result.ok, reason: result.reason })
  return result
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

  if (rec.game === 'valorant' && COACHING_UNSUPPORTED_MODES.has(resolveGameMode(rec))) {
    return {
      ready: false,
      state: 'mode_unsupported',
      message: 'Duel coaching is not available for Deathmatch or Team Deathmatch',
      duelMomentCount: 0,
    }
  }

  const vodGate = vodFileGates(rec)
  if (vodGate) return vodGate

  const ageMs = Date.now() - rec.recordedAt
  const withinSyncWindow = ageMs < MATCH_DETAILS_ENRICH_MAX_MS

  if (rec.game !== 'valorant') {
    if (hasRichMatchData(rec.timeline)) {
      return { ready: true, state: 'ready', message: '', duelMomentCount: 0 }
    }
    if (withinSyncWindow) {
      return {
        ready: false,
        state: 'syncing',
        message: 'Waiting for match replay data…',
        duelMomentCount: 0,
      }
    }
    return {
      ready: false,
      state: 'unavailable',
      message: 'Match replay data not available for this recording',
      duelMomentCount: 0,
    }
  }

  const timeline = rec.timeline
  const hasMatchId = Boolean(timeline?.matchId ?? rec.matchId)

  if (!hasRichMatchData(timeline)) {
    if (withinSyncWindow && hasMatchId) {
      return {
        ready: false,
        state: 'syncing',
        message: 'Syncing match stats from Riot…',
        duelMomentCount: 0,
      }
    }
    return {
      ready: false,
      state: 'unavailable',
      message: 'Riot match stats are not available for this recording',
      duelMomentCount: 0,
    }
  }

  const duelMomentCount = duelMomentsForUpload(timeline).length
  if (duelMomentCount > 0) {
    return { ready: true, state: 'ready', message: '', duelMomentCount }
  }

  const deaths = timeline?.playerDeaths?.length ?? 0
  const deathsWithOffset = timeline?.playerDeaths?.filter(
    (d) => d.videoOffsetMs != null && d.videoOffsetMs >= 0,
  ).length ?? 0

  if (deaths === 0) {
    return {
      ready: false,
      state: 'no_deaths',
      message: 'No deaths in this match — coaching reviews your death moments, not kills',
      duelMomentCount: 0,
    }
  }

  if (deathsWithOffset === 0 && withinSyncWindow) {
    return {
      ready: false,
      state: 'syncing',
      message: 'Syncing death timestamps for coaching…',
      duelMomentCount: 0,
    }
  }

  return {
    ready: false,
    state: 'unavailable',
    message: 'Could not build reviewable death moments for this match',
    duelMomentCount: 0,
  }
}

export function withAnalysisReadiness<T extends PendingRecording>(rec: T): T & { analysisReadiness: AnalysisReadiness } {
  return { ...rec, analysisReadiness: getAnalysisReadiness(rec) }
}
