import { describe, expect, it } from 'vitest'
import { initial, limitPct, resultTone, roundScore } from './coach-format'

describe('coach-format', () => {
  it('caps limit bars and survives missing limits', () => {
    expect(limitPct(3, 4)).toBe(75)
    expect(limitPct(9, 4)).toBe(100)
    expect(limitPct(1, 0)).toBe(0)
    expect(limitPct(null, 4)).toBe(0)
  })

  it('formats scores and results from real fields only', () => {
    expect(roundScore(9, 13)).toBe('9–13')
    expect(roundScore(null, 13)).toBeNull()
    expect(resultTone({ rounds_won: 13, rounds_lost: 8 })).toBe('win')
    expect(resultTone({ rounds_won: 9, rounds_lost: 13 })).toBe('loss')
    expect(resultTone({ won: false })).toBe('loss')
    expect(resultTone({})).toBeNull()
  })

  it('gives an initial or a placeholder', () => {
    expect(initial('rook')).toBe('R')
    expect(initial('')).toBe('?')
  })
})
