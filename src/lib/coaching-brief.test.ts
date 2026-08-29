import { describe, expect, it } from 'vitest'
import { buildTacticalIntelBrief, parseCoachingEvidence } from './coaching-brief'

describe('coaching brief evidence', () => {
  it('parses references followed by a callout into clickable evidence', () => {
    const parsed = parseCoachingEvidence(
      'R3 [04:56] @ A Cave — visibility was obscured by smoke.',
    )

    expect(parsed.headline).toBe('')
    expect(parsed.evidence).toEqual([
      {
        roundNumber: 2,
        roundLabel: 'R3',
        timeLabel: '04:56',
        timeSeconds: 296,
        text: '@ A Cave — visibility was obscured by smoke',
      },
    ])
  })

  it('parses every cited moment in a combined note', () => {
    const brief = buildTacticalIntelBrief(
      'HIGH — Review these fights. R7 [10:41] @ B Site — passive hold. R10 [16:28] @ B Site — isolated swing.',
    )

    expect(brief.headline).toBe('Review these fights')
    expect(brief.evidence.map(item => item.timeSeconds)).toEqual([641, 988])
  })
})
