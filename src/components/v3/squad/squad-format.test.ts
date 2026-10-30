import { describe, expect, it } from 'vitest'
import { gameMixLabel, initial, pctLabel, presenceLabel, presenceTone } from './squad-format'

describe('squad-format', () => {
  it('ranks recording above online above offline', () => {
    expect(presenceTone({ online: true, is_recording: true })).toBe('live')
    expect(presenceTone({ online: true })).toBe('online')
    expect(presenceTone(undefined)).toBe('offline')
    expect(presenceLabel({ is_recording: true, game: 'cs2' })).toBe('Recording · CS2')
    expect(presenceLabel({ online: true })).toBe('Online')
  })

  it('handles both 0–1 and 0–100 rates, and initials', () => {
    expect(pctLabel(0.55)).toBe('55%')
    expect(pctLabel(55.4)).toBe('55%')
    expect(pctLabel(null)).toBeNull()
    expect(initial('rook')).toBe('R')
  })

  it('lists games by count and skips zeros', () => {
    expect(gameMixLabel({ cs2: 1, valorant: 2, deadlock: 0 })).toBe('2 in Valorant · 1 in CS2')
    expect(gameMixLabel({})).toBeNull()
  })
})
