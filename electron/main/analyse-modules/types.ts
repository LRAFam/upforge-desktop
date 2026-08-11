import type { PendingRecording } from '../recordings-store'

export type AnalyseReadyState =
  | 'ready'
  | 'syncing'
  | 'waiting_match_data'
  | 'no_deaths'
  | 'unavailable'
  | 'file_missing'
  | 'finalizing'
  | 'mode_unsupported'
  | 'file_unreadable'

export interface AnalyseReadiness {
  ready: boolean
  state: AnalyseReadyState
  message: string
  duelMomentCount: number
  missing?: string[]
}

export type ReadinessRecording = Pick<
  PendingRecording,
  'game' | 'recordedAt' | 'timeline' | 'clipsOnly' | 'matchId' | 'path' | 'cloudArchived' | 'archiveId' | 'gameMode'
>

export interface GameAnalyseModule {
  id: 'valorant' | 'lol' | 'cs2' | 'deadlock'
  isReady(rec: ReadinessRecording): AnalyseReadiness
}

export function recordingAgeMs(rec: ReadinessRecording): number {
  return Date.now() - rec.recordedAt
}

export function resolveGameMode(rec: ReadinessRecording): string {
  return (rec.gameMode ?? rec.timeline?.gameMode ?? '').toUpperCase()
}
