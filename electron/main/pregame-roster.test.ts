import { describe, expect, it } from 'vitest'
import { lockedPregamePlayers } from './pregame-roster'

describe('pre-game roster evidence', () => {
  it('excludes hovered picks, unknown lock state and missing agent IDs', () => {
    const locked = { Subject: 'self', CharacterID: 'omen', CharacterSelectionState: 'locked' }
    expect(lockedPregamePlayers([
      locked,
      { Subject: 'hover', CharacterID: 'reyna', CharacterSelectionState: 'selected' },
      { Subject: 'missing-state', CharacterID: 'jett' },
      { Subject: 'missing-agent', CharacterSelectionState: 'locked' },
    ])).toEqual([locked])
    expect(lockedPregamePlayers(undefined)).toEqual([])
  })
})
