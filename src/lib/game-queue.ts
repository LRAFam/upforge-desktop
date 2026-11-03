/**
 * Ranked vs fun-mode split, shared by the main process (stored on each recording) and the renderer
 * (match rows, Progress). Main modes are the ones people grind rank in; everything else (Wingman,
 * Casual, Deathmatch, Swiftplay, Unrated…) is played differently and must not move Progress,
 * win rate or score baselines.
 *
 * Mode ids are the desktop's upper-case ids (COMPETITIVE, WINGMAN…) or the API's lower-case
 * `game_mode` (competitive, wingman…); both are accepted.
 */

export type QueueType = 'ranked' | 'unranked'

const RANKED: Record<string, ReadonlySet<string>> = {
  valorant: new Set(['COMPETITIVE', 'PREMIER']),
  cs2: new Set(['COMPETITIVE', 'PREMIER']),
  lol: new Set(['RANKED_SOLO', 'RANKED_FLEX']),
}

const UNRANKED: Record<string, ReadonlySet<string>> = {
  valorant: new Set(['CLASSIC', 'UNRATED', 'SWIFTPLAY', 'SPIKERUSH', 'DEATHMATCH', 'TEAMDEATHMATCH', 'SNOWBALL', 'SHOOTING_RANGE', 'RANGEV2', 'CUSTOM', 'NEWMAP', 'ONEFA', 'GGTEAM']),
  cs2: new Set(['WINGMAN', 'CASUAL', 'DEATHMATCH', 'ARMS_RACE', 'GUNGAME', 'DEMOLITION', 'RETAKES', 'CUSTOM', 'TRAINING', 'SKIRMISH']),
  lol: new Set(['ARAM', 'ARENA', 'CUSTOM', 'NORMAL_DRAFT', 'NORMAL_BLIND', 'SWIFTPLAY']),
}

function modeKey(mode: string | null | undefined): string | null {
  const key = mode?.trim().toUpperCase().replace(/[\s-]+/g, '_')
  return key && key !== 'UNKNOWN' && key !== 'NULL' ? key : null
}

/**
 * 'ranked' / 'unranked' when the mode says so; null when we cannot tell (no mode, League's CLASSIC
 * which covers ranked and normals, Deadlock). Callers treat null as "count it" so nothing silently
 * disappears from Progress.
 */
export function queueTypeFor(game: string | null | undefined, mode: string | null | undefined): QueueType | null {
  const key = modeKey(mode)
  const g = (game ?? '').toLowerCase()
  if (!key) return null
  if (RANKED[g]?.has(key)) return 'ranked'
  if (UNRANKED[g]?.has(key)) return 'unranked'
  return null
}

/** Main-mode stats (Progress, win rate, UpForge score baselines, focus checks) skip unranked modes. */
export function countsTowardProgress(game: string | null | undefined, mode: string | null | undefined): boolean {
  return queueTypeFor(game, mode) !== 'unranked'
}

const MODE_NAMES: Record<string, string> = {
  COMPETITIVE: 'Competitive',
  PREMIER: 'Premier',
  WINGMAN: 'Wingman',
  CASUAL: 'Casual',
  DEATHMATCH: 'Deathmatch',
  TEAMDEATHMATCH: 'Team Deathmatch',
  ARMS_RACE: 'Arms Race',
  GUNGAME: 'Arms Race',
  DEMOLITION: 'Demolition',
  RETAKES: 'Retakes',
  CUSTOM: 'Custom',
  TRAINING: 'Training',
  SKIRMISH: 'War Games',
  CLASSIC: 'Unrated',
  UNRATED: 'Unrated',
  SWIFTPLAY: 'Swiftplay',
  SPIKERUSH: 'Spike Rush',
  SNOWBALL: 'Snowball Fight',
  SHOOTING_RANGE: 'The Range',
  RANGEV2: 'The Range',
}

/**
 * Row / header label for CS2 and Valorant: "Premier · Ranked", "Deathmatch · Unranked",
 * "Wingman · 2v2". Empty when the mode is unknown or the game is not CS2 / Valorant.
 */
export function modeQueueLabel(game: string | null | undefined, mode: string | null | undefined): string {
  const key = modeKey(mode)
  const g = (game ?? '').toLowerCase()
  // League / Deadlock modes keep their existing labels (formatGameMode); only these two split queues here.
  if (!key || (g !== 'cs2' && g !== 'valorant')) return ''
  const name = MODE_NAMES[key] ?? key.toLowerCase().split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
  const queue = queueTypeFor(game, key)
  if (queue === 'ranked') return `${name} · Ranked`
  if (queue === 'unranked') {
    if (key === 'CLASSIC' || key === 'UNRATED') return name
    // CS2 Wingman has its own in-game rank, so "Unranked" would be untrue; it is still kept out of Progress.
    if (key === 'WINGMAN') return `${name} · 2v2`
    return `${name} · Unranked`
  }
  return name
}
