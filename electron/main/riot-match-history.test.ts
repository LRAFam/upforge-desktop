import { describe, expect, it } from 'vitest'
import { parseRiotMatchHistory, pickHistoryMatchIdForRecording } from './riot-match-history'

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

describe('pickHistoryMatchIdForRecording', () => {
  const recordingStart = 1_700_000_000_000

  it('rejects the previous match when the just-played one is not in history yet', () => {
    const history = [{ matchId: 'previous', gameStartTimeMs: recordingStart - 45 * 60_000 }]
    expect(pickHistoryMatchIdForRecording(history, recordingStart)).toBeNull()
  })

  it('picks the entry whose start aligns with the recording', () => {
    const history = [
      { matchId: 'previous', gameStartTimeMs: recordingStart - 40 * 60_000 },
      { matchId: 'this-one', gameStartTimeMs: recordingStart + 90_000 },
    ]
    expect(pickHistoryMatchIdForRecording(history, recordingStart)).toBe('this-one')
  })

  it('rejects entries without start timing', () => {
    expect(pickHistoryMatchIdForRecording([{ matchId: 'x', gameStartTimeMs: null }], recordingStart)).toBeNull()
  })
})
