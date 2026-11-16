import { describe, expect, it } from 'vitest'
import { isNonTrainerCategory, resolveTrainerScenario } from './trainer-scenarios'

describe('resolveTrainerScenario', () => {
  it('never guesses a drill from the category: only the API launch config counts', () => {
    for (const category of ['mechanics', 'crosshair_placement', 'game_sense', 'positioning']) {
      expect(resolveTrainerScenario({ category })).toBeNull()
    }
    expect(resolveTrainerScenario({ category: 'crosshair_placement', godot_config: { scenario: 'head_height' } })).toBe('head_height')
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
    }
    expect(isBetaScenario('flick')).toBe(false)
    // A coach-picked beta drill is still honoured if sent explicitly; categories never resolve to one.
    expect(resolveTrainerScenario({ category: 'positioning' })).toBeNull()
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
