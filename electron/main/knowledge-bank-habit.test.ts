import { describe, expect, it } from 'vitest'
import { habitDetails } from './knowledge-bank-habit'

describe('habitDetails', () => {
  it('reads the stored polarity, whole note and moments (newest moment opens first)', () => {
    const d = habitDetails({
      polarity: 'risk',
      note: '  Died alone on B long   without a trade. ',
      example_analysis_id: 700,
      example_moments: [
        { analysis_id: 812, round: 4, ms: 192000 },
        { analysis_id: 700, round: null, ms: null },
        { analysis_id: 0, round: 1, ms: 1 },
        'junk',
      ],
    })
    expect(d.polarity).toBe('risk')
    expect(d.note).toBe('Died alone on B long without a trade.')
    expect(d.exampleMoments).toEqual([
      { analysisId: 812, round: 4, ms: 192000 },
      { analysisId: 700, round: null, ms: null },
    ])
    expect(d.exampleAnalysisId).toBe(812)
  })

  it('falls back on older servers: no polarity, no note, example_analysis_id only', () => {
    const d = habitDetails({ example_analysis_id: 55, polarity: 'nonsense' })
    expect(d).toEqual({ exampleAnalysisId: 55, polarity: null, note: null, exampleMoments: [] })
    expect(habitDetails({}).exampleAnalysisId).toBeNull()
  })
})
