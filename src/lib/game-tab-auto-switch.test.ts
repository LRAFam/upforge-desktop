import { describe, expect, it } from 'vitest'
import { gameTabToAutoSwitch } from './game-tab-auto-switch'

const base = { current: 'valorant' as const, recording: false, enabled: true, onboarding: false }

describe('gameTabToAutoSwitch', () => {
  it('switches to the in-game process that just started when idle', () => {
    expect(gameTabToAutoSwitch({ ...base, event: { game: 'lol', active: true } })).toBe('lol')
  })
  it('never switches while a recording is active', () => {
    expect(gameTabToAutoSwitch({ ...base, recording: true, event: { game: 'lol', active: true } })).toBeNull()
  })
  it('ignores stops, the current game, unknown games, onboarding and the setting being off', () => {
    expect(gameTabToAutoSwitch({ ...base, event: { game: 'lol', active: false } })).toBeNull()
    expect(gameTabToAutoSwitch({ ...base, event: { game: 'valorant', active: true } })).toBeNull()
    expect(gameTabToAutoSwitch({ ...base, event: { game: 'minecraft', active: true } })).toBeNull()
    expect(gameTabToAutoSwitch({ ...base, event: null })).toBeNull()
    expect(gameTabToAutoSwitch({ ...base, onboarding: true, event: { game: 'lol', active: true } })).toBeNull()
    expect(gameTabToAutoSwitch({ ...base, enabled: false, event: { game: 'lol', active: true } })).toBeNull()
  })
})
