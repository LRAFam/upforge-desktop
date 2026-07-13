import { describe, expect, it, vi } from 'vitest'
import { fetchLiveClientTimeline } from './match-end-timeline'

describe('fetchLiveClientTimeline', () => {
  it('routes Valorant to the riot local API stop', async () => {
    const stopValorant = vi.fn().mockResolvedValue({ game: 'valorant' })
    const stopLol = vi.fn()
    const result = await fetchLiveClientTimeline('valorant', {
      stopValorantTimeline: stopValorant,
      stopLolTimeline: stopLol,
    })
    expect(stopValorant).toHaveBeenCalledOnce()
    expect(stopLol).not.toHaveBeenCalled()
    expect(result).toEqual({ game: 'valorant' })
  })

  it('routes LoL to the live client API stop', async () => {
    const stopValorant = vi.fn()
    const stopLol = vi.fn().mockResolvedValue({ game: 'lol' })
    await fetchLiveClientTimeline('lol', {
      stopValorantTimeline: stopValorant,
      stopLolTimeline: stopLol,
    })
    expect(stopLol).toHaveBeenCalledOnce()
    expect(stopValorant).not.toHaveBeenCalled()
  })

  it('returns null for CS2 (demo-based timeline)', async () => {
    const result = await fetchLiveClientTimeline('cs2', {
      stopValorantTimeline: vi.fn(),
      stopLolTimeline: vi.fn(),
    })
    expect(result).toBeNull()
  })
})
