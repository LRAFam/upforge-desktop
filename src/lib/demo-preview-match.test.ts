import { describe, expect, it } from 'vitest'
import { assessDemoPreviewMatch } from './demo-preview-match'

describe('assessDemoPreviewMatch', () => {
  it('flags map mismatch', () => {
    const result = assessDemoPreviewMatch(
      { ok: true, map: 'de_dust2', kills: 10, deaths: 8, allyScore: 13, enemyScore: 11, won: true },
      { map: 'de_mirage', kills: null, deaths: null, allyScore: null, enemyScore: null },
    )
    expect(result.confidence).toBe('mismatch')
  })

  it('strong match when map and kda align', () => {
    const result = assessDemoPreviewMatch(
      { ok: true, map: 'de_mirage', kills: 18, deaths: 12, allyScore: 13, enemyScore: 10, won: true },
      { map: 'de_mirage', kills: 18, deaths: 12, allyScore: 13, enemyScore: 10 },
    )
    expect(result.confidence).toBe('strong')
  })

  it('handles identity warning with map match', () => {
    const result = assessDemoPreviewMatch(
      {
        ok: true,
        map: 'de_dust2',
        kills: null,
        deaths: null,
        allyScore: 13,
        enemyScore: 11,
        won: true,
        identityWarning: 'Set Steam name',
        totalKillEvents: 42,
      },
      { map: 'de_dust2', kills: null, deaths: null, allyScore: null, enemyScore: null },
    )
    expect(result.confidence).toBe('possible')
    expect(result.headline).toContain('Steam name')
  })

  it('flags partial header-only preview when still downloading', () => {
    const result = assessDemoPreviewMatch(
      {
        ok: true,
        map: 'de_dust2',
        kills: null,
        deaths: null,
        allyScore: 0,
        enemyScore: 0,
        won: null,
        partialParse: true,
        likelyIncomplete: true,
      },
      { map: 'de_dust2', kills: null, deaths: null, allyScore: null, enemyScore: null },
    )
    expect(result.confidence).toBe('weak')
    expect(result.headline).toContain('downloading')
  })

  it('flags parse failure on a complete-looking file', () => {
    const result = assessDemoPreviewMatch(
      {
        ok: true,
        map: 'de_dust2',
        kills: null,
        deaths: null,
        allyScore: 0,
        enemyScore: 0,
        won: null,
        partialParse: true,
        likelyIncomplete: false,
        error: 'Could not fully parse this replay',
      },
      { map: 'de_dust2', kills: null, deaths: null, allyScore: null, enemyScore: null },
    )
    expect(result.headline).toContain('Could not read')
    expect(result.headline).not.toContain('downloading')
  })
})
