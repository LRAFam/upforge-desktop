import { describe, expect, it } from 'vitest'
import {
  defaultRecordedModesByGame,
  getRecordedModesForGame,
  isModeFilteredOut,
  isValorantModeFilteredOut,
  migrateRecordedModesByGame,
  modeSkippedMessage,
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

describe('CS2 GSI map.mode aliases', () => {
  it('maps Valve GSI mode strings', () => {
    expect(normalizeCs2GameMode('scrimcomp2v2')).toBe('WINGMAN')
    expect(normalizeCs2GameMode('gungameprogressive')).toBe('ARMS_RACE')
    expect(normalizeCs2GameMode('casual')).toBe('CASUAL')
    expect(normalizeCs2GameMode('custom')).toBe('CUSTOM')
  })
})

describe('default recorded modes (new installs)', () => {
  it('records Unrated and Swiftplay as well as ranked for Valorant', () => {
    expect(defaultRecordedModesByGame().valorant).toEqual(['COMPETITIVE', 'PREMIER', 'CLASSIC', 'SWIFTPLAY'])
  })

  it('captures a first Unrated or Swiftplay match, and still skips Deathmatch and The Range', () => {
    const modes = defaultRecordedModesByGame().valorant
    expect(isValorantModeFilteredOut(modes, 'CLASSIC')).toBe(false)
    expect(isValorantModeFilteredOut(modes, 'SWIFTPLAY')).toBe(false)
    expect(isValorantModeFilteredOut(modes, 'COMPETITIVE')).toBe(false)
    expect(isValorantModeFilteredOut(modes, 'DEATHMATCH')).toBe(true)
    expect(isValorantModeFilteredOut(modes, 'TEAMDEATHMATCH')).toBe(true)
    expect(isValorantModeFilteredOut(modes, 'SHOOTING_RANGE')).toBe(true)
  })

  it('leaves the other games as they were', () => {
    const d = defaultRecordedModesByGame()
    expect(d.lol).toEqual(['CLASSIC'])
    expect(d.cs2).toEqual(['COMPETITIVE', 'PREMIER'])
    expect(d.deadlock).toEqual(['COMPETITIVE'])
  })

  it('never widens a choice the player already saved', () => {
    expect(migrateRecordedModesByGame(undefined, { valorant: ['COMPETITIVE', 'PREMIER'] }).valorant).toEqual(['COMPETITIVE', 'PREMIER'])
    expect(migrateRecordedModesByGame(['COMPETITIVE', 'PREMIER'], undefined).valorant).toEqual(['COMPETITIVE', 'PREMIER'])
    expect(migrateRecordedModesByGame(['COMPETITIVE'], { valorant: [] }).valorant).toEqual([])
  })
})

describe('modeSkippedMessage', () => {
  it('names the mode the way the game does', () => {
    expect(modeSkippedMessage('valorant', 'CLASSIC')).toBe(
      'Unrated is not in your recorded modes, so this match was not captured. Change modes in Settings → Recording.',
    )
    expect(modeSkippedMessage('valorant', 'TEAMDEATHMATCH')).toMatch(/^Team Deathmatch is not in your recorded modes/)
    expect(modeSkippedMessage('cs2', 'WINGMAN')).toMatch(/^Wingman is not in your recorded modes/)
  })

  it('shows an id it has no name for as it is', () => {
    expect(modeSkippedMessage('lol', 'ARAM')).toMatch(/^ARAM is not in your recorded modes/)
  })
})

describe('Other modes switch', () => {
  const named = ['COMPETITIVE', 'PREMIER', 'CLASSIC', 'DEATHMATCH', 'TEAMDEATHMATCH', 'SPIKERUSH', 'SWIFTPLAY', 'SHOOTING_RANGE']

  it('records Skirmish 2v2 when Other modes is on', () => {
    expect(isModeFilteredOut(['COMPETITIVE', 'OTHER'], 'SKIRMISH2V2', VALORANT_RECORDABLE_MODES)).toBe(false)
  })

  it('skips Skirmish 2v2 when every named mode is on but Other modes is off', () => {
    expect(isModeFilteredOut(named, 'SKIRMISH2V2', VALORANT_RECORDABLE_MODES)).toBe(true)
  })

  it('does not let Other modes record a named mode that is off', () => {
    expect(isModeFilteredOut(['COMPETITIVE', 'OTHER'], 'DEATHMATCH', VALORANT_RECORDABLE_MODES)).toBe(true)
  })

  it('every mode the settings list offers has a matching switch in the recorder', () => {
    expect([...VALORANT_RECORDABLE_MODES].sort()).toEqual([...named, 'OTHER'].sort())
  })

  it('tells the player which switch to turn on for a mode without its own switch', () => {
    expect(modeSkippedMessage('valorant', 'SKIRMISH2V2')).toBe(
      'Skirmish 2v2 was not recorded because Other modes is off. Turn on Other modes in Settings → Recording to capture it.',
    )
    expect(modeSkippedMessage('cs2', 'ARMS_RACE')).toMatch(/^Arms Race was not recorded because Other modes is off/)
  })

  it('keeps recording everything for players who had every old mode ticked', () => {
    const oldAll = ['COMPETITIVE', 'PREMIER', 'CLASSIC', 'DEATHMATCH', 'TEAMDEATHMATCH', 'SPIKERUSH', 'SWIFTPLAY', 'SNOWBALL', 'SHOOTING_RANGE']
    const migrated = migrateRecordedModesByGame(undefined, { valorant: oldAll, cs2: ['COMPETITIVE', 'PREMIER', 'WINGMAN', 'CASUAL', 'DEATHMATCH'] })
    expect(migrated.valorant).toContain('OTHER')
    expect(migrated.cs2).toContain('OTHER')
    expect(isModeFilteredOut(migrated.valorant, 'SKIRMISH2V2', VALORANT_RECORDABLE_MODES)).toBe(false)
  })

  it('does not widen a partial choice', () => {
    expect(migrateRecordedModesByGame(undefined, { valorant: named }).valorant).not.toContain('OTHER')
  })
})
