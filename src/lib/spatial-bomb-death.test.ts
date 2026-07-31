import { describe, expect, it } from 'vitest'
import { deathTradeBadge } from './spatial-bomb-death'

describe('deathTradeBadge', () => {
  it('labels spike deaths', () => {
    expect(deathTradeBadge({ type: 'death', cause: 'bomb' }).text).toBe('Spike')
  })

  it('uses Far from team for legacy isolated', () => {
    expect(deathTradeBadge({ type: 'death', isolated: true }).text).toBe('Far from team')
  })

  it('labels last alive', () => {
    expect(
      deathTradeBadge({ type: 'death', alliesAlive: 0, traded: false, alliesNearby: 0 }).text,
    ).toBe('Last alive')
  })

  it('labels untraded when allies alive', () => {
    expect(
      deathTradeBadge({ type: 'death', alliesAlive: 2, traded: false, alliesNearby: 0 }).text,
    ).toBe('Untraded')
  })

  it('labels far/traded', () => {
    expect(
      deathTradeBadge({ type: 'death', alliesAlive: 2, traded: true, alliesNearby: 0 }).text,
    ).toBe('Far / traded')
  })
})
