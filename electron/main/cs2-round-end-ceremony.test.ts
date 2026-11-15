import { describe, expect, it, vi } from 'vitest'

vi.mock('@laihoe/demoparser2', () => ({
  parseHeader: vi.fn(),
  parseEvent: vi.fn(),
  parsePlayerInfo: vi.fn(),
  parseTicks: vi.fn(() => []),
}))

import { ceremonyFromRoundEnd } from './cs2-demo-parser'

describe('ceremonyFromRoundEnd', () => {
  it('labels a CT elimination win from a real round_end row as elimination, not timer', () => {
    // Shape of a demoparser2 round_end row: text reason plus Valve's numeric reason 8 (CTs win).
    expect(ceremonyFromRoundEnd({ tick: 81234, winner: 3, reason: 't_killed', round_win_reason: 8, round: 5 })).toBe('elimination')
    expect(ceremonyFromRoundEnd({ winner: 2, reason: 'ct_killed', round_win_reason: 9 })).toBe('elimination')
  })

  it('reads the other text reasons', () => {
    expect(ceremonyFromRoundEnd({ reason: 'time_ran_out', round_win_reason: 12 })).toBe('timer')
    expect(ceremonyFromRoundEnd({ reason: 'bomb_exploded', round_win_reason: 1 })).toBe('detonation')
    expect(ceremonyFromRoundEnd({ reason: 'bomb_defused', round_win_reason: 7 })).toBe('bombdefused')
  })

  it('falls back to Valve numeric reasons when there is no text', () => {
    expect(ceremonyFromRoundEnd({ round_win_reason: 8 })).toBe('elimination')
    expect(ceremonyFromRoundEnd({ round_win_reason: 9 })).toBe('elimination')
    expect(ceremonyFromRoundEnd({ round_win_reason: 12 })).toBe('timer')
    expect(ceremonyFromRoundEnd({ reason: 1 })).toBe('detonation')
    expect(ceremonyFromRoundEnd({ reason: 7 })).toBe('bombdefused')
    expect(ceremonyFromRoundEnd({})).toBeNull()
  })
})
