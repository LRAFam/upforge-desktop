/**
 * Name the hero on a Deadlock recording after the match.
 *
 * The game itself never tells us the hero, so recordings were saved as "hero_13" or with no hero.
 * After a match, deadlock-api has its metadata; the UpForge API endpoint `GET /api/deadlock/match/{id}`
 * returns the signed-in player's row (`player.hero_id`, `player.hero_name`). Metadata appears a few
 * minutes after the match ends, so callers retry with backoff and give up quietly. The same response
 * carries the match's real queue (Ranked, Standard, Street Brawl, bots, private lobby…).
 */

export interface DeadlockMatchPlayer {
  heroId: number | null
  heroName: string | null
  heroIcon: string | null
}

/** Pull the player's hero from the API response; null when the player isn't in the match. */
export function playerFromMatchResponse(res: unknown): DeadlockMatchPlayer | null {
  const player = (res as { player?: Record<string, unknown> | null } | null)?.player
  if (!player || typeof player !== 'object') return null
  const heroId = typeof player.hero_id === 'number' && player.hero_id > 0 ? player.hero_id : null
  const heroName = typeof player.hero_name === 'string' && player.hero_name.trim() ? player.hero_name.trim() : null
  const heroIcon = typeof player.hero_icon === 'string' && /^https:\/\//.test(player.hero_icon) ? player.hero_icon : null
  if (heroId == null && heroName == null) return null
  return { heroId, heroName, heroIcon }
}

export interface ResolveOptions {
  /** GET /api/deadlock/match/{id}; throw or return null when unavailable. */
  fetchMatch: (matchId: number) => Promise<unknown>
  /** Delays between attempts (ms). Default: 1, 3 and 8 minutes after the match. */
  delaysMs?: number[]
  sleep?: (ms: number) => Promise<void>
}

/**
 * Deadlock queue ids stored on a recording once the match metadata is known. The live watcher can't
 * tell the queue (Steam's cache only gives match_id + salts), so recordings start as the COMPETITIVE
 * placeholder and are relabelled here. Keys mirror the API's GameQueue (underscores are ignored there).
 */
export const DEADLOCK_RECORDING_MODES = [
  'RANKED',
  'UNRANKED',
  'STREET_BRAWL',
  'PRIVATE_LOBBY',
  'COOP_BOT',
  'HERO_LABS',
  'TUTORIAL',
  'SERVER_TEST',
  'NEW_PLAYER_PLACEMENT',
] as const
export type DeadlockRecordingMode = typeof DEADLOCK_RECORDING_MODES[number]

/** deadlock-api / protobuf ECitadelMatchMode. 0 (Invalid) and unknown values → null. */
const MATCH_MODE_BY_ID: Record<number, DeadlockRecordingMode> = {
  1: 'UNRANKED', 2: 'PRIVATE_LOBBY', 3: 'COOP_BOT', 4: 'RANKED', 5: 'SERVER_TEST', 6: 'TUTORIAL', 7: 'HERO_LABS',
  8: 'NEW_PLAYER_PLACEMENT',
}
/** ECitadelGameMode 4 = Street Brawl (any match mode). 1 = Normal: the match mode decides. */
const GAME_MODE_STREET_BRAWL = 4

function enumKey(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const key = v.replace(/^k_?ECitadel(Match|Game)Mode_?/i, '').replace(/[\s_-]+/g, '').toUpperCase()
  return key || null
}

function matchModeOf(v: unknown): DeadlockRecordingMode | null {
  if (typeof v === 'number') return MATCH_MODE_BY_ID[v] ?? null
  const key = enumKey(v)
  if (!key) return null
  return DEADLOCK_RECORDING_MODES.find(m => m.replace(/_/g, '') === key) ?? null
}

function isStreetBrawl(v: unknown): boolean {
  if (typeof v === 'number') return v === GAME_MODE_STREET_BRAWL
  return enumKey(v) === 'STREETBRAWL'
}

/** The queue this match was played in, from `metadata.match_info` of GET /api/deadlock/match/{id}. */
export function deadlockModeFromMatchResponse(res: unknown): DeadlockRecordingMode | null {
  const metadata = (res as { metadata?: unknown } | null)?.metadata
  if (!metadata || typeof metadata !== 'object') return null
  const info = (metadata as { match_info?: unknown }).match_info
  const node = (info && typeof info === 'object' ? info : metadata) as { match_mode?: unknown; game_mode?: unknown }
  if (isStreetBrawl(node.game_mode)) return 'STREET_BRAWL'
  return matchModeOf(node.match_mode)
}

export interface DeadlockRecordingMatch {
  player: DeadlockMatchPlayer
  mode: DeadlockRecordingMode | null
}

/** Retry until deadlock-api has the match, then return the player's hero and the match's queue. */
export async function resolveDeadlockRecordingMatch(matchId: number, opts: ResolveOptions): Promise<DeadlockRecordingMatch | null> {
  if (!Number.isSafeInteger(matchId) || matchId <= 0) return null
  const delays = opts.delaysMs ?? [60_000, 180_000, 480_000]
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>(r => setTimeout(r, ms)))
  for (const delay of delays) {
    await sleep(delay)
    try {
      const res = await opts.fetchMatch(matchId)
      const player = playerFromMatchResponse(res)
      if (player) return { player, mode: deadlockModeFromMatchResponse(res) }
    } catch {
      // Metadata not published yet, or the API is unreachable: try again later.
    }
  }
  return null
}

/** Retry until deadlock-api has the match, then return the player's hero (or null). */
export async function resolveDeadlockRecordingHero(matchId: number, opts: ResolveOptions): Promise<DeadlockMatchPlayer | null> {
  return (await resolveDeadlockRecordingMatch(matchId, opts))?.player ?? null
}

/** The label to store on the recording: a hero name, never a raw "hero_13" key. */
export function recordingHeroLabel(player: DeadlockMatchPlayer | null, fallbackKey: string | null): string | null {
  if (player?.heroName) return player.heroName
  return fallbackKey && !/^hero_\d+$/.test(fallbackKey) ? fallbackKey : null
}
