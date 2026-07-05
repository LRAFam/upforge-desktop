/**
 * Official Valorant round / spike ceremony icons (bundled under src/assets/round-icons).
 * Same assets as upforge-frontend/public/assets/images/round-icons/.
 */

import iconDiffuseWin from '../assets/round-icons/diffusewin1.png'
import iconDiffuseLoss from '../assets/round-icons/diffuseloss1.png'
import iconTimeWin from '../assets/round-icons/timewin1.png'
import iconTimeLoss from '../assets/round-icons/timeloss1.png'
import iconEliminationWin from '../assets/round-icons/eliminationwin1.png'
import iconEliminationLoss from '../assets/round-icons/eliminationloss1.png'
import iconExplosionWin from '../assets/round-icons/explosionwin1.png'
import iconExplosionLoss from '../assets/round-icons/explosionloss1.png'

export const VALORANT_ROUND_ICONS = {
  diffuseWin: iconDiffuseWin,
  diffuseLoss: iconDiffuseLoss,
  timeWin: iconTimeWin,
  timeLoss: iconTimeLoss,
  eliminationWin: iconEliminationWin,
  eliminationLoss: iconEliminationLoss,
  explosionWin: iconExplosionWin,
  explosionLoss: iconExplosionLoss,
} as const

export type SpikeEventKind = 'plant' | 'defuse' | 'detonation'
export type TimelineEventKind = SpikeEventKind | 'kill' | 'death' | 'neutral'

/** Spike plant / defuse / detonation (in-round events). */
export function spikeEventIcon(kind: SpikeEventKind): string {
  switch (kind) {
    case 'plant':
      return VALORANT_ROUND_ICONS.explosionWin
    case 'defuse':
      return VALORANT_ROUND_ICONS.diffuseWin
    case 'detonation':
      return VALORANT_ROUND_ICONS.explosionLoss
  }
}

/** Compact timeline / moment strip icons. */
export function timelineEventIcon(kind: TimelineEventKind): string {
  switch (kind) {
    case 'plant':
      return spikeEventIcon('plant')
    case 'defuse':
      return spikeEventIcon('defuse')
    case 'detonation':
      return spikeEventIcon('detonation')
    case 'kill':
      return VALORANT_ROUND_ICONS.eliminationWin
    case 'death':
      return VALORANT_ROUND_ICONS.eliminationLoss
    case 'neutral':
      return VALORANT_ROUND_ICONS.eliminationLoss
  }
}

export interface RoundOutcomeFields {
  won: boolean
  ceremony?: string | null
  spikeDetonated?: boolean
}

/** Round header outcome icon (win/loss by ceremony type). */
export function roundOutcomeIcon(round: RoundOutcomeFields): string {
  const c = round.ceremony?.toLowerCase() ?? ''
  if (c.includes('bombdefused') || c.includes('defus')) {
    return round.won ? VALORANT_ROUND_ICONS.diffuseWin : VALORANT_ROUND_ICONS.diffuseLoss
  }
  if (c.includes('timer') || c.includes('time')) {
    return round.won ? VALORANT_ROUND_ICONS.timeWin : VALORANT_ROUND_ICONS.timeLoss
  }
  if (c.includes('detonat') || c.includes('explos') || round.spikeDetonated) {
    return round.won ? VALORANT_ROUND_ICONS.explosionWin : VALORANT_ROUND_ICONS.explosionLoss
  }
  if (c.includes('elim') || c.includes('roundceremon')) {
    return round.won ? VALORANT_ROUND_ICONS.eliminationWin : VALORANT_ROUND_ICONS.eliminationLoss
  }
  return round.won ? VALORANT_ROUND_ICONS.eliminationWin : VALORANT_ROUND_ICONS.eliminationLoss
}
