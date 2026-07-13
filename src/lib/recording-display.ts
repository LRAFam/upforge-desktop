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

/** Player / agent line for match cards — CS2 & Deadlock don't use Valorant agents. */
export function recordingPlayerLabel(rec: Pick<PendingRecording, 'game' | 'agent' | 'timeline'>): string {
  if (rec.game === 'cs2') {
    const name = rec.timeline?.playerName?.trim()
    if (name) return name
    return 'CS2 match'
  }
  if (rec.game === 'deadlock') {
    return rec.agent?.trim() || 'Deadlock match'
  }
  return rec.agent?.trim() || 'Unknown agent'
}

export function recordingPlayerImage(rec: Pick<PendingRecording, 'game' | 'agent'>): string {
  if (rec.game === 'valorant' && rec.agent) return getAgentImage(rec.agent) ?? ''
  if (rec.game === 'lol' && rec.agent) return getChampionImage(rec.agent) ?? ''
  return ''
}

export function recordingPlayerAccent(rec: Pick<PendingRecording, 'game' | 'agent'>): string | undefined {
  if (rec.game === 'valorant' && rec.agent) return getAgentColor(rec.agent)
  if (rec.game === 'cs2') return '#3b82f6'
  if (rec.game === 'deadlock') return '#eab308'
  if (rec.game === 'lol') return '#c89b3c'
  return undefined
}

export function recordingGameTitle(rec: Pick<PendingRecording, 'game'>): string {
  return recordingGameLabel(rec.game)
}
