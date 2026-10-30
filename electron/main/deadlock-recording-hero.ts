/**
 * Name the hero on a Deadlock recording after the match.
 *
 * The game itself never tells us the hero, so recordings were saved as "hero_13" or with no hero.
 * After a match, deadlock-api has its metadata; the UpForge API endpoint `GET /api/deadlock/match/{id}`
 * returns the signed-in player's row (`player.hero_id`, `player.hero_name`). Metadata appears a few
 * minutes after the match ends, so callers retry with backoff and give up quietly.
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

/** Retry until deadlock-api has the match, then return the player's hero (or null). */
export async function resolveDeadlockRecordingHero(matchId: number, opts: ResolveOptions): Promise<DeadlockMatchPlayer | null> {
  if (!Number.isSafeInteger(matchId) || matchId <= 0) return null
  const delays = opts.delaysMs ?? [60_000, 180_000, 480_000]
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>(r => setTimeout(r, ms)))
  for (const delay of delays) {
    await sleep(delay)
    try {
      const player = playerFromMatchResponse(await opts.fetchMatch(matchId))
      if (player) return player
    } catch {
      // Metadata not published yet, or the API is unreachable: try again later.
    }
  }
  return null
}

/** The label to store on the recording: a hero name, never a raw "hero_13" key. */
export function recordingHeroLabel(player: DeadlockMatchPlayer | null, fallbackKey: string | null): string | null {
  if (player?.heroName) return player.heroName
  return fallbackKey && !/^hero_\d+$/.test(fallbackKey) ? fallbackKey : null
}
