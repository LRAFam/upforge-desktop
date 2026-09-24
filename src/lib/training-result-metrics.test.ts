import { describe, expect, it } from 'vitest'
import { priorTrainingSessions, reactionMetricScore, trainingTimestamp, trainingComparisonRequest } from './training-result-metrics'
describe('training result measurements', () => {
  it('compares the last completed run whether the current run has synced or not', () => {
    const current = { scenario: 'flick', duration_seconds: 60, metadata: { difficulty: 'medium', scoring_version: 2 }, completed_at: '2026-09-24T12:00:00', score: 39 }
    const previous = { ...current, completed_at: '2026-09-24T11:00:00.000000Z', score: 38 }
    expect(priorTrainingSessions([previous], current)).toEqual([previous])
    expect(priorTrainingSessions([{ ...current, completed_at: current.completed_at + 'Z' }, previous], current)).toEqual([previous])
    expect(priorTrainingSessions([current], current)).toEqual([])
  })
  it('excludes legacy, different difficulty, duration and drill from comparisons', () => {
    const current = { scenario: 'flick', duration_seconds: 60, metadata: { difficulty: 'medium', scoring_version: 2 }, completed_at: '2026-09-24T12:00:00Z' }
    const previous = { ...current, completed_at: '2026-09-24T11:00:00Z' }
    expect(priorTrainingSessions([
      previous, { ...previous, metadata: undefined }, { ...previous, duration_seconds: 120 },
      { ...previous, scenario: 'sixshot' }, { ...previous, metadata: { difficulty: 'hard', scoring_version: 2 } },
      { ...previous, metadata: { difficulty: 'medium', scoring_version: 1 } },
    ], current)).toEqual([previous])
    expect(trainingComparisonRequest({ ...current, metadata: {} })).toBeNull()
    expect(priorTrainingSessions([previous], { ...current, metadata: undefined })).toEqual([])
  })
  it('uses the same reaction benchmark as the trainer', () => {
    expect([150, 300, 400, 900].map(reactionMetricScore)).toEqual([100, 40, 0, 0])
  })
  it('interprets Godot UTC times independently of local timezone', () => {
    expect(trainingTimestamp('2026-09-24T12:00:00')).toBe(Date.parse('2026-09-24T12:00:00Z'))
  })
})
