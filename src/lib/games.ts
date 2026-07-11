import valorantArtwork from '../assets/games/valorant-card-bg.png'
import cs2Artwork from '../assets/games/cs2-card-bg.png'
import deadlockArtwork from '../assets/games/deadlock-card-bg.png'
import lolArtwork from '../assets/games/lol-card-bg.png'

/** Games supported as a desktop "primary game" context (matches website switcher). */
export type PrimaryGame = 'valorant' | 'cs2' | 'deadlock' | 'lol'

/** Bundled game card background artwork (dashboard cards, login, onboarding). */
export const PRIMARY_GAME_ARTWORK: Record<PrimaryGame, string> = {
  valorant: valorantArtwork,
  cs2: cs2Artwork,
  deadlock: deadlockArtwork,
  lol: lolArtwork,
}

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
  { id: 'lol', label: 'League of Legends', shortLabel: 'LoL', accent: '#c89b3c', live: true },
]

export function isPrimaryGame(value: string | null | undefined): value is PrimaryGame {
  return value === 'valorant' || value === 'cs2' || value === 'deadlock' || value === 'lol'
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

export function analysisResultsUrl(game: PrimaryGame, analysisId: number | string): string {
  return `${primaryGameWebBase(game)}/results/${analysisId}`
}

/** Desktop VOD analyses are stored in analysis_logs — CS2 uses the shared results viewer. */
export function desktopVodResultsUrl(game: PrimaryGame, analysisLogId: number | string): string {
  if (game === 'cs2') {
    return `${primaryGameWebBase('valorant')}/results/${analysisLogId}`
  }
  return analysisResultsUrl(game, analysisLogId)
}

export function recordingGameLabel(game: string | null | undefined): string {
  if (game === 'cs2') return 'CS2'
  if (game === 'deadlock') return 'Deadlock'
  if (game === 'lol') return 'League of Legends'
  return 'Valorant'
}
