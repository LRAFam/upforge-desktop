import { describe, expect, it } from 'vitest'
import {
  duelMomentKindLabel,
  duelMomentScrubberTitle,
  duelMomentTimestampLabel,
  formatKillStreakLabel,
  formatPeekSequence,
  isWinDuelMoment,
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

  it('labels kill streaks and win moments', () => {
    expect(formatKillStreakLabel(1)).toBeNull()
    expect(formatKillStreakLabel(3)).toBe('Triple kill')
    expect(formatKillStreakLabel(5)).toBe('Ace')

    const death = {
      moment_id: 'death-r2-12000',
      round: 2,
      video_offset_ms: 12000,
      window_start_ms: 11000,
      window_end_ms: 14000,
      trigger: 'player_death' as const,
    }
    expect(isWinDuelMoment(death)).toBe(false)
    expect(duelMomentKindLabel(death)).toBe('Death')
    expect(duelMomentTimestampLabel(death)).toBe('Death @ 0:12')

    const ace = {
      ...death,
      moment_id: 'kill-r2-12000',
      trigger: 'player_kill' as const,
      kill_count: 5,
    }
    expect(isWinDuelMoment(ace)).toBe(true)
    expect(duelMomentKindLabel(ace)).toBe('Ace')
    expect(duelMomentTimestampLabel(ace)).toBe('Ace @ 0:12')
    expect(duelMomentScrubberTitle({ ...ace, callout: 'A Site' })).toBe(
      'R2 · Ace · A Site · 5 kills',
    )
  })
})
