import { describe, expect, it, vi } from 'vitest'
import { pickGameToTrack, pickHandoffGameWhenIdleInMenu } from './game-detector'

vi.mock('./steam-gsi-server', () => ({
  isGsiMatchLive: vi.fn(() => false),
  isGsiReceiving: vi.fn(() => true),
}))

import { isGsiMatchLive, isGsiReceiving } from './steam-gsi-server'

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

describe('pickHandoffGameWhenIdleInMenu', () => {
  it('hands off to Valorant when CS2 is idle in menu', () => {
    vi.mocked(isGsiMatchLive).mockReturnValue(false)
    vi.mocked(isGsiReceiving).mockReturnValue(true)
    expect(pickHandoffGameWhenIdleInMenu('cs2', ['cs2', 'valorant'], 'valorant')).toBe('valorant')
  })

  it('stays on CS2 while GSI shows a live map', () => {
    vi.mocked(isGsiMatchLive).mockReturnValue(true)
    vi.mocked(isGsiReceiving).mockReturnValue(true)
    expect(pickHandoffGameWhenIdleInMenu('cs2', ['cs2', 'valorant'], 'valorant')).toBeNull()
  })
})
