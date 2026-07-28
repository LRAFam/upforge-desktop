import { describe, expect, it } from 'vitest'
import { canRetryRiotMatchStats } from './match-stats-retry'

describe('canRetryRiotMatchStats', () => {
  it('allows retry for Valorant waiting_match_data', () => {
    expect(canRetryRiotMatchStats({
      game: 'valorant',
      analysisReadiness: { state: 'waiting_match_data' },
    })).toBe(true)
  })

  it('allows retry for syncing and unavailable Riot games', () => {
    expect(canRetryRiotMatchStats({
      game: 'valorant',
      analysisReadiness: { state: 'syncing' },
    })).toBe(true)
    expect(canRetryRiotMatchStats({
      game: 'lol',
      analysisReadiness: { state: 'unavailable' },
    })).toBe(true)
  })

  it('blocks retry for ready CS2 or terminal file states', () => {
    expect(canRetryRiotMatchStats({
      game: 'cs2',
      analysisReadiness: { state: 'waiting_match_data' },
    })).toBe(false)
    expect(canRetryRiotMatchStats({
      game: 'valorant',
      analysisReadiness: { state: 'ready' },
    })).toBe(false)
    expect(canRetryRiotMatchStats({
      game: 'valorant',
      analysisReadiness: { state: 'file_missing' },
    })).toBe(false)
  })
})
