import { describe, expect, it } from 'vitest'
import { primaryGameSwitchPatch } from './usePrimaryGame'

describe('primaryGameSwitchPatch', () => {
  it('moves the trainer sensitivity game for games the trainer supports', () => {
    expect(primaryGameSwitchPatch('cs2', { game: 'valorant', dpi: 800 })).toEqual({ primaryGame: 'cs2', trainerMouse: { game: 'cs2', dpi: 800 } })
  })
  it('leaves the trainer alone when switching to League', () => {
    expect(primaryGameSwitchPatch('lol', { game: 'valorant', dpi: 800 })).toEqual({ primaryGame: 'lol' })
  })
})
