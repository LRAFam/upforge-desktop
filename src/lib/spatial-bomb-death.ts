import type { SpatialTimelineEvent } from './spatial-types'

/** Spike explosion death (Riot attributes killer=victim). Infer for older analyses too. */
export function isBombDeathEvent(ev: Pick<SpatialTimelineEvent, 'type' | 'cause' | 'weapon' | 'label'>): boolean {
  if (ev.type !== 'death') return false
  if (ev.cause === 'bomb') return true
  if (ev.weapon === 'Spike') return true
  const label = (ev.label ?? '').toLowerCase()
  return label.includes('spike') || label.includes('explosion')
}

/** Badge copy for death chips — keep layout: always one short uppercase label. */
export function deathTradeBadge(ev: Pick<SpatialTimelineEvent, 'type' | 'cause' | 'weapon' | 'label' | 'isolated'>): {
  text: string
  tone: 'spike' | 'isolated' | 'traded'
} {
  if (isBombDeathEvent(ev)) return { text: 'Spike', tone: 'spike' }
  if (ev.isolated) return { text: 'No trade', tone: 'isolated' }
  return { text: 'Traded', tone: 'traded' }
}
