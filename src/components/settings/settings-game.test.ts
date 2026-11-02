import { describe, expect, it } from 'vitest'
import { cs2AccountHint, cs2SteamNameToShow, followSelectedGame } from './settings-game'

describe('followSelectedGame', () => {
  it('mirrors a title-bar switch so CS2 blocks show and a later save keeps the new game', () => {
    const settings = { primaryGame: 'valorant', trainerMouse: { game: 'valorant' } }
    expect(followSelectedGame(settings, 'cs2')).toBe(true)
    expect(settings).toEqual({ primaryGame: 'cs2', trainerMouse: { game: 'cs2' } })
  })
  it('does nothing when the game already matches', () => {
    const settings = { primaryGame: 'deadlock', trainerMouse: { game: 'custom' } }
    expect(followSelectedGame(settings, 'deadlock')).toBe(false)
    expect(settings.trainerMouse.game).toBe('custom')
  })
})

describe('cs2SteamNameToShow', () => {
  it('shows the account name when this PC has none', () => {
    expect(cs2SteamNameToShow('', 'LRAFam')).toBe('LRAFam')
    expect(cs2SteamNameToShow(undefined, ' LRAFam ')).toBe('LRAFam')
  })
  it('prefers the name saved on this PC', () => {
    expect(cs2SteamNameToShow('Other', 'LRAFam')).toBe('Other')
  })
  it('is empty when neither has one', () => {
    expect(cs2SteamNameToShow('  ', null)).toBe('')
  })
})

describe('cs2AccountHint', () => {
  it('never sends people to the web for FACEIT', () => {
    expect(cs2AccountHint(null, '')).not.toMatch(/web/i)
    expect(cs2AccountHint('niko', 'LRAFam')).toBe('FACEIT: niko')
    expect(cs2AccountHint(null, 'LRAFam')).toBe('Steam: LRAFam')
  })
})
