import { describe, expect, it } from 'vitest'
import {
  formatPeekSequence,
  normalizeDuelMoment,
  normalizePeekSequence,
} from './duel-moments'

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

  it('normalizes caveats when string', () => {
    const normalized = normalizeDuelMoment({
      moment_id: 'death-r1-1',
      round: 1,
      video_offset_ms: 1000,
      window_start_ms: 0,
      window_end_ms: 2000,
      callout: null,
      isolated: false,
      caveats: 'Spectator cam after death',
    })
    expect(normalized.caveats).toEqual(['Spectator cam after death'])
  })
})
