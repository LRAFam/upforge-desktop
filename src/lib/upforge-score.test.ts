import { describe, expect, it } from 'vitest'
import { scoreTier } from './upforge-score'

describe('scoreTier', () => {
  it('never returns a letter grade', () => {
    for (const v of [0, 300, 500, 700, 900, 1000]) expect(scoreTier(v).label).not.toMatch(/^[A-FS]$/)
  })
  it('follows the API mapping (500 average, 650 top 16%, 850 top 1%)', () => {
    expect(scoreTier(500).tone).toBe('mid')
    expect(scoreTier(650).tone).toBe('good')
    expect(scoreTier(850).tone).toBe('top')
    expect(scoreTier(200).tone).toBe('low')
  })
})

describe('matchScore (stats-based, audit 2026-11-02)', () => {
  it('shows the API stats score as-is, never ×10', async () => {
    const { matchScore } = await import('./upforge-score')
    expect(matchScore({ upforge_score: 612, overall_score: 70 })).toMatchObject({ kind: 'stats', text: '612', caption: 'UpForge score' })
  })
  it('falls back to the coach rating out of 10, not under the UpForge name', async () => {
    const { matchScore } = await import('./upforge-score')
    expect(matchScore({ upforge_score: null, overall_score: 70 })).toMatchObject({ kind: 'coach', text: '7/10', caption: 'Coach rating' })
    expect(matchScore({ overall_score: 65 })?.text).toBe('6.5/10')
    expect(matchScore({})).toBeNull()
  })
  it('averages only stats scores', async () => {
    const { averageMatchScore } = await import('./upforge-score')
    expect(averageMatchScore([{ upforge_score: 600 }, { upforge_score: 400 }, { overall_score: 90 }])).toMatchObject({ value: 500, count: 2 })
    expect(averageMatchScore([{ overall_score: 90 }])).toBeNull()
  })
})
