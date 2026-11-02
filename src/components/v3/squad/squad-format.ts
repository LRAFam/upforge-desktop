/** Pure helpers for the v3 Squad screen (the paid team plan). Not used by Coaches. */

export { initial } from '../../../lib/name-initial'

export interface PresenceLike {
  online?: boolean
  is_recording?: boolean
  game?: string | null
}

export type PresenceTone = 'live' | 'online' | 'offline'

/** Live (recording) beats online beats offline. */
export function presenceTone(p: PresenceLike | null | undefined): PresenceTone {
  if (p?.is_recording) return 'live'
  if (p?.online) return 'online'
  return 'offline'
}

const GAME_NAMES: Record<string, string> = { valorant: 'Valorant', cs2: 'CS2', deadlock: 'Deadlock', lol: 'League' }

export function presenceLabel(p: PresenceLike | null | undefined): string {
  const tone = presenceTone(p)
  const game = p?.game ? GAME_NAMES[p.game] ?? p.game : null
  if (tone === 'live') return game ? `Recording · ${game}` : 'Recording now'
  if (tone === 'online') return game ? `Online · ${game}` : 'Online'
  return 'Offline'
}

/**
 * Win rate (0–100 or 0–1) to a whole percentage, or null.
 * The API sends decimals as strings ("60.00"), so strings are coerced too.
 */
export function pctLabel(v: number | string | null | undefined): string | null {
  if (v == null || v === '') return null
  const n = typeof v === 'number' ? v : Number(v)
  if (!Number.isFinite(n)) return null
  const pct = n <= 1 ? n * 100 : n
  return `${Math.round(pct)}%`
}

/** "2 in Valorant · 1 in CS2" from squad game-mix counts (most played first), or null when nobody is in a game. */
export function gameMixLabel(mix: Record<string, number>): string | null {
  const parts = Object.entries(mix)
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([g, n]) => `${n} in ${GAME_NAMES[g] ?? g}`)
  return parts.length ? parts.join(' · ') : null
}

/** Squad activity shows this many rows before "Show all". */
export const SQUAD_ACTIVITY_PREVIEW = 6

/**
 * "12" — or "20+" when every row in the fetched activity sample is from this week
 * (the API only returns the latest few analyses, so the true count may be higher).
 */
export function weekCountLabel(weekCount: number, sampleSize: number): string {
  return weekCount > 0 && weekCount >= sampleSize ? `${weekCount}+` : String(weekCount)
}
