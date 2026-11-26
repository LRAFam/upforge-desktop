import { describe, expect, it } from 'vitest'
import { isValorantRemake } from './valorant-remake'

const rounds = (n: number) => Array.from({ length: n }, (_, i) => ({ round: i }))

describe('isValorantRemake', () => {
  it('treats a round-based match that ended in the first rounds as a remake', () => {
    expect(isValorantRemake({ game: 'valorant', gameMode: 'COMPETITIVE', completionState: 'VoteDraw', roundSummaries: rounds(1) })).toBe(true)
    expect(isValorantRemake({ game: 'valorant', gameMode: 'UNRATED', completionState: '', roundSummaries: rounds(2) })).toBe(true)
  })

  it('never flags surrenders, full matches, or a long VoteDraw (overtime draw)', () => {
    expect(isValorantRemake({ game: 'valorant', completionState: 'Surrendered', roundSummaries: rounds(2) })).toBe(false)
    expect(isValorantRemake({ game: 'valorant', completionState: 'Completed', roundSummaries: rounds(3) })).toBe(false)
    expect(isValorantRemake({ game: 'valorant', completionState: 'VoteDraw', roundSummaries: rounds(26) })).toBe(false)
  })

  it('ignores modes without rounds, missing round data and other games', () => {
    expect(isValorantRemake({ game: 'valorant', gameMode: 'DEATHMATCH', roundSummaries: rounds(1) })).toBe(false)
    expect(isValorantRemake({ game: 'valorant', gameMode: 'teamdeathmatch', roundSummaries: rounds(1) })).toBe(false)
    expect(isValorantRemake({ game: 'valorant', roundSummaries: [] })).toBe(false)
    expect(isValorantRemake({ game: 'cs2', roundSummaries: rounds(1) })).toBe(false)
    expect(isValorantRemake(null)).toBe(false)
  })
})
