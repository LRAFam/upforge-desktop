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

/** Win rate (0–100 or 0–1) to a whole percentage, or null. */
export function pctLabel(v: number | null | undefined): string | null {
  if (v == null || !Number.isFinite(v)) return null
  const pct = v <= 1 ? v * 100 : v
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
