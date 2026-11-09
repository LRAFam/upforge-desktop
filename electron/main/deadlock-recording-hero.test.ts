import { describe, expect, it, vi } from 'vitest'
import {
  deadlockModeFromMatchResponse,
  playerFromMatchResponse,
  recordingHeroLabel,
  resolveDeadlockRecordingHero,
  resolveDeadlockRecordingMatch,
} from './deadlock-recording-hero'

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

  it('reads the real queue from match metadata (every mode, not just ranked)', () => {
    const res = (match_mode: unknown, game_mode: unknown = 1) => ({ metadata: { match_info: { match_mode, game_mode } } })
    expect(deadlockModeFromMatchResponse(res(4))).toBe('RANKED')
    expect(deadlockModeFromMatchResponse(res(1))).toBe('UNRANKED')
    expect(deadlockModeFromMatchResponse(res(1, 4))).toBe('STREET_BRAWL')
    expect(deadlockModeFromMatchResponse(res(2))).toBe('PRIVATE_LOBBY')
    expect(deadlockModeFromMatchResponse(res(3))).toBe('COOP_BOT')
    expect(deadlockModeFromMatchResponse(res(7))).toBe('HERO_LABS')
    expect(deadlockModeFromMatchResponse(res(8))).toBe('NEW_PLAYER_PLACEMENT')
    // Protobuf enum names as strings, and the flat shape.
    expect(deadlockModeFromMatchResponse(res('k_ECitadelMatchMode_Ranked'))).toBe('RANKED')
    expect(deadlockModeFromMatchResponse(res('Unranked', 'k_ECitadelGameMode_StreetBrawl'))).toBe('STREET_BRAWL')
    expect(deadlockModeFromMatchResponse({ metadata: { match_mode: 4 } })).toBe('RANKED')
    // Unknown → null (keep the existing label; never guess).
    expect(deadlockModeFromMatchResponse(res(0))).toBeNull()
    expect(deadlockModeFromMatchResponse(res(99))).toBeNull()
    expect(deadlockModeFromMatchResponse({ player: null })).toBeNull()
    expect(deadlockModeFromMatchResponse(null)).toBeNull()
  })

  it('resolves hero and queue from the same response', async () => {
    const fetchMatch = vi.fn()
      .mockResolvedValueOnce({ player: null })
      .mockResolvedValueOnce({ player: { hero_id: 13, hero_name: 'Haze' }, metadata: { match_info: { match_mode: 1, game_mode: 4 } } })
    const out = await resolveDeadlockRecordingMatch(4242, { fetchMatch, sleep: async () => {}, delaysMs: [1, 1, 1] })
    expect(out).toEqual({ player: { heroId: 13, heroName: 'Haze', heroIcon: null }, mode: 'STREET_BRAWL' })
  })
})
