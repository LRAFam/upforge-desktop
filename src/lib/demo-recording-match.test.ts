import { describe, expect, it } from 'vitest'
import { rankDemosForRecording } from './demo-recording-match'

describe('rankDemosForRecording', () => {
  const recordedAt = Date.parse('2026-07-09T14:00:00Z')
  const matchStart = recordedAt - 40 * 60_000

  it('recommends the demo saved closest to match end', () => {
    const ranked = rankDemosForRecording(
      [
        { name: 'old.dem', path: '/a/old.dem', sizeBytes: 1, modifiedAt: matchStart - 2 * 60 * 60_000 },
        { name: 'match.dem', path: '/a/match.dem', sizeBytes: 1, modifiedAt: recordedAt + 5 * 60_000 },
        { name: 'later.dem', path: '/a/later.dem', sizeBytes: 1, modifiedAt: recordedAt + 3 * 60 * 60_000 },
      ],
      { recordedAt, matchStartTime: matchStart },
    )

    expect(ranked[0]?.name).toBe('match.dem')
    expect(ranked[0]?.recommended).toBe(true)
    expect(ranked[0]?.fit).toBe('best')
  })

  it('marks demos from earlier today as unlikely', () => {
    const ranked = rankDemosForRecording(
      [{ name: 'morning.dem', path: '/a/morning.dem', sizeBytes: 1, modifiedAt: matchStart - 3 * 60 * 60_000 }],
      { recordedAt, matchStartTime: matchStart },
    )

    expect(ranked[0]?.fit).toBe('unlikely')
    expect(ranked[0]?.recommended).toBe(false)
  })
})
