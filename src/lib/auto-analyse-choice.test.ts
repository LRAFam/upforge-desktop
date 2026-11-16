import { describe, expect, it } from 'vitest'
import { autoAnalyseChoicePatch, shouldOfferAutoAnalyse } from './auto-analyse-choice'

describe('auto-analyse choice', () => {
  it('accepting turns auto-analyse on with the consent version', () => {
    expect(autoAnalyseChoicePatch(true)).toEqual({ autoAnalyse: true, autoAnalyseConsentVersion: 1, autoAnalysePromptAnswered: true })
  })

  it('declining keeps it off but records the answer so we do not ask again', () => {
    expect(autoAnalyseChoicePatch(false)).toEqual({ autoAnalyse: false, autoAnalyseConsentVersion: 1, autoAnalysePromptAnswered: true })
  })

  it('offers the post-game prompt only to players who are off and never answered', () => {
    expect(shouldOfferAutoAnalyse({ autoAnalyse: false })).toBe(true)
    expect(shouldOfferAutoAnalyse({ autoAnalyse: false, autoAnalysePromptAnswered: true })).toBe(false)
    expect(shouldOfferAutoAnalyse({ autoAnalyse: true })).toBe(false)
    expect(shouldOfferAutoAnalyse(null)).toBe(false)
  })
})
