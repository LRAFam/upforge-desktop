/** Normalize Riot presence / match queue ids to UpForge mode constants. */

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
