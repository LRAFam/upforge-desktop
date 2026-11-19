import { describe, expect, it } from 'vitest'
import { buildTrainingSessionPayload, correlationInsightsFrom, drillConfigFromRequest, drillGameParams, withLaunchGame } from './trainer-payload'
import type { DrillConfig } from './trainer-bridge'
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
  it('stamps the app and trainer version that produced the run', () => {
    const payload = buildTrainingSessionPayload(result, null, { app_version: '3.4.22', trainer_version: '1.13.0' })
    expect(payload.metadata).toMatchObject({ app_version: '3.4.22', trainer_version: '1.13.0', scoring_version: 3 })
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
  it('sends the saved V-Sync and frame cap (renderer copies ignored)', () => {
    const cfg = drillConfigFromRequest({ scenario: 'flick', mouse_settings: { vsync: false, max_fps: 30 } },
      { ...settings, trainerMouse: { ...DEFAULT_TRAINER_MOUSE, vsync: true, maxFps: 144 } })
    expect(cfg.mouse_settings).toMatchObject({ vsync: true, max_fps: 144 })
    expect(drillConfigFromRequest({ scenario: 'flick' }, settings).mouse_settings).toMatchObject({ vsync: false, max_fps: 360 })
  })
  it('asks for the drill’s guided lesson only when the player asked to see it again', () => {
    expect(drillConfigFromRequest({ scenario: 'hold_angle', lesson: true }, settings).lesson).toBe(true)
    // Anything else leaves it to the trainer (a lesson runs the first time on this PC).
    for (const lesson of [false, 'true', 1, null, undefined]) {
      expect('lesson' in drillConfigFromRequest({ scenario: 'hold_angle', lesson }, settings), String(lesson)).toBe(false)
    }
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

describe('drillGameParams', () => {
  it('sends ?game= for a known game only', () => {
    expect(drillGameParams('cs2')).toEqual({ params: { game: 'cs2' } })
    expect(drillGameParams('lol')).toEqual({ params: { game: 'lol' } })
    expect(drillGameParams(undefined)).toEqual({})
    expect(drillGameParams('apex')).toEqual({})
    expect(drillGameParams(3)).toEqual({})
  })
})

describe('withLaunchGame', () => {
  it('stamps the game the drill was launched with so scores are compared per game', () => {
    const config = { mouse_settings: { game: 'cs2' } } as Pick<DrillConfig, 'mouse_settings'>
    expect(withLaunchGame(result, config).metadata?.game).toBe('cs2')
    expect((result.metadata as Record<string, unknown>).game).toBeUndefined() // input untouched
    expect(withLaunchGame({ ...result, metadata: { ...result.metadata, game: 'valorant' } }, config).metadata?.game).toBe('valorant')
    expect(withLaunchGame(result, {}).metadata?.game).toBeUndefined()
  })
})
