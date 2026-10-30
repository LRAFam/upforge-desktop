import { describe, expect, it, vi } from 'vitest'
import { playerFromMatchResponse, recordingHeroLabel, resolveDeadlockRecordingHero } from './deadlock-recording-hero'

describe('deadlock recording hero', () => {
  it('reads the signed-in player\'s hero from the API response', () => {
    expect(playerFromMatchResponse({ player: { hero_id: 13, hero_name: 'Haze', hero_icon: 'https://x/haze.png' } }))
      .toEqual({ heroId: 13, heroName: 'Haze', heroIcon: 'https://x/haze.png' })
    expect(playerFromMatchResponse({ player: null })).toBeNull()
    expect(playerFromMatchResponse({ player: { hero_id: 0, hero_name: ' ' } })).toBeNull()
    expect(playerFromMatchResponse({ player: { hero_id: 13, hero_name: 'Haze', hero_icon: 'javascript:alert(1)' } })?.heroIcon).toBeNull()
  })

  it('retries until metadata is published, then stops', async () => {
    const fetchMatch = vi.fn()
      .mockRejectedValueOnce(new Error('404'))
      .mockResolvedValueOnce({ player: null })
      .mockResolvedValueOnce({ player: { hero_id: 13, hero_name: 'Haze' } })
    const sleep = vi.fn(async () => {})
    const hero = await resolveDeadlockRecordingHero(4242, { fetchMatch, sleep, delaysMs: [1, 1, 1, 1] })
    expect(hero?.heroName).toBe('Haze')
    expect(fetchMatch).toHaveBeenCalledTimes(3)
  })

  it('gives up quietly and rejects bad match ids', async () => {
    const fetchMatch = vi.fn().mockResolvedValue({ player: null })
    expect(await resolveDeadlockRecordingHero(4242, { fetchMatch, sleep: async () => {}, delaysMs: [1, 1] })).toBeNull()
    expect(await resolveDeadlockRecordingHero(-1, { fetchMatch, sleep: async () => {} })).toBeNull()
    expect(fetchMatch).toHaveBeenCalledTimes(2)
  })

  it('never stores a raw hero_N key as the label', () => {
    expect(recordingHeroLabel({ heroId: 13, heroName: 'Haze', heroIcon: null }, 'hero_13')).toBe('Haze')
    expect(recordingHeroLabel(null, 'hero_13')).toBeNull()
    expect(recordingHeroLabel(null, 'Haze')).toBe('Haze')
  })
})
