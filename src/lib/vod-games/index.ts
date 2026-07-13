import type { VodGameAdapter, VodGameId } from './types'
import { valorantVodAdapter } from './valorant'
import { cs2VodAdapter } from './cs2'
import { deadlockVodAdapter } from './deadlock'
import { lolVodAdapter } from './lol'

export * from './types'
export { valorantVodAdapter } from './valorant'
export { cs2VodAdapter } from './cs2'
export { deadlockVodAdapter } from './deadlock'
export { lolVodAdapter } from './lol'

const ADAPTERS: Record<VodGameId, VodGameAdapter> = {
  valorant: valorantVodAdapter,
  cs2: cs2VodAdapter,
  deadlock: deadlockVodAdapter,
  lol: lolVodAdapter,
}

/** Resolve a VOD adapter for a game id; defaults to Valorant for unknown ids. */
export function getVodAdapter(game: string | null | undefined): VodGameAdapter {
  const key = (game ?? '').toLowerCase()
  if (key === 'cs2' || key === 'counter-strike' || key === 'counter_strike') return cs2VodAdapter
  if (key === 'deadlock') return deadlockVodAdapter
  if (key === 'lol' || key === 'league' || key === 'league_of_legends') return lolVodAdapter
  return ADAPTERS[key as VodGameId] ?? valorantVodAdapter
}
