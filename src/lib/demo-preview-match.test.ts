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
})
