import { describe, expect, it } from 'vitest'
import { formatPeekSequence, normalizePeekSequence } from './duel-moments'

describe('duel-moments', () => {
  it('formats array peek sequences', () => {
    expect(formatPeekSequence(['jiggle', 'wide_swing'])).toBe('jiggle → wide swing')
  })

  it('accepts a single string peek_sequence from API', () => {
    expect(formatPeekSequence('wide_swing')).toBe('wide swing')
    expect(normalizePeekSequence('hold')).toEqual(['hold'])
  })

  it('returns null for empty or invalid peek_sequence', () => {
    expect(formatPeekSequence(undefined)).toBeNull()
    expect(formatPeekSequence(null)).toBeNull()
    expect(formatPeekSequence([])).toBeNull()
    expect(formatPeekSequence('')).toBeNull()
  })
})
