/**
 * Title-bar account switcher (v3): the current game's linked accounts as rows.
 * Valorant and League can have several accounts (one main); CS2 and Deadlock have one identity each.
 * Pure and tested; the component only fetches and calls the existing endpoints.
 */
import type { PrimaryGame } from '../../../lib/games'

export interface SwitcherRow {
  id: number | null
  label: string
  sub: string | null
  isMain: boolean
  /** Only Valorant/League alts can be made main from here. */
  canMakeMain: boolean
}

export interface SwitcherInput {
  valorant?: Array<{ id: number; riot_name: string; riot_tag: string; riot_region?: string | null; is_active: boolean }> | null
  lol?: Array<{ id: number; riot_name: string; riot_tag: string; platform: string; is_main: boolean }> | null
  cs2?: { steamName?: string | null; faceitNickname?: string | null } | null
  deadlock?: { linked: boolean; name?: string | null } | null
}

export interface SwitcherView {
  rows: SwitcherRow[]
  /** True when the game supports several linked accounts (switching is possible). */
  multi: boolean
  empty: string
}

const riotId = (name: string, tag: string) => `${name}#${tag}`

export function switcherView(game: PrimaryGame, input: SwitcherInput): SwitcherView {
  if (game === 'valorant') {
    const rows = (input.valorant ?? []).map(a => ({
      id: a.id,
      label: riotId(a.riot_name, a.riot_tag),
      sub: a.riot_region ? `Region ${a.riot_region.toUpperCase()}` : null,
      isMain: a.is_active,
      canMakeMain: !a.is_active,
    }))
    return { rows: mainFirst(rows), multi: true, empty: 'No Valorant account linked yet.' }
  }
  if (game === 'lol') {
    const rows = (input.lol ?? []).map(a => ({
      id: a.id,
      label: riotId(a.riot_name, a.riot_tag),
      sub: `Server ${a.platform}`,
      isMain: a.is_main,
      canMakeMain: !a.is_main,
    }))
    return { rows: mainFirst(rows), multi: true, empty: 'No League account linked yet.' }
  }
  if (game === 'cs2') {
    const rows: SwitcherRow[] = []
    const steam = input.cs2?.steamName?.trim()
    const faceit = input.cs2?.faceitNickname?.trim()
    if (steam) rows.push({ id: null, label: steam, sub: 'Steam name', isMain: true, canMakeMain: false })
    if (faceit) rows.push({ id: null, label: faceit, sub: 'FACEIT', isMain: false, canMakeMain: false })
    return { rows, multi: false, empty: 'No CS2 account linked yet.' }
  }
  const dl = input.deadlock
  return {
    rows: dl?.linked ? [{ id: null, label: dl.name?.trim() || 'Steam account', sub: 'Steam', isMain: true, canMakeMain: false }] : [],
    multi: false,
    empty: 'No Deadlock account linked yet.',
  }
}

function mainFirst(rows: SwitcherRow[]): SwitcherRow[] {
  return [...rows].sort((a, b) => Number(b.isMain) - Number(a.isMain))
}
