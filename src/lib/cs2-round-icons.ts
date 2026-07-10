/**
 * Official CS2 HUD icons (Valve game files via Juknum/counter-strike-icons).
 * Fetched with scripts/fetch-cs2-round-icons.mjs
 */

import iconKill from '../assets/round-icons/cs2/kill.svg'
import iconDeath from '../assets/round-icons/cs2/death.svg'
import iconBombPlant from '../assets/round-icons/cs2/bombPlant.svg'
import iconBombDefuse from '../assets/round-icons/cs2/bombDefuse.svg'
import iconBombExplode from '../assets/round-icons/cs2/bombExplode.svg'
import iconEliminationWin from '../assets/round-icons/cs2/eliminationWin.svg'
import iconEliminationLoss from '../assets/round-icons/cs2/eliminationLoss.svg'
import iconDefuseWin from '../assets/round-icons/cs2/defuseWin.svg'
import iconDefuseLoss from '../assets/round-icons/cs2/defuseLoss.svg'
import iconTimeWin from '../assets/round-icons/cs2/timeWin.svg'
import iconTimeLoss from '../assets/round-icons/cs2/timeLoss.svg'
import iconBombWin from '../assets/round-icons/cs2/bombWin.svg'
import iconBombLoss from '../assets/round-icons/cs2/bombLoss.svg'

export const CS2_ROUND_ICONS = {
  kill: iconKill,
  death: iconDeath,
  bombPlant: iconBombPlant,
  bombDefuse: iconBombDefuse,
  bombExplode: iconBombExplode,
  eliminationWin: iconEliminationWin,
  eliminationLoss: iconEliminationLoss,
  defuseWin: iconDefuseWin,
  defuseLoss: iconDefuseLoss,
  timeWin: iconTimeWin,
  timeLoss: iconTimeLoss,
  bombWin: iconBombWin,
  bombLoss: iconBombLoss,
} as const

export type Cs2SpikeEventKind = 'plant' | 'defuse' | 'detonation'
export type Cs2TimelineEventKind = Cs2SpikeEventKind | 'kill' | 'death' | 'neutral'

export function cs2SpikeEventIcon(kind: Cs2SpikeEventKind): string {
  switch (kind) {
    case 'plant':
      return CS2_ROUND_ICONS.bombPlant
    case 'defuse':
      return CS2_ROUND_ICONS.bombDefuse
    case 'detonation':
      return CS2_ROUND_ICONS.bombExplode
  }
}

export function cs2TimelineEventIcon(kind: Cs2TimelineEventKind): string {
  switch (kind) {
    case 'plant':
      return cs2SpikeEventIcon('plant')
    case 'defuse':
      return cs2SpikeEventIcon('defuse')
    case 'detonation':
      return cs2SpikeEventIcon('detonation')
    case 'kill':
      return CS2_ROUND_ICONS.kill
    case 'death':
      return CS2_ROUND_ICONS.death
    case 'neutral':
      return CS2_ROUND_ICONS.eliminationLoss
  }
}

export interface Cs2RoundOutcomeFields {
  won: boolean
  ceremony?: string | null
  spikeDetonated?: boolean
}

export function cs2RoundOutcomeIcon(round: Cs2RoundOutcomeFields): string {
  const c = round.ceremony?.toLowerCase() ?? ''
  if (c.includes('bombdefused') || c.includes('defus')) {
    return round.won ? CS2_ROUND_ICONS.defuseWin : CS2_ROUND_ICONS.defuseLoss
  }
  if (c.includes('timer') || c.includes('time') || c.includes('targetsaved')) {
    return round.won ? CS2_ROUND_ICONS.timeWin : CS2_ROUND_ICONS.timeLoss
  }
  if (c.includes('detonat') || c.includes('explos') || c.includes('bombed') || round.spikeDetonated) {
    return round.won ? CS2_ROUND_ICONS.bombWin : CS2_ROUND_ICONS.bombLoss
  }
  return round.won ? CS2_ROUND_ICONS.eliminationWin : CS2_ROUND_ICONS.eliminationLoss
}
