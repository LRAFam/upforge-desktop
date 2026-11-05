import { describe, expect, it } from 'vitest'
import { CATEGORY_TO_TRAINER_SCENARIO, isNonTrainerCategory, resolveTrainerScenario } from './trainer-scenarios'
import { pickTrainingScenario } from './training-drills'

describe('resolveTrainerScenario', () => {
  it('mirrors the API category defaults', () => {
    expect(CATEGORY_TO_TRAINER_SCENARIO).toEqual({
      mechanics: 'flick', crosshair_placement: 'head_height', game_sense: 'switching', positioning: 'duel',
    })
    expect(resolveTrainerScenario({ category: 'crosshair_placement' })).toBe('head_height')
    expect(resolveTrainerScenario({ category: 'positioning' })).toBe('duel')
  })
  it('has no trainer drill for utility, economy or comms', () => {
    for (const category of ['utility_usage', 'economy', 'communication']) {
      expect(isNonTrainerCategory(category)).toBe(true)
      expect(resolveTrainerScenario({ category, trainer_scenario: null, godot_config: null })).toBeNull()
      // Older API responses guessed godot_config.scenario from the category
      expect(resolveTrainerScenario({ category, godot_config: { scenario: 'flick' } })).toBeNull()
    }
  })
  it('lets an explicit coach scenario win', () => {
    expect(resolveTrainerScenario({ category: 'utility_usage', trainer_scenario: 'tracking' })).toBe('tracking')
    expect(resolveTrainerScenario({ category: 'positioning', trainer_scenario: 'strafe_aim' })).toBe('strafe_aim')
  })
  it('never falls back to Flick', () => {
    expect(resolveTrainerScenario({})).toBeNull()
    expect(resolveTrainerScenario({ category: 'agent_specific', trainer_scenario: 'not_a_drill' })).toBeNull()
  })
})

describe('pickTrainingScenario', () => {
  it('does not map utility / economy / comms text to Flick via the category defaults', () => {
    expect(Object.keys(CATEGORY_TO_TRAINER_SCENARIO)).not.toContain('utility_usage')
    expect(pickTrainingScenario('game sense')).toBe('switching')
  })
})

describe('beta drills', () => {
  it('are registered, launchable and never auto-picked', async () => {
    const { BETA_SCENARIO_KEYS, RADAR_SCENARIO_KEYS, TRAINER_SCENARIO_KEYS, isBetaScenario, trainerScenarioDef } = await import('./trainer-scenarios')
    const beta = ['hold_angle', 'jiggle_peek', 'trade_window', 'clear_site', 'flash_swing', 'operator_hold', 'defuse_decision', 'retake_crossfire']
    expect(BETA_SCENARIO_KEYS).toEqual(beta)
    for (const key of beta) {
      expect(TRAINER_SCENARIO_KEYS).toContain(key)
      expect(isBetaScenario(key)).toBe(true)
      expect(trainerScenarioDef(key)).toMatchObject({ uiGroup: 'duel', radar: false, beta: true })
      expect(RADAR_SCENARIO_KEYS).not.toContain(key)
      expect(Object.values(CATEGORY_TO_TRAINER_SCENARIO)).not.toContain(key)
    }
    expect(isBetaScenario('flick')).toBe(false)
    // A coach-picked beta drill is still honoured if sent explicitly; categories never resolve to one.
    expect(resolveTrainerScenario({ category: 'positioning' })).toBe('duel')
    expect(resolveTrainerScenario({ trainer_scenario: 'clear_site' })).toBe('clear_site')
  })
  it('hides Valorant-only drills from other games’ pickers but still resolves them by key', async () => {
    const { isScenarioForGame, trainerScenariosForGame, trainerScenarioDef } = await import('./trainer-scenarios')
    const valorantOnly = ['flash_swing', 'operator_hold', 'defuse_decision', 'retake_crossfire']
    for (const key of valorantOnly) {
      expect(trainerScenarioDef(key)?.games).toEqual(['valorant'])
      expect(isScenarioForGame(key, 'valorant')).toBe(true)
      expect(isScenarioForGame(key, 'cs2')).toBe(false)
      expect(isScenarioForGame(key, 'deadlock')).toBe(false)
    }
    const cs2Keys = trainerScenariosForGame('cs2').map(s => s.key)
    expect(cs2Keys).toContain('hold_angle')
    expect(cs2Keys).toContain('flick')
    for (const key of valorantOnly) expect(cs2Keys).not.toContain(key)
    expect(trainerScenariosForGame('valorant').map(s => s.key)).toEqual(expect.arrayContaining(valorantOnly))
  })
})
