import { describe, expect, it } from 'vitest'
import { clipMomentFacts, clipMomentLabel, clipRank, clipRetentionScore, topMomentClips } from './clip-priority'

const base = {
  id: 'x',
  favorited: false,
  overallScore: null as number | null,
}

describe('clipRank', () => {
  it('ranks ace above clutch above multikill above kill', () => {
    expect(clipRank({ ...base, trigger: 'ace' })).toBeGreaterThan(clipRank({ ...base, trigger: 'clutch' }))
    expect(clipRank({ ...base, trigger: 'clutch' })).toBeGreaterThan(clipRank({ ...base, trigger: 'multikill' }))
    expect(clipRank({ ...base, trigger: 'multikill' })).toBeGreaterThan(clipRank({ ...base, trigger: 'kill' }))
  })
})

describe('clipRetentionScore', () => {
  it('never evicts uploaded or favorited before routine kills', () => {
    expect(clipRetentionScore({ ...base, trigger: 'kill', apiClipId: 1 })).toBeGreaterThan(
      clipRetentionScore({ ...base, trigger: 'kill' }),
    )
    expect(clipRetentionScore({ ...base, trigger: 'kill', favorited: true })).toBeGreaterThan(
      clipRetentionScore({ ...base, trigger: 'kill' }),
    )
  })
})

describe('topMomentClips', () => {
  it('returns highest-ranked clips up to limit', () => {
    const clips = [
      { ...base, id: 'k', trigger: 'kill' as const },
      { ...base, id: 'c', trigger: 'clutch' as const },
      { ...base, id: 'a', trigger: 'ace' as const },
    ]
    expect(topMomentClips(clips, 2).map(c => c.id)).toEqual(['a', 'c'])
  })
})

describe('death clips', () => {
  it('rank below every highlight so they never become top moments', () => {
    const base = { id: 'a', favorited: false, overallScore: null }
    expect(clipRank({ ...base, trigger: 'death' })).toBeLessThan(clipRank({ ...base, trigger: 'kill' }))
  })
})

describe('clip moment labels (UX1124-18)', () => {
  it('tells same-kind moments apart by round, video time and length', () => {
    const a = clipMomentLabel({ trigger: 'clutch', killCount: 3, round: 13, momentOffsetMs: 761_000, durationSeconds: 18, game: 'valorant' })
    const b = clipMomentLabel({ trigger: 'clutch', killCount: 2, round: 6, momentOffsetMs: 312_400, durationSeconds: 20, game: 'valorant' })
    expect(a).toBe('Clutch · 3 kills · R14 · at 12:41 · 0:18')
    expect(b).toBe('Clutch · 2 kills · R7 · at 5:12 · 0:20')
    expect(a).not.toBe(b)
  })
  it('only says what the clip measured', () => {
    expect(clipMomentLabel({ trigger: 'ace' })).toBe('Ace')
    expect(clipMomentLabel({ trigger: 'multikill', killCount: 4, durationSeconds: 3725 })).toBe('4K · 1:02:05')
    expect(clipMomentFacts({ trigger: 'kill', round: 3, game: 'lol' })).toEqual([])
    expect(clipMomentFacts({ trigger: 'kill', round: null, momentOffsetMs: Number.NaN })).toEqual([])
  })
})
