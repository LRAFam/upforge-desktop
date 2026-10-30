import { describe, expect, it } from 'vitest'
import { matchRowSummary, relativeTime } from './match-row'

describe('matchRowSummary', () => {
  it('uses the final score and stats when present', () => {
    const s = matchRowSummary({ timeline: { finalScore: { allyScore: 9, enemyScore: 13 }, finalStats: { kills: 11, deaths: 18, assists: 3, score: null, headshotPct: null, won: false } } })
    expect(s).toEqual({ result: 'loss', score: '9–13', kda: '11/18/3' })
  })
  it('derives the result from the score only when the stats do not say', () => {
    expect(matchRowSummary({ timeline: { finalScore: { allyScore: 13, enemyScore: 8 } } }).result).toBe('win')
    expect(matchRowSummary({ timeline: { finalScore: { allyScore: 12, enemyScore: 12 } } }).result).toBeNull()
  })
  it('never invents data when the timeline is missing', () => {
    expect(matchRowSummary({ timeline: null })).toEqual({ result: null, score: null, kda: null })
  })
})

describe('relativeTime', () => {
  const now = Date.UTC(2026, 9, 30, 12, 0)
  it('formats recent times compactly', () => {
    expect(relativeTime(now - 20_000, now)).toBe('Just now')
    expect(relativeTime(now - 12 * 60_000, now)).toBe('12m ago')
    expect(relativeTime(now - 3 * 3_600_000, now)).toBe('3h ago')
    expect(relativeTime(now - 2 * 86_400_000, now)).toBe('2d ago')
    expect(relativeTime(0, now)).toBe('')
  })
})

describe('cloud-only rows (round 7)', () => {
  it('show the score the cloud inventory carries', async () => {
    const { mergeFootage } = await import('../../../lib/footage-library')
    const rows = mergeFootage([], [{ id: 'a1', kind: 'recording', title: null, map: 'Summit', status: 'archived', bytes: 1, expires_at: null, created_at: '2026-10-30T10:00:00Z', analysis_id: 7, analysis: { won: true, rounds_won: 13, rounds_lost: 10, kills: 29, deaths: 15, assists: 8 } }])
    expect(rows[0]).toMatchObject({ cloudOnly: true, analysisId: 7 })
    const { matchRowSummary } = await import('./match-row')
    expect(matchRowSummary(rows[0], rows[0].cloudFile?.analysis)).toEqual({ result: 'win', score: '13–10', kda: '29/15/8' })
  })
  it('leave older inventories without analysis untouched', async () => {
    const { mergeFootage } = await import('../../../lib/footage-library')
    const rows = mergeFootage([], [{ id: 'a2', kind: 'recording', title: null, map: null, status: 'archived', bytes: 1, expires_at: null, created_at: '2026-10-30T10:00:00Z' }])
    expect(rows[0].analysisId).toBeUndefined()
  })
})
