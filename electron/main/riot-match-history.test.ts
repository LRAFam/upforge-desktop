import { describe, expect, it } from 'vitest'
import { parseRiotMatchHistory } from './riot-match-history'

describe('parseRiotMatchHistory', () => {
  it('uses only the canonical Riot match ID and start-time fields', () => {
    expect(parseRiotMatchHistory({
      History: [{ MatchID: 'match-1', GameStartTimeMillis: 1_700_000_000_000 }],
    })).toEqual([{ matchId: 'match-1', gameStartTimeMs: 1_700_000_000_000 }])
  })

  it('keeps timing explicitly missing instead of reading alternate fields', () => {
    expect(parseRiotMatchHistory({
      History: [{ MatchID: 'match-1', GameStartTime: 1_700_000_000 }],
    })).toEqual([{ matchId: 'match-1', gameStartTimeMs: null }])
  })

  it('keeps the queue so replay sync can skip modes without replays', () => {
    expect(parseRiotMatchHistory({
      History: [{ MatchID: 'm', GameStartTimeMillis: 5, QueueID: 'competitive' }],
    })).toEqual([{ matchId: 'm', gameStartTimeMs: 5, queueId: 'competitive' }])
  })

  it('rejects malformed history entries', () => {
    expect(parseRiotMatchHistory({ History: [{ GameStartTimeMillis: 1 }, null] })).toEqual([])
  })
})
