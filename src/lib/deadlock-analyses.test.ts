import { describe, expect, it } from 'vitest'
import { mapDeadlockToAnalysisItem } from './deadlock-analyses'

describe('mapDeadlockToAnalysisItem', () => {
  it('puts the 1–10 coach rating on the shared 0–100 scale and reads the result', () => {
    const item = mapDeadlockToAnalysisItem({
      id: 1, job_id: 'j', status: 'completed', hero: 'Haze', player_name: null, match_result: 'win',
      duration_minutes: 30, overall_rating: 6.5, kd_ratio: 2, kills: 10, deaths: 5, assists: 8,
    } as Parameters<typeof mapDeadlockToAnalysisItem>[0])
    expect(item.overall_score).toBe(65)
    expect(item.won).toBe(true)
  })
})
