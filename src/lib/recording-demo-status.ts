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

/** CS2 / Deadlock recording without demo attached — optional attach for timeline/clips. */
export function recordingDemoPending(rec: Pick<PendingRecording, 'game' | 'timeline'>): boolean {
  if (!usesAsyncDemoSync(rec.game)) return false
  return !recordingTimelineReady(rec.timeline)
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

/** Short badge for match cards. */
export function recordingDemoBadge(
  rec: Pick<PendingRecording, 'game' | 'timeline'>,
): string | null {
  if (!usesAsyncDemoSync(rec.game)) return null
  if (recordingTimelineReady(rec.timeline)) return 'Demo linked'
  return 'Attach demo'
}

/** Button subtitle when timeline is blocked (Valorant ≠ demo). */
export function timelineBlockedShortLabel(game: string | null | undefined): string {
  return usesAsyncDemoSync(game) ? 'Needs demo' : 'Needs match stats'
}

/** One-line explainer for compact UI (cards, post-game). */
export function demoSyncExplainerShort(game: string | null | undefined): string {
  if (game === 'cs2') return 'Attach a GOTV .dem when ready for kills and highlight clips.'
  if (game === 'deadlock') return 'Attach a replay .dem when ready for stats and highlight clips.'
  return ''
}

/** Longer explainer for side panels and help text. */
export function demoSyncExplainer(game: string | null | undefined): string {
  if (game === 'cs2') {
    return 'Download the GOTV demo in CS2 (Watch → Your Matches), then attach the .dem file for kill timeline and auto-clips.'
  }
  if (game === 'deadlock') {
    return 'Download the replay from Deadlock match history, then attach the .dem file for stats and auto-clips.'
  }
  return ''
}

export function demoPendingSectionTitle(game: string): string {
  return game === 'deadlock' ? 'Attach replay' : 'Attach demo'
}

export function demoPendingSectionHint(game: string): string {
  return demoSyncExplainerShort(game)
}
