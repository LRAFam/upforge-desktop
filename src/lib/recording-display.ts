import type { PendingRecording } from '../env.d.ts'
import { cs2MapDisplayName, getCs2RadarUrl, isCs2Map } from './cs2-maps'
import { getAgentColor, getAgentImage, getMapImage, formatMapLabel } from './valorant'
import { getChampionImage, getMapImage as getLolMapImage, resolveLolMapLabel } from './lol'
import { recordingGameLabel } from './games'

export function recordingMapLabel(rec: Pick<PendingRecording, 'game' | 'map'>): string {
  if (rec.game === 'cs2') return cs2MapDisplayName(rec.map) || formatMapLabel(rec.map) || 'Unknown map'
  if (rec.game === 'lol') return resolveLolMapLabel(rec.map)
  return formatMapLabel(rec.map) || 'Unknown map'
}

export function recordingMapImage(rec: Pick<PendingRecording, 'game' | 'map'>): string {
  if (rec.game === 'cs2' && isCs2Map(rec.map)) return getCs2RadarUrl(rec.map)
  if (rec.game === 'lol') return getLolMapImage()
  return getMapImage(rec.map) ?? ''
}

/** Agent/champion from card fields or late-enriched timeline (MatchDetails often fills timeline first). */
export function resolveRecordingAgent(
  rec: Pick<PendingRecording, 'game' | 'agent' | 'timeline'>,
): string | null {
  const top = rec.agent?.trim()
  if (top) return top
  const fromTimeline = rec.timeline?.agent?.trim()
  if (fromTimeline) return fromTimeline
  const fromStats = rec.timeline?.finalStats?.agent?.trim()
  if (fromStats) return fromStats
  const puuid = rec.timeline?.puuid?.toLowerCase()
  if (puuid && rec.timeline?.teamSnapshot?.length) {
    const row = rec.timeline.teamSnapshot.find((p) => (p.puuid ?? '').toLowerCase() === puuid)
    const fromSnap = row?.agent?.trim()
    if (fromSnap) return fromSnap
  }
  return null
}

/** Player / agent line for match cards — CS2 & Deadlock don't use Valorant agents. */
export function recordingPlayerLabel(rec: Pick<PendingRecording, 'game' | 'agent' | 'timeline'>): string {
  if (rec.game === 'cs2') {
    const name = rec.timeline?.playerName?.trim()
    if (name) return name
    return 'CS2 match'
  }
  if (rec.game === 'deadlock') {
    return resolveRecordingAgent(rec) || 'Deadlock match'
  }
  if (rec.game === 'lol') {
    return resolveRecordingAgent(rec) || 'Unknown champion'
  }
  return resolveRecordingAgent(rec) || 'Unknown agent'
}

export function recordingPlayerImage(rec: Pick<PendingRecording, 'game' | 'agent' | 'timeline'>): string {
  const agent = resolveRecordingAgent(rec)
  if (rec.game === 'valorant' && agent) return getAgentImage(agent) ?? ''
  if (rec.game === 'lol' && agent) return getChampionImage(agent) ?? ''
  return ''
}

export function recordingPlayerAccent(rec: Pick<PendingRecording, 'game' | 'agent' | 'timeline'>): string | undefined {
  const agent = resolveRecordingAgent(rec)
  if (rec.game === 'valorant' && agent) return getAgentColor(agent)
  if (rec.game === 'cs2') return '#3b82f6'
  if (rec.game === 'deadlock') return '#eab308'
  if (rec.game === 'lol') return '#c89b3c'
  return undefined
}

export function recordingGameTitle(rec: Pick<PendingRecording, 'game'>): string {
  return recordingGameLabel(rec.game)
}
