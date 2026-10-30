import { describe, expect, it } from 'vitest'
import { linkDeadlockAutoReview, recordingsForDeadlockMatch } from './deadlock-auto-review-link'

const T0 = 1_800_000_000_000
const rec = (id: string, over: Partial<{ game: string; recordedAt: number; matchId: string | null; deadlockReviewJobId: string }> = {}) =>
  ({ id, game: 'deadlock', recordedAt: T0, matchId: null as string | null, ...over })

describe('recordingsForDeadlockMatch', () => {
  it('prefers the recording with the same match id', () => {
    const recs = [rec('a', { matchId: '555' }), rec('b', { matchId: null })]
    expect(recordingsForDeadlockMatch(recs, { matchId: 555, sessionStart: T0 }).map(r => r.id)).toEqual(['a'])
  })
  it('falls back to the session time when no match id is stored', () => {
    const recs = [rec('a', { recordedAt: T0 + 60_000 }), rec('old', { recordedAt: T0 - 3_600_000 })]
    expect(recordingsForDeadlockMatch(recs, { matchId: 555, sessionStart: T0 }).map(r => r.id)).toEqual(['a'])
  })
  it('never touches other games, other matches or recordings that already have a review', () => {
    const recs = [
      rec('cs', { game: 'cs2' }),
      rec('other', { matchId: '999' }),
      rec('done', { deadlockReviewJobId: 'job-existing-123' }),
    ]
    expect(recordingsForDeadlockMatch(recs, { matchId: 555, sessionStart: T0 })).toEqual([])
  })
})

describe('linkDeadlockAutoReview', () => {
  it('stores the auto-upload job so Review replay is not offered again', () => {
    const recs = [rec('a', { matchId: '555' })]
    const set: Array<[string, string]> = []
    const n = linkDeadlockAutoReview({ list: () => recs, setJob: (id, job) => { set.push([id, job]); return true } }, 'job-abc-12345', { matchId: 555, sessionStart: T0 })
    expect(n).toBe(1)
    expect(set).toEqual([['a', 'job-abc-12345']])
  })
})
