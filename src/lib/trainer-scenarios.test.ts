import { describe, expect, it, vi } from 'vitest'
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

  it('hides Head Height and Strafe Aim for Deadlock (Valorant / CS2 only, as on the API)', async () => {
    const { isScenarioForGame } = await import('./trainer-scenarios')
    for (const key of ['head_height', 'strafe_aim']) {
      expect(isScenarioForGame(key, 'valorant')).toBe(true)
      expect(isScenarioForGame(key, 'cs2')).toBe(true)
      expect(isScenarioForGame(key, 'deadlock')).toBe(false)
    }
    expect(isScenarioForGame('strafe_track', 'deadlock')).toBe(true)
  })
})

describe('retired drills', () => {
  it('stay launchable and resolvable for history but leave the drill pickers', async () => {
    const real = (await import('./trainer-scenarios.manifest.json')).default
    vi.resetModules()
    vi.doMock('./trainer-scenarios.manifest.json', () => ({
      default: { ...real, scenarios: real.scenarios.map(s => (s.key === 'microflick' ? { ...s, retired: true } : s)) },
    }))
    try {
      const lib = await import('./trainer-scenarios')
      expect(lib.trainerScenarioDef('microflick')?.retired).toBe(true)
      expect(lib.LAUNCHABLE_SCENARIO_KEYS).toContain('microflick')
      expect(lib.trainerScenariosForGame('valorant').map(s => s.key)).not.toContain('microflick')
      expect(lib.trainerScenariosForGame('valorant').map(s => s.key)).toContain('flick')
    } finally {
      vi.doUnmock('./trainer-scenarios.manifest.json')
      vi.resetModules()
    }
  })

  it('none are retired in the bundled list', async () => {
    const { TRAINER_SCENARIOS } = await import('./trainer-scenarios')
    expect(TRAINER_SCENARIOS.filter(s => s.retired)).toEqual([])
  })
})

describe('drill list contract (API manifest)', () => {
  it('has desktop copy for every API drill and no drill the API does not list', async () => {
    const { TRAINER_MANIFEST, DRILL_COPY, TRAINER_SCENARIO_KEYS } = await import('./trainer-scenarios')
    const apiKeys = TRAINER_MANIFEST.scenarios.map(s => s.key)
    expect(TRAINER_MANIFEST.version).toBe(1)
    expect(Object.keys(DRILL_COPY).sort()).toEqual([...apiKeys].sort())
    expect(TRAINER_SCENARIO_KEYS).toEqual(apiKeys)
  })
  it('takes labels, groups and flags from the manifest only', async () => {
    const { TRAINER_MANIFEST, trainerScenarioDef } = await import('./trainer-scenarios')
    for (const s of TRAINER_MANIFEST.scenarios) {
      const def = trainerScenarioDef(s.key)
      expect(def).toMatchObject({ label: s.label, uiGroup: s.ui_group, radar: s.radar, vodCategories: s.categories })
      expect(!!def?.beta).toBe(s.beta)
      expect(def?.games ?? null).toEqual(s.games)
      expect(['aim', 'reaction', 'precision', 'duel']).toContain(s.ui_group)
    }
  })
})
