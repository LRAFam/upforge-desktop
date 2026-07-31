import { describe, expect, it } from 'vitest'
import { analysesUsedLabel, sharedAnalysesPoolHint } from './quota-display'

describe('quota-display', () => {
  it('formats used of limit with left', () => {
    expect(analysesUsedLabel(2, 15)).toBe('2 of 15 used · 13 left')
  })

  it('shared pool hint still shows remaining', () => {
    expect(sharedAnalysesPoolHint(2, 15)).toContain('13 analyses left')
  })
})
