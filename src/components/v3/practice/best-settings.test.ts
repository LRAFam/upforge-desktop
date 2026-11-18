import { describe, expect, it } from 'vitest'
import { bestForSettings, bestGroup, sameSettings, settingsLabel } from './best-settings'

const run = (score: number, difficulty: string, duration = 60, version = 3) =>
  ({ scenario: 'flick', score, duration_seconds: duration, metadata: { difficulty, scoring_version: version } })

describe('best settings', () => {
  it('reads the comparison group and labels it', () => {
    const g = bestGroup({ difficulty: 'easy', duration_seconds: 30, scoring_version: 3 })
    expect(g).toEqual({ difficulty: 'easy', duration_seconds: 30 })
    expect(settingsLabel(g)).toBe('Easy · 30 s')
    expect(bestGroup(null)).toBeNull()
    expect(bestGroup({ difficulty: 'weird', duration_seconds: 30 })).toBeNull()
  })

  it('keeps the API best and rank when the row launches the same settings', () => {
    const group = { difficulty: 'medium', duration_seconds: 60 }
    expect(bestForSettings('flick', group, group, 80, 4, [], 3)).toEqual({ best: 80, rank: 4 })
  })

  it('never shows an Easy · 30 s best or rank beside a Medium · 1 min row', () => {
    const row = { difficulty: 'medium', duration_seconds: 60 }
    const easyGroup = { difficulty: 'easy', duration_seconds: 30 }
    expect(sameSettings(row, easyGroup)).toBe(false)
    const runs = [run(90, 'easy', 30), run(61, 'medium'), run(70, 'medium'), run(99, 'medium', 60, 2), { ...run(95, 'medium'), scenario: 'gridshot' }]
    expect(bestForSettings('flick', row, easyGroup, 90, 1, runs, 3)).toEqual({ best: 70, rank: null })
    expect(bestForSettings('flick', row, easyGroup, 90, 1, [run(90, 'easy', 30)], 3)).toEqual({ best: null, rank: null })
  })
})
