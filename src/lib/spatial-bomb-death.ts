import type { SpatialTimelineEvent } from './spatial-types'

type BombDeathFields = Pick<SpatialTimelineEvent, 'type'> &
  Partial<
    Pick<
      SpatialTimelineEvent,
      'cause' | 'weapon' | 'label' | 'isolated' | 'alliesNearby' | 'alliesAlive' | 'traded'
    >
  >

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
  tone: 'spike' | 'isolated' | 'traded' | 'far'
} {
  if (isBombDeathEvent(ev)) return { text: 'Spike', tone: 'spike' }

  const alliesAlive = ev.alliesAlive
  const traded = ev.traded === true
  const nearby = ev.alliesNearby ?? (ev.isolated ? 0 : 1)

  if (alliesAlive != null || ev.traded != null) {
    if (alliesAlive === 0) return { text: 'Last alive', tone: 'traded' }
    if (traded && nearby === 0) return { text: 'Far / traded', tone: 'far' }
    if (traded) return { text: 'Traded', tone: 'traded' }
    return { text: 'Untraded', tone: 'isolated' }
  }

  // Legacy: isolated meant spacing only — do not say "No trade"
  if (ev.isolated) return { text: 'Far from team', tone: 'far' }
  return { text: 'Traded', tone: 'traded' }
}
