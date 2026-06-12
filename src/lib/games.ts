/** Games supported as a desktop "primary game" context (matches website switcher). */
export type PrimaryGame = 'valorant' | 'cs2' | 'deadlock'

export interface PrimaryGameOption {
  id: PrimaryGame
  label: string
  shortLabel: string
  accent: string
  live: boolean
}

export const PRIMARY_GAMES: PrimaryGameOption[] = [
  { id: 'valorant', label: 'Valorant', shortLabel: 'VAL', accent: '#ff4655', live: true },
  { id: 'cs2', label: 'CS2', shortLabel: 'CS2', accent: '#f97316', live: true },
  { id: 'deadlock', label: 'Deadlock', shortLabel: 'DL', accent: '#14b8a6', live: true },
]

export function isPrimaryGame(value: string | null | undefined): value is PrimaryGame {
  return value === 'valorant' || value === 'cs2' || value === 'deadlock'
}

export function normalizePrimaryGame(value: string | null | undefined): PrimaryGame {
  if (isPrimaryGame(value)) return value
  return 'valorant'
}

export function primaryGameLabel(game: PrimaryGame): string {
  return PRIMARY_GAMES.find((g) => g.id === game)?.label ?? 'Valorant'
}

export function primaryGameWebBase(game: PrimaryGame): string {
  return `https://upforge.gg/${game}`
}
