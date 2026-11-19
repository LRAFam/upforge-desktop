import { describe, expect, it } from 'vitest'
import { cs2AccountHint, cs2SteamNameToShow, followSelectedGame } from './settings-game'

describe('followSelectedGame', () => {
  const onValorant = () => ({
    primaryGame: 'valorant',
    trainerMouse: { game: 'valorant', sensitivity: 0.35, fov: 103, perGame: { cs2: { sensitivity: 1.6, fov: 100 } } },
  })
  it('mirrors a title-bar switch so CS2 blocks show and a later save keeps the new game with its own sensitivity', () => {
    const settings = onValorant()
    expect(followSelectedGame(settings, 'cs2')).toBe(true)
    expect(settings).toEqual({
      primaryGame: 'cs2',
      trainerMouse: { game: 'cs2', sensitivity: 1.6, fov: 100, perGame: { valorant: { sensitivity: 0.35, fov: 103 }, cs2: { sensitivity: 1.6, fov: 100 } } },
    })
  })
  it('a game never set before gets the same turn per mouse movement, not the old number', () => {
    const settings = { primaryGame: 'valorant', trainerMouse: { game: 'valorant', sensitivity: 0.35, fov: 103 } }
    followSelectedGame(settings, 'deadlock')
    expect(settings.trainerMouse).toMatchObject({ game: 'deadlock', sensitivity: 0.557, fov: 103 })
  })
  it('switching to League leaves the trainer on its game', () => {
    const settings = onValorant()
    expect(followSelectedGame(settings, 'lol')).toBe(true)
    expect(settings.primaryGame).toBe('lol')
    expect(settings.trainerMouse).toMatchObject({ game: 'valorant', sensitivity: 0.35, fov: 103 })
  })
  it('does nothing when the game already matches', () => {
    const settings = { primaryGame: 'deadlock', trainerMouse: { game: 'cs2', sensitivity: 1, fov: 90 } }
    expect(followSelectedGame(settings, 'deadlock')).toBe(false)
    expect(settings.trainerMouse.game).toBe('cs2')
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
