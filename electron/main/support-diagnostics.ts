export type SupportMatchDetailsStatus =
  | 'fetched'
  | 'no_match_id'
  | 'no_region'
  | 'no_auth'
  | 'fetch_failed'
  | 'pending'

export type SupportLolEnrichStatus =
  | 'fetched'
  | 'fetch_failed'
  | 'no_match_id'
  | 'no_auth'

export interface SupportLastMatchSnapshot {
  game: string
  timestamp: number
  matchId: string | null
  map: string | null
  agent: string | null
  gameMode: string
  endReason: string | null
  matchDetailsStatus: SupportMatchDetailsStatus
  lolEnrichStatus?: SupportLolEnrichStatus | null
  queueId?: string | null
  killsInTimeline: number
  clipsExtracted: number
  recordingDuration: number
  fileSizeMb: number
}

export interface SupportLolProbeSnapshot {
  lockfileFound: boolean
  phase: string | null
  queueId: number | null
  queueLabel: string | null
  gameMode: string | null
  error: string | null
  liveClientReachable: boolean
  liveClientInMatch: boolean
  liveClientGameMode: string | null
  lolPlatform: string | null
  hasLolPuuid: boolean
  dedicatedLolAccount: boolean
}

export interface SupportDemoSnapshot {
  game: 'cs2' | 'deadlock'
  demoPresent: boolean
  demoBasename: string | null
  syncStatus: string
}

function fmt(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined) return 'null'
  return String(value)
}

export function formatLastMatchSection(snap: SupportLastMatchSnapshot | null): string[] {
  const lines = ['=== LAST MATCH ===']
  if (!snap) {
    lines.push('No match finalized this session.')
    return lines
  }
  lines.push(`Game: ${snap.game}`)
  lines.push(`At: ${new Date(snap.timestamp).toISOString()}`)
  lines.push(`Match ID: ${fmt(snap.matchId)}`)
  lines.push(`Map: ${fmt(snap.map)}`)
  lines.push(`Agent: ${fmt(snap.agent)}`)
  lines.push(`Mode: ${snap.gameMode}`)
  lines.push(`End reason: ${fmt(snap.endReason)}`)
  lines.push(`Details status: ${snap.matchDetailsStatus}`)
  if (snap.lolEnrichStatus != null) {
    lines.push(`lolEnrichStatus: ${snap.lolEnrichStatus}`)
  }
  if (snap.queueId !== undefined) {
    lines.push(`queueId: ${fmt(snap.queueId)}`)
  }
  lines.push(`Kills: ${snap.killsInTimeline}`)
  lines.push(`Clips: ${snap.clipsExtracted}`)
  lines.push(`File: ${snap.recordingDuration}s / ${snap.fileSizeMb.toFixed(2)} MB`)
  return lines
}

export function formatLeagueSection(probe: SupportLolProbeSnapshot): string[] {
  return [
    '=== LEAGUE ===',
    `LCU lockfile: ${probe.lockfileFound}`,
    `LCU phase: ${fmt(probe.phase)}`,
    `LCU queueId: ${fmt(probe.queueId)}`,
    `LCU queueLabel: ${fmt(probe.queueLabel)}`,
    `LCU gameMode: ${fmt(probe.gameMode)}`,
    `LCU error: ${fmt(probe.error)}`,
    `Live Client reachable: ${probe.liveClientReachable}`,
    `Live Client inMatch: ${probe.liveClientInMatch}`,
    `Live Client gameMode: ${fmt(probe.liveClientGameMode)}`,
    `lol_platform: ${fmt(probe.lolPlatform)}`,
    `hasLolPuuid: ${probe.hasLolPuuid}`,
    `dedicatedLolAccount: ${probe.dedicatedLolAccount}`,
  ]
}

export function formatDemoSection(snap: SupportDemoSnapshot | null): string[] {
  if (!snap) return []
  return [
    '=== CS2 / DEADLOCK ===',
    `Game: ${snap.game}`,
    `Demo present: ${snap.demoPresent}`,
    `Demo file: ${fmt(snap.demoBasename)}`,
    `Sync status: ${snap.syncStatus}`,
  ]
}
