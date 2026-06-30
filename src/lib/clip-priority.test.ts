import { describe, expect, it } from 'vitest'
import { clipRank, clipRetentionScore, topMomentClips } from './clip-priority'

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
