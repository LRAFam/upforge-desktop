import { describe, expect, it } from 'vitest'
import { buildTrainingSessionPayload, correlationInsightsFrom, drillConfigFromRequest } from './trainer-payload'
import { DEFAULT_CROSSHAIR_SETTINGS, DEFAULT_TRAINER_MOUSE } from './trainer-settings'

const result = {
  scenario: 'tracking', duration_seconds: 60, score: 55, accuracy_pct: 40, avg_reaction_ms: 0, consistency_score: 0,
  targets_hit: 0, targets_missed: 0, heatmap: [], completed_at: '2026-11-04T12:00:00',
  targets_per_minute: 0, metadata: { scoring_version: 3, difficulty: 'medium', on_target_ms: 24000, tracked_ms: 58000, pauses: 1 },
}

describe('buildTrainingSessionPayload', () => {
  it('attributes the run to the launch’s user drill and keeps the v3 metadata', () => {
    const payload = buildTrainingSessionPayload(result, { difficulty: 'medium', user_drill_id: 12 })
    expect(payload).toMatchObject({ targets_hit: 0, targets_missed: 0 })
    expect(payload.metadata).toEqual({
      scoring_version: 3, difficulty: 'medium', on_target_ms: 24000, tracked_ms: 58000, pauses: 1,
      targets_per_minute: 0, user_drill_id: 12,
    })
  })
  it('never sends a user_drill_id for free play', () => {
    const payload = buildTrainingSessionPayload({ ...result, metadata: { ...result.metadata, user_drill_id: 99 } }, { difficulty: 'medium' })
    expect((payload.metadata as Record<string, unknown>).user_drill_id).toBeUndefined()
    expect((buildTrainingSessionPayload(result, null).metadata as Record<string, unknown>).user_drill_id).toBeUndefined()
  })
})

describe('drillConfigFromRequest', () => {
  const settings = { trainerMouse: DEFAULT_TRAINER_MOUSE, crosshairSettings: DEFAULT_CROSSHAIR_SETTINGS }
  it('uses saved settings, not renderer copies, and keeps user_drill_id', () => {
    const cfg = drillConfigFromRequest({ scenario: 'flick', duration_seconds: 90, difficulty: 'hard', user_drill_id: 5,
      mouse_settings: { dpi: 1 }, crosshair_settings: { color: [0, 0, 0] } }, settings)
    expect(cfg).toMatchObject({ scenario: 'flick', duration_seconds: 90, difficulty: 'hard', user_drill_id: 5 })
    expect(cfg.mouse_settings?.dpi).toBe(800)
    expect(cfg.crosshair_settings?.color).toEqual([0.0, 1.0, 0.42])
  })
  it('accepts the old `duration` key and drops a bad user_drill_id', () => {
    const cfg = drillConfigFromRequest({ scenario: 'flick', duration: 60, user_drill_id: 'x' }, settings)
    expect(cfg.duration_seconds).toBe(60)
    expect(cfg.difficulty).toBe('medium')
    expect('user_drill_id' in cfg).toBe(false)
  })
  it('sends the saved scoped sensitivity multiplier as mouse_settings.scoped_multiplier', () => {
    const cfg = drillConfigFromRequest({ scenario: 'operator_hold', mouse_settings: { scoped_multiplier: 2 } },
      { ...settings, trainerMouse: { ...DEFAULT_TRAINER_MOUSE, scopedMultiplier: 0.8 } })
    expect(cfg.scenario).toBe('operator_hold')
    expect(cfg.mouse_settings?.scoped_multiplier).toBe(0.8)
    expect(drillConfigFromRequest({ scenario: 'operator_hold' }, settings).mouse_settings?.scoped_multiplier).toBe(1)
  })
})

describe('correlationInsightsFrom', () => {
  it('reads { insights } from the API and tolerates an array', () => {
    expect(correlationInsightsFrom({ insights: ['a', 'b'] })).toEqual(['a', 'b'])
    expect(correlationInsightsFrom(['c'])).toEqual(['c'])
    expect(correlationInsightsFrom(null)).toEqual([])
    expect(correlationInsightsFrom({ insights: 'x' })).toEqual([])
  })
})
