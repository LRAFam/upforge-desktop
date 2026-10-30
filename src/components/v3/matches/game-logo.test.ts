import { describe, expect, it } from 'vitest'
import { gameLogo } from './game-logo'

describe('gameLogo', () => {
  it('finds a logo for every supported game, case-insensitively, including the league alias', () => {
    for (const g of ['valorant', 'CS2', 'deadlock', 'lol', 'league']) expect(gameLogo(g)).toBeTruthy()
    expect(gameLogo('league')).toBe(gameLogo('lol'))
  })
  it('returns null for unknown or missing games so rows show no broken image', () => {
    expect(gameLogo('fortnite')).toBeNull()
    expect(gameLogo(null)).toBeNull()
    expect(gameLogo(undefined)).toBeNull()
  })
})
