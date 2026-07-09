import { describe, expect, it } from 'vitest'
import { pickGameToTrack } from './game-detector'

describe('pickGameToTrack', () => {
  it('prefers primary game when multiple are running', () => {
    expect(pickGameToTrack(['valorant', 'cs2'], 'cs2')).toBe('cs2')
    expect(pickGameToTrack(['valorant', 'cs2', 'deadlock'], 'valorant')).toBe('valorant')
  })

  it('falls back to stable order when primary is not running', () => {
    expect(pickGameToTrack(['cs2', 'deadlock'], 'valorant')).toBe('cs2')
    expect(pickGameToTrack(['deadlock'], 'valorant')).toBe('deadlock')
  })

  it('returns null when nothing is running', () => {
    expect(pickGameToTrack([], 'cs2')).toBeNull()
  })
})
