import { describe, expect, it } from 'vitest'
import { analysisScoreText, coachingReadyBody } from './analysis-ready-copy'

describe('coaching ready copy', () => {
  it('uses the UpForge score out of 1000 when the API sent one', () => {
    expect(analysisScoreText({ upforge_score: 640, overall_score: 70 })).toBe('UpForge score 640')
  })
  it('falls back to the coach rating out of 10, never /100', () => {
    expect(analysisScoreText({ overall_score: 70 })).toBe('Coach rating 7/10')
    expect(coachingReadyBody('Jett', 'Ascent', { overall_score: 65 })).toBe('Jett on Ascent · Coach rating 6.5/10')
  })
  it('leaves the score out when there is none', () => {
    expect(coachingReadyBody('CS2', null, {})).toBe('CS2')
    expect(coachingReadyBody('Jett', 'Ascent', { overall_score: 'x' })).toBe('Jett on Ascent')
  })
})
