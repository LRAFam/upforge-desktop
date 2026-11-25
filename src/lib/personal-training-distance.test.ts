import { describe, expect, it } from 'vitest'
import { trainingComparisonModel, trainingComparisonRequest, comparableTrainingRuns, currentScoringVersion } from './training-result-metrics'
import { bumpDifficultyForProgression } from './structured-session'
import { trainerLaunchConfig, launchConfigFromInfo } from './trainer-launch'
import { personalDistanceCapability } from './trainer-capabilities'
import { drillReadConfig, drillConfigFromRequest } from '../../electron/main/trainer-payload'

const fixed = { scenario: 'head_height', duration_seconds: 60, completed_at: '2026-11-24T10:00:00Z', metadata: { game: 'valorant', difficulty: 'medium', scoring_version: 7, movement: 'valorant_v1', run_speed_mps: 5.4 } }
const personal = (pair: unknown = [14.123456789012345, 22]) => ({ ...fixed, metadata: { ...fixed.metadata, layout: 'personalized_distance_v1', distances_m: pair } })
describe('personal distance comparisons', () => {
  it('partitions exact pairs without rounding them into a fixed model', () => {
    expect(trainingComparisonModel(personal().metadata)).toBe('game=valorant;movement=valorant_v1;run_speed_mps=5.4;layout=personalized_distance_v1;distances_m=14.123456789012344,22')
    expect(comparableTrainingRuns(fixed, personal())).toBe(false)
    expect(comparableTrainingRuns(personal([14, 22]), personal([14, 22]))).toBe(true)
    expect(comparableTrainingRuns(personal([14.001, 22]), personal([14.002, 22]))).toBe(false)
  })
  it('rejects malformed personal metadata instead of treating it as fixed', () => {
    for (const pair of [null, [14], [14, 14], [4, 22], [14, 41], ['14', 22], [14, NaN]]) expect(trainingComparisonRequest(personal(pair))).toBeNull()
    expect(trainingComparisonRequest({ ...personal(), scenario: 'flick' })).toBeNull()
    expect(trainingComparisonRequest({ ...personal(), metadata: { ...personal().metadata, game: 'cs2' } })).toBeNull()
  })
  it('does not advance a fixed drill from good scores on a personalized layout', () => {
    const rows = Array.from({ length: 3 }, () => ({ ...personal([14, 22]), metadata: { ...personal([14, 22]).metadata, scoring_version: currentScoringVersion('head_height') }, score: 100 }))
    expect(bumpDifficultyForProgression('head_height', 'medium', rows, 60)).toBe('medium')
  })
})
describe('personal distance launch contract', () => {
  it('preserves a plain pair through renderer and replay config', () => {
    const req = { scenario: 'head_height', duration_seconds: 60, difficulty: 'medium', user_drill_id: 5, distances_m: [14, 22] as [number, number] }
    const config = trainerLaunchConfig(req)
    expect(config).toHaveProperty('distances_m', [14, 22])
    expect(launchConfigFromInfo({ ...req, launchId: 2 })).toHaveProperty('distances_m', [14, 22])
    expect(config.distances_m).not.toBe(req.distances_m)
  })
  it('main sends the exact pair only to a supported Valorant scenario', () => {
    const settings = { trainerMouse: { game: 'valorant', dpi: 800, sensitivity: .4, fov: 103 } }
    expect(drillConfigFromRequest({ scenario: 'head_height', distances_m: [14, 22] }, settings as never, '1.15.0', { personalDistanceCapability: 'v1' })).toHaveProperty('distances_m', [14, 22])
    for (const scenario of ['flick', 'angle_clearing']) expect(() => drillConfigFromRequest({ scenario, distances_m: [14, 22] }, settings as never)).toThrow(/distances_m/)
    expect(() => drillConfigFromRequest({ scenario: 'head_height', distances_m: [14, 22] }, { trainerMouse: { ...settings.trainerMouse, game: 'cs2' } } as never)).toThrow(/distances_m/)
    for (const pair of [[14], [14, 14], ['14', 22], [4, 22], [14, 41]]) expect(() => drillConfigFromRequest({ scenario: 'head_height', distances_m: pair }, settings as never)).toThrow(/distances_m/)
  })
})

  it('requires explicit verified bundled capability and never guesses from version', () => {
    expect(personalDistanceCapability({})).toBeUndefined()
    expect(personalDistanceCapability({ capabilities: { personalized_distance_v1: 'true' } })).toBeUndefined()
    expect(personalDistanceCapability({ capabilities: { personalized_distance_v1: true } })).toBe('v1')
    expect(drillReadConfig('valorant').headers).not.toHaveProperty('X-Trainer-Personal-Distance')
    expect(drillReadConfig('valorant', 'v1').headers['X-Trainer-Personal-Distance']).toBe('v1')
    expect(() => drillConfigFromRequest({ scenario: 'head_height', distances_m: [14, 22] }, { trainerMouse: { game: 'valorant' } } as never)).toThrow(/verified trainer build/)
  })
  it('advances only from current scoring on the identical personal pair', () => {
    const rows = Array.from({ length: 3 }, () => ({ ...personal([14, 22]), metadata: { ...personal([14, 22]).metadata, scoring_version: currentScoringVersion('head_height') }, score: 100 }))
    expect(bumpDifficultyForProgression('head_height', 'medium', rows, 60, [14, 22])).toBe('hard')
    expect(bumpDifficultyForProgression('head_height', 'medium', rows, 60, [15, 22])).toBe('medium')
    expect(bumpDifficultyForProgression('head_height', 'medium', rows, 60)).toBe('medium')
  })
