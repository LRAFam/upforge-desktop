import { describe, expect, it } from 'vitest'
import { analysisKdaLine, analysisScoreLine } from './dashboard-analysis-summary'

const summary = {
  rounds_won: 13,
  rounds_lost: 9,
  kills: 21,
  deaths: 14,
  assists: 7,
}

describe('dashboard analysis summary', () => {
  it('formats the submitted match score and K/D/A', () => {
    expect(analysisScoreLine(summary)).toBe('13 – 9')
    expect(analysisKdaLine(summary)).toBe('21 / 14 / 7')
  })

  it('surfaces missing score and stats explicitly', () => {
    expect(analysisScoreLine({ ...summary, rounds_lost: null })).toBeNull()
    expect(analysisKdaLine({ ...summary, assists: null })).toBeNull()
  })
})
