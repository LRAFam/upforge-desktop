import { describe, it, expect } from 'vitest'
import { scoreGrade, scoreLabel, scoreGradeBadgeClass } from './analysis-scoring'

const BANDS = {
  S: { label: 'Outstanding', badge: 'bg-amber-500/20 text-amber-300 border border-amber-500/30' },
  A: { label: 'Strong Game', badge: 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' },
  B: { label: 'Solid', badge: 'bg-blue-500/20 text-blue-300 border border-blue-500/30' },
  C: { label: 'Room to Improve', badge: 'bg-yellow-500/20 text-yellow-300 border border-yellow-500/30' },
  D: { label: 'Below Average', badge: 'bg-orange-500/20 text-orange-300 border border-orange-500/30' },
  E: { label: 'Lots to Work On', badge: 'bg-red-500/20 text-red-400 border border-red-500/30' },
} as const

type Grade = keyof typeof BANDS

const cases: Array<[number, Grade]> = [
  [100, 'S'],
  [90, 'S'],
  [89, 'A'],
  [78, 'A'],
  [77, 'B'],
  [65, 'B'],
  [64, 'C'],
  [50, 'C'],
  [49, 'D'],
  [35, 'D'],
  [34, 'E'],
  [0, 'E'],
  [-1, 'E'],
  [-100, 'E'],
]

describe('analysis scoring helpers', () => {
  it.each(cases)('score %s maps to grade %s with matching label and badge', (score, grade) => {
    expect(scoreGrade(score)).toBe(grade)
    expect(scoreLabel(score)).toBe(BANDS[grade].label)
    expect(scoreGradeBadgeClass(score)).toBe(BANDS[grade].badge)
  })

  it('treats fractional scores just under a threshold as the lower band', () => {
    expect(scoreGrade(89.9)).toBe('A')
    expect(scoreGrade(34.99)).toBe('E')
  })

  it('current behaviour: NaN falls through to the lowest band', () => {
    expect(scoreGrade(NaN)).toBe('E')
    expect(scoreLabel(NaN)).toBe('Lots to Work On')
    expect(scoreGradeBadgeClass(NaN)).toBe(BANDS.E.badge)
  })
})
