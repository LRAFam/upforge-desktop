import type { PendingRecording } from '../env.d.ts'

type TimelineLike = {
  killEvents?: unknown[]
  playerKills?: unknown[]
  playerDeaths?: unknown[]
  kills?: unknown[]
  deaths?: unknown[]
  finalStats?: { kills?: number; deaths?: number; assists?: number } | null
} | null | undefined

/** Demo / replay timeline has kill or stat data linked. */
export function recordingTimelineReady(timeline: TimelineLike | null | undefined): boolean {
  if (!timeline) return false
  if (
    (timeline.killEvents?.length ?? 0) > 0
    || (timeline.playerKills?.length ?? 0) > 0
    || (timeline.kills?.length ?? 0) > 0
    || (timeline.playerDeaths?.length ?? 0) > 0
    || (timeline.deaths?.length ?? 0) > 0
  ) {
    return true
  }
  const fs = timeline.finalStats
  if (!fs) return false
  return ((fs.kills ?? 0) + (fs.deaths ?? 0) + (fs.assists ?? 0)) > 0
}

export function usesAsyncDemoSync(game: string | null | undefined): boolean {
  return game === 'cs2' || game === 'deadlock'
}

/** CS2 / Deadlock recording still waiting on demo file. */
export function recordingDemoPending(rec: Pick<PendingRecording, 'game' | 'timeline' | 'analysisReadiness'>): boolean {
  if (!usesAsyncDemoSync(rec.game)) return false
  if (recordingTimelineReady(rec.timeline)) return false
  const state = rec.analysisReadiness?.state
  return state === 'syncing' || state === 'finalizing'
}

export function canWatchRawRecording(
  rec: Pick<PendingRecording, 'hasLocalFile' | 'path' | 'cloudUploaded' | 'archiveId' | 'clipsOnly'>,
): boolean {
  if (rec.clipsOnly) return false
  return Boolean(rec.hasLocalFile || rec.path || rec.cloudUploaded || rec.archiveId)
}

/** Full kill timeline — requires demo for CS2/Deadlock. */
export function canOpenTimeline(
  rec: Pick<
    PendingRecording,
    'game' | 'timeline' | 'analysisId' | 'hasLocalFile' | 'path' | 'cloudUploaded' | 'archiveId' | 'clipsOnly'
  >,
): boolean {
  if (!canWatchRawRecording(rec)) return false
  if (usesAsyncDemoSync(rec.game)) return recordingTimelineReady(rec.timeline)
  return Boolean(
    recordingTimelineReady(rec.timeline)
    || rec.analysisId
    || (rec.timeline?.playerDeaths?.length ?? 0) > 0
    || (rec.timeline?.playerKills?.length ?? 0) > 0,
  )
}

/** Short badge for match cards — e.g. "Demo pending · 8m". */
export function recordingDemoBadge(
  rec: Pick<PendingRecording, 'game' | 'timeline' | 'analysisReadiness' | 'recordedAt'>,
): string | null {
  if (!recordingDemoPending(rec)) {
    if (usesAsyncDemoSync(rec.game) && recordingTimelineReady(rec.timeline)) {
      return 'Demo linked'
    }
    return null
  }
  const elapsedMin = Math.max(0, Math.floor((Date.now() - rec.recordedAt) / 60_000))
  return elapsedMin > 0 ? `Demo pending · ${elapsedMin}m` : 'Demo pending'
}

export function demoPendingElapsedLabel(recordedAt: number): string {
  const elapsedMin = Math.max(0, Math.floor((Date.now() - recordedAt) / 60_000))
  if (elapsedMin < 1) return 'just now'
  if (elapsedMin === 1) return '1 minute'
  return `${elapsedMin} minutes`
}

/** One-line explainer for compact UI (cards, post-game). */
export function demoSyncExplainerShort(game: string | null | undefined): string {
  if (game === 'cs2') return 'Demos come from Steam — UpForge watches for them but cannot speed them up.'
  if (game === 'deadlock') return 'Replay data syncs from the game client — timing is outside UpForge.'
  return ''
}

/** Longer explainer for side panels and help text. */
export function demoSyncExplainer(game: string | null | undefined): string {
  if (game === 'cs2') {
    return 'GOTV demo files are written by Steam/Valve after each match. UpForge scans your demo folder in the background — we cannot create or rush them.'
  }
  if (game === 'deadlock') {
    return 'Deadlock replay data syncs from the game client. UpForge polls for it — timing is outside our control.'
  }
  return ''
}

export function demoPendingSectionTitle(game: string): string {
  return game === 'deadlock' ? 'Waiting on replay' : 'Waiting on demo'
}

export function demoPendingSectionHint(game: string): string {
  return demoSyncExplainerShort(game)
}
