/** Normalize Riot presence / match queue ids to UpForge mode constants. */
import { resolveMapName } from './riot-lookup-tables'

const QUEUE_ID_MAP: Record<string, string> = {
  competitive: 'COMPETITIVE',
  unrated: 'CLASSIC',
  deathmatch: 'DEATHMATCH',
  spikerush: 'SPIKERUSH',
  swiftplay: 'SWIFTPLAY',
  snowball: 'SNOWBALL',
  premier: 'PREMIER',
  custom: 'CUSTOM',
  ggteam: 'ESCALATION',
  onefa: 'REPLICATION',
  hurm: 'TEAMDEATHMATCH',
  newmap: 'NEWMAP',
  rangev2: 'SHOOTING_RANGE',
}

export function normalizeQueueId(queueId: string): string {
  return QUEUE_ID_MAP[queueId.toLowerCase()] ?? queueId.toUpperCase()
}

/** Range presence can retain the previous queue (including skirmish2v2). */
export function resolveValorantGameMode(
  queueId: string | null | undefined,
  mapId?: string | null,
): string | null {
  if (resolveMapName(mapId)?.trim().toLowerCase() === 'the range') return 'SHOOTING_RANGE'
  return queueId ? normalizeQueueId(queueId) : null
}
