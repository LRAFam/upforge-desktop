import { describe, expect, it } from 'vitest'
import { drillMeasure, drillMeasureTrends, measureSparkPath } from './training-result-metrics'

describe('drill measure (the number each drill is built on)', () => {
  it('shows Head Height placement error with its horizontal and vertical parts', () => {
    const m = drillMeasure({ scenario: 'head_height', metadata: { mean_placement_error_deg: 2.5, mean_horizontal_error_deg: 1.8, mean_vertical_error_deg: 1.2, placement_score: 70 } })
    expect(m?.measures).toEqual([{ label: 'Placement error', value: '2.50°' }])
    expect(m?.parts).toEqual([{ label: 'Horizontal', value: '1.80°' }, { label: 'Vertical', value: '1.20°' }])
  })
  it('returns null for older runs and drills without a measure', () => {
    expect(drillMeasure({ scenario: 'head_height', metadata: { mean_vertical_error_deg: 1.2 } })).toBeNull()
    expect(drillMeasure({ scenario: 'flick', metadata: { mean_placement_error_deg: 2 } })).toBeNull()
    expect(drillMeasure({ scenario: 'head_height' })).toBeNull()
  })
  it('shows Strafe Aim clean stops only when shots were taken', () => {
    expect(drillMeasure({ scenario: 'strafe_aim', metadata: { counter_strafe_rate_pct: 62.5, still_shots: 5, moving_shots: 3 } })?.measures)
      .toEqual([{ label: 'Clean stops', value: '63%' }])
    expect(drillMeasure({ scenario: 'strafe_aim', metadata: { counter_strafe_rate_pct: 0, still_shots: 0, moving_shots: 0 } })).toBeNull()
  })
  it('shows 3D Duel moving and still accuracy, leaving out a side with no shots', () => {
    const both = drillMeasure({ scenario: 'duel', metadata: { moving_accuracy_pct: 40, still_accuracy_pct: 75.4, shots_while_moving: 10, shots_while_still: 12 } })
    expect(both?.measures).toEqual([{ label: 'Moving accuracy', value: '40%' }, { label: 'Still accuracy', value: '75%' }])
    const stillOnly = drillMeasure({ scenario: 'duel', metadata: { moving_accuracy_pct: 0, still_accuracy_pct: 50, shots_while_moving: 0, shots_while_still: 4 } })
    expect(stillOnly?.measures).toEqual([{ label: 'Still accuracy', value: '50%' }])
  })
  it('trends the last 10 measured values, oldest first', () => {
    const runs = Array.from({ length: 13 }, (_, i) => ({
      completed_at: `2026-11-${String(i + 1).padStart(2, '0')}T10:00:00Z`,
      metadata: i === 12 ? {} : { mean_placement_error_deg: i },
    })).reverse()
    const [trend] = drillMeasureTrends('head_height', runs)
    expect(trend.label).toBe('Placement error')
    expect(trend.values).toEqual([2, 3, 4, 5, 6, 7, 8, 9, 10, 11])
    expect(trend.texts[0]).toBe('2.00°')
    expect(drillMeasureTrends('flick', runs)).toEqual([])
  })
  it('draws a trend line only from two values', () => {
    expect(measureSparkPath([1], 80, 20)).toBe('')
    expect(measureSparkPath([1, 3], 80, 20)).toBe('M 0.0,20.0 L 80.0,0.0')
  })
})
