import type { SpatialTimelineEvent } from './spatial-types'

type BombDeathFields = Pick<SpatialTimelineEvent, 'type'> &
  Partial<Pick<SpatialTimelineEvent, 'cause' | 'weapon' | 'label' | 'isolated'>>

/** Spike explosion death (Riot attributes killer=victim). Infer for older analyses too. */
export function isBombDeathEvent(ev: BombDeathFields): boolean {
  if (ev.type !== 'death') return false
  if (ev.cause === 'bomb') return true
  if (ev.weapon === 'Spike') return true
  const label = (ev.label ?? '').toLowerCase()
  return label.includes('spike') || label.includes('explosion')
}

/** Badge copy for death chips — keep layout: always one short uppercase label. */
export function deathTradeBadge(ev: BombDeathFields): {
  text: string
  tone: 'spike' | 'isolated' | 'traded'
} {
  if (isBombDeathEvent(ev)) return { text: 'Spike', tone: 'spike' }
  if (ev.isolated) return { text: 'No trade', tone: 'isolated' }
  return { text: 'Traded', tone: 'traded' }
}
