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

/**
 * Custom lobbies report queueId "" with provisioningFlow "CustomGame" — map them to
 * the `custom` queue so they are labelled CUSTOM rather than unknown/stale.
 */
export function valorantQueueIdWithFlow(
  queueId: string | null | undefined,
  provisioningFlow: string | null | undefined,
): string | null {
  if (!queueId && provisioningFlow?.toLowerCase() === 'customgame') return 'custom'
  return queueId ?? null
}

/**
 * VALORANT.log fallback: only trust an explicit queue id token for a known queue.
 * Menu text mentions "premier"/"competitive" in every session, so bare keywords are not evidence.
 */
export function inferValorantModeFromLog(text: string): string | null {
  const matches = [...text.matchAll(/queue_?id["'\s]*[=:]\s*["']?([a-z0-9_]+)/gi)]
  const last = matches[matches.length - 1]?.[1]?.toLowerCase()
  return last ? QUEUE_ID_MAP[last] ?? null : null
}

/** Range presence can retain the previous queue (including skirmish2v2). */
export function resolveValorantGameMode(
  queueId: string | null | undefined,
  mapId?: string | null,
): string | null {
  if (resolveMapName(mapId)?.trim().toLowerCase() === 'the range') return 'SHOOTING_RANGE'
  return queueId ? normalizeQueueId(queueId) : null
}
