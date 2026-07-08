import { describe, expect, it } from 'vitest'
import { isGsiMatchLive } from './steam-gsi-server'

describe('isGsiMatchLive', () => {
  it('returns false for menu map', () => {
    expect(isGsiMatchLive({ map: { name: 'menu', phase: 'live' } })).toBe(false)
  })

  it('returns true for competitive live map phase', () => {
    expect(isGsiMatchLive({
      map: { name: 'de_mirage', phase: 'live', mode: 'competitive' },
    })).toBe(true)
  })

  it('returns true for premier warmup', () => {
    expect(isGsiMatchLive({
      map: { name: 'de_inferno', phase: 'warmup', mode: 'premier' },
    })).toBe(true)
  })

  it('falls back to round.phase when map.phase is missing', () => {
    expect(isGsiMatchLive({
      map: { name: 'de_anubis' },
      round: { phase: 'live' },
    })).toBe(true)
  })

  it('returns false after gameover', () => {
    expect(isGsiMatchLive({
      map: { name: 'de_mirage', phase: 'gameover' },
    })).toBe(false)
  })
})

describe('hasEverReceivedGsi', () => {
  it('is exported for cfg-loaded detection', async () => {
    const mod = await import('./steam-gsi-server')
    expect(typeof mod.hasEverReceivedGsi).toBe('function')
    expect(mod.hasEverReceivedGsi()).toBe(false)
  })
})
