import { describe, expect, it } from 'vitest'
import {
  benchmarkMeta,
  benchmarkVisible,
  deltaTone,
  hitsLabel,
  isBest,
  pct,
  recentScores,
  signed,
  toneColor,
  trendSummary,
} from './practice-session-v3'

describe('practice-session-v3 helpers', () => {
  it('signs and tones deltas', () => {
    expect(signed(5)).toBe('+5')
    expect(signed(-3)).toBe('-3')
    expect(signed(0)).toBe('0')
    expect(deltaTone(4)).toBe('win')
    expect(deltaTone(-1)).toBe('loss')
    expect(deltaTone(0)).toBeUndefined()
    expect(deltaTone(null)).toBeUndefined()
    expect(toneColor('win')).toBe('var(--uf-win)')
    expect(toneColor(undefined)).toBeUndefined()
  })

  it('keeps the ±2 point dead zone for trends', () => {
    expect(trendSummary(null)).toBeNull()
    expect(trendSummary(1.5)).toEqual({ text: 'Steady', tone: undefined })
    expect(trendSummary(3.25)).toEqual({ text: 'Up 3.3 pts', tone: 'win' })
    expect(trendSummary(-4)).toEqual({ text: 'Down 4.0 pts', tone: 'loss' })
  })

  it('shows benchmarks only with 5+ peers', () => {
    const b = { user_best: 70, global_avg: 60, percentile: 80, label: 'Top 20%', peers: 4 }
    expect(benchmarkVisible(b)).toBe(false)
    expect(benchmarkVisible(null)).toBe(false)
    expect(benchmarkVisible({ ...b, peers: 5 })).toBe(true)
    expect(benchmarkMeta({ ...b, peers: 12, comparison: { difficulty: 'medium', duration_seconds: 60 } })).toBe('12 players · medium · 60s')
    expect(benchmarkMeta({ ...b, peers: 12 })).toBe('12 players')
  })

  it('orders recent scores oldest to newest', () => {
    const sessions = [{ score: 9 }, { score: 8 }, { score: 7 }]
    expect(recentScores(sessions, 2)).toEqual([8, 9])
    expect(recentScores(undefined)).toEqual([])
  })

  it('formats small values', () => {
    expect(hitsLabel(34, 6)).toBe('34/40')
    expect(isBest(1)).toBe(true)
    expect(isBest(2)).toBe(false)
    expect(pct(140)).toBe(100)
    expect(pct(-2)).toBe(0)
    expect(pct(null)).toBe(0)
    expect(pct(Number.NaN)).toBe(0)
  })
})
