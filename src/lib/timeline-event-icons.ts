import {
  spikeEventIcon as valorantSpikeEventIcon,
  timelineEventIcon as valorantTimelineEventIcon,
  roundOutcomeIcon as valorantRoundOutcomeIcon,
  type SpikeEventKind,
  type TimelineEventKind,
  type RoundOutcomeFields,
} from './valorant-round-icons'
import {
  cs2SpikeEventIcon,
  cs2TimelineEventIcon,
  cs2RoundOutcomeIcon,
  type Cs2SpikeEventKind,
  type Cs2TimelineEventKind,
  type Cs2RoundOutcomeFields,
} from './cs2-round-icons'

export type { SpikeEventKind, TimelineEventKind, RoundOutcomeFields }
export type { Cs2SpikeEventKind, Cs2TimelineEventKind, Cs2RoundOutcomeFields }

function isCs2Game(game: string | null | undefined): boolean {
  return game === 'cs2' || game === 'counter-strike' || game === 'counter_strike'
}

export function spikeEventIcon(kind: SpikeEventKind, game?: string | null): string {
  return isCs2Game(game) ? cs2SpikeEventIcon(kind) : valorantSpikeEventIcon(kind)
}

export function timelineEventIcon(kind: TimelineEventKind, game?: string | null): string {
  return isCs2Game(game) ? cs2TimelineEventIcon(kind) : valorantTimelineEventIcon(kind)
}

export function roundOutcomeIcon(round: RoundOutcomeFields, game?: string | null): string {
  return isCs2Game(game) ? cs2RoundOutcomeIcon(round) : valorantRoundOutcomeIcon(round)
}
