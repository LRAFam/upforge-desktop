/** Pure helpers for the v3 Coaches screens (coach rosters: student ↔ coach). Not used by Squad. */

export { initial } from '../../../lib/name-initial'

/** 0–100, safe for missing or zero limits. */
export function limitPct(used: number | null | undefined, limit: number | null | undefined): number {
  if (!limit || limit <= 0 || used == null || used <= 0) return 0
  return Math.min(100, Math.round((used / limit) * 100))
}

/** "W–L" for a match row, or null when the score isn't known. */
export function roundScore(won: number | null | undefined, lost: number | null | undefined): string | null {
  if (won == null || lost == null) return null
  return `${won}–${lost}`
}

/** Result tone from rounds (or the won flag when rounds are missing). */
export function resultTone(row: { won?: boolean | null; rounds_won?: number | null; rounds_lost?: number | null }): 'win' | 'loss' | null {
  if (row.rounds_won != null && row.rounds_lost != null && row.rounds_won !== row.rounds_lost) {
    return row.rounds_won > row.rounds_lost ? 'win' : 'loss'
  }
  if (row.won === true) return 'win'
  if (row.won === false) return 'loss'
  return null
}
