import { describe, expect, it } from 'vitest'
import {
  defaultRecordedModesByGame,
  getRecordedModesForGame,
  isModeFilteredOut,
  isValorantModeFilteredOut,
  migrateRecordedModesByGame,
  normalizeCs2GameMode,
  VALORANT_RECORDABLE_MODES,
  LOL_RECORDABLE_MODES,
} from './recorded-modes-filter'

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

describe('isModeFilteredOut (LoL)', () => {
  it('skips ARAM when only Summoner\'s Rift is selected', () => {
    expect(isModeFilteredOut(['CLASSIC'], 'ARAM', LOL_RECORDABLE_MODES)).toBe(true)
  })

  it('allows CLASSIC when Summoner\'s Rift is selected', () => {
    expect(isModeFilteredOut(['CLASSIC'], 'CLASSIC', LOL_RECORDABLE_MODES)).toBe(false)
  })
})

describe('migrateRecordedModesByGame', () => {
  it('moves legacy recordedModes into valorant and applies defaults for others', () => {
    const migrated = migrateRecordedModesByGame(['COMPETITIVE', 'CLASSIC'], undefined)
    expect(migrated.valorant).toEqual(['COMPETITIVE', 'CLASSIC'])
    expect(migrated.lol).toEqual(defaultRecordedModesByGame().lol)
    expect(migrated.cs2).toEqual(['COMPETITIVE', 'PREMIER'])
  })

  it('keeps existing by-game valorant over legacy when both present', () => {
    const migrated = migrateRecordedModesByGame(
      ['COMPETITIVE'],
      { valorant: ['PREMIER'], lol: ['ARAM'], cs2: ['CASUAL'], deadlock: [] },
    )
    expect(migrated.valorant).toEqual(['PREMIER'])
    expect(migrated.lol).toEqual(['ARAM'])
  })
})

describe('getRecordedModesForGame', () => {
  it('returns per-game list', () => {
    const byGame = defaultRecordedModesByGame()
    byGame.lol = ['ARAM']
    expect(getRecordedModesForGame(byGame, 'lol')).toEqual(['ARAM'])
  })
})

describe('normalizeCs2GameMode', () => {
  it('maps GSI competitive/premier/wingman', () => {
    expect(normalizeCs2GameMode('competitive')).toBe('COMPETITIVE')
    expect(normalizeCs2GameMode('premier')).toBe('PREMIER')
    expect(normalizeCs2GameMode('wingman')).toBe('WINGMAN')
  })
})
