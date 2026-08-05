import { describe, expect, it } from 'vitest'
import { isValorantModeFilteredOut, VALORANT_RECORDABLE_MODES } from './recorded-modes-filter'

describe('isValorantModeFilteredOut', () => {
  it('skips The Range when only Comp/Premier are selected', () => {
    expect(isValorantModeFilteredOut(['COMPETITIVE', 'PREMIER'], 'SHOOTING_RANGE')).toBe(true)
  })

  it('allows The Range when the chip is selected', () => {
    expect(isValorantModeFilteredOut(['COMPETITIVE', 'PREMIER', 'SHOOTING_RANGE'], 'SHOOTING_RANGE')).toBe(false)
  })

  it('does not filter when every recordable mode is selected', () => {
    expect(isValorantModeFilteredOut([...VALORANT_RECORDABLE_MODES], 'SHOOTING_RANGE')).toBe(false)
  })

  it('keeps Comp recording when Comp is selected', () => {
    expect(isValorantModeFilteredOut(['COMPETITIVE', 'PREMIER'], 'COMPETITIVE')).toBe(false)
  })
})
