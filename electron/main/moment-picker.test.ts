import { describe, expect, it } from 'vitest'
import {
  DUEL_WINDOW_AFTER_MS,
  DUEL_WINDOW_BEFORE_MS,
  MAX_DUEL_MOMENTS,
  pickDuelMoments,
} from './moment-picker'
import type { MatchData } from './riot-types'

function death(round: number, offsetMs: number, isolated = false, callout = 'A Site') {
  return {
    round,
    videoOffsetMs: offsetMs,
    spatial: { isolated, callout, alliesNearby: isolated ? 0 : 2 },
  }
}

describe('moment-picker', () => {
  it('returns empty when no deaths', () => {
    expect(pickDuelMoments(null)).toEqual([])
    expect(pickDuelMoments({ playerDeaths: [] } as unknown as MatchData)).toEqual([])
  })

  it('builds 10s windows and caps at MAX_DUEL_MOMENTS', () => {
    const deaths = Array.from({ length: 12 }, (_, i) => death(i, 60_000 + i * 30_000))
    const timeline = { playerDeaths: deaths } as unknown as MatchData
    const moments = pickDuelMoments(timeline)
    expect(moments.length).toBe(MAX_DUEL_MOMENTS)
    expect(moments[0].window_start_ms).toBe(60_000 - DUEL_WINDOW_BEFORE_MS)
    expect(moments[0].window_end_ms).toBe(60_000 + DUEL_WINDOW_AFTER_MS)
    expect(moments[0].trigger).toBe('player_death')
  })

  it('prioritises isolated deaths and repeat callouts', () => {
    const timeline = {
      playerDeaths: [
        death(0, 10_000, false, 'Mid'),
        death(1, 50_000, true, 'A Site'),
        death(2, 90_000, false, 'A Site'),
        death(3, 130_000, false, 'B Site'),
      ],
    } as unknown as MatchData

    const moments = pickDuelMoments(timeline, 2)
    expect(moments.map((m) => m.video_offset_ms)).toContain(50_000)
    expect(moments.map((m) => m.video_offset_ms)).toContain(90_000)
  })
})
