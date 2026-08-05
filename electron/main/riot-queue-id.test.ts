import { describe, expect, it } from 'vitest'
import { normalizeQueueId } from './riot-queue-id'

describe('normalizeQueueId', () => {
  it('maps The Range queue id to SHOOTING_RANGE', () => {
    expect(normalizeQueueId('rangev2')).toBe('SHOOTING_RANGE')
    expect(normalizeQueueId('RANGEV2')).toBe('SHOOTING_RANGE')
  })

  it('still maps competitive and hurm', () => {
    expect(normalizeQueueId('competitive')).toBe('COMPETITIVE')
    expect(normalizeQueueId('hurm')).toBe('TEAMDEATHMATCH')
  })
})
