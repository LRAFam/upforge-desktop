import { cs2MapDisplayName, getCs2RadarUrl, normalizeCs2MapKey } from './cs2-maps'
import { gameBrand } from './game-branding'
import type { PrimaryGame } from './games'
import {
  formatMapLabel,
  getAgentColor,
  getAgentImage,
  getAgentRole,
  getMapListViewImage,
  getMapMinimap,
  getRoleColor,
} from './valorant'

export type RosterMatchVisual = {
  map?: string | null
  agent?: string | null
  game_type?: string | null
  overall_score?: number | null
  created_at?: string | null
  won?: boolean | null
  kills?: number | null
  deaths?: number | null
  assists?: number | null
  rounds_won?: number | null
  rounds_lost?: number | null
  hs_pct?: number | null
  combat_score?: number | null
}

export function rosterMatchGame(row: RosterMatchVisual): PrimaryGame {
  if (row.game_type === 'cs2' || row.game_type === 'deadlock' || row.game_type === 'lol') {
    return row.game_type
  }
  if (normalizeCs2MapKey(row.map)) return 'cs2'
  return 'valorant'
}

export function rosterMapLabel(row: RosterMatchVisual): string {
  if (!row.map) return 'Unknown map'
  if (rosterMatchGame(row) === 'cs2') return cs2MapDisplayName(row.map) || row.map
  return formatMapLabel(row.map) || row.map
}

export function rosterAgentImage(row: RosterMatchVisual): string {
  if (rosterMatchGame(row) !== 'valorant' || !row.agent) return ''
  return getAgentImage(row.agent) || ''
}

export function rosterMapUnderlay(row: RosterMatchVisual): string {
  if (!row.map) return ''
  if (rosterMatchGame(row) === 'cs2') return getCs2RadarUrl(row.map) || ''
  return getMapMinimap(row.map) || getMapListViewImage(row.map) || ''
}

export function rosterAgentAccent(row: RosterMatchVisual): string {
  if (!row.agent || rosterMatchGame(row) !== 'valorant') return ''
  return getAgentColor(row.agent)
}

export function rosterRoleMeta(row: RosterMatchVisual): { label: string; color: string } | null {
  if (rosterMatchGame(row) !== 'valorant' || !row.agent) return null
  const label = getAgentRole(row.agent)
  return { label, color: getRoleColor(label) }
}

export function rosterForgeScore(score: number | null | undefined): number | null {
  if (score == null) return null
  // API may return 0–100 (raw) or 0–1000 (normalized * 10).
  return score > 100 ? Math.round(score) : Math.round(score * 10)
}

/** Normalize API overall_score to 0–100 for grade helpers. */
export function rosterScoreOutOf100(score: number | null | undefined): number | null {
  if (score == null) return null
  return score > 100 ? score / 10 : score
}

export function rosterScoreTone(score: number): string {
  const outOf100 = rosterScoreOutOf100(score) ?? 0
  if (outOf100 >= 78) return 'text-green-400'
  if (outOf100 >= 50) return 'text-yellow-400'
  return 'text-red-400'
}

export function rosterKdaLine(row: RosterMatchVisual): string | null {
  if (row.kills == null) return null
  return `${row.kills}/${row.deaths ?? '-'}/${row.assists ?? '-'}`
}

export function rosterFormatDate(d: string | null | undefined): string {
  if (!d) return ''
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

export function rosterBrand(row: RosterMatchVisual) {
  return gameBrand(rosterMatchGame(row))
}
