import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { crosshairSettingsToGodot, mergeTrainerMouse, normalizeCrosshairSettings, normalizeTrainerMouse, trainerMouseToGodot, trainerSpawnOptions } from './trainer-settings'

describe('trainer mouse settings', () => {
  it('fills a partial legacy save from defaults', () => {
    const ms = normalizeTrainerMouse({ dpi: 1600, sensitivity: 0.3 })
    expect(ms).toMatchObject({ dpi: 1600, sensitivity: 0.3, game: 'valorant', fov: 103, movementSpeed: 6.75, trainerVolume: 80 })
    expect(normalizeTrainerMouse(null).dpi).toBe(800)
  })
  it('defaults FOV per game, keeping a customised value', () => {
    expect(normalizeTrainerMouse({ game: 'cs2' }).fov).toBe(90)
    expect(normalizeTrainerMouse({ game: 'cs2', fov: 103 }).fov).toBe(90) // old universal default
    expect(normalizeTrainerMouse({ game: 'cs2', fov: 95 }).fov).toBe(95)
    expect(normalizeTrainerMouse({ game: 'deadlock' }).fov).toBe(103)
    expect(normalizeTrainerMouse({ game: 'valorant', fov: 90 }).fov).toBe(90)
  })
  it('converts to the Godot dict', () => {
    expect(trainerMouseToGodot({ game: 'cs2', sensitivity: 1.2, trainerVolume: 50 })).toEqual({
      dpi: 800, game: 'cs2', sensitivity: 1.2, fov: 90, movement_speed: 6.75, trainer_volume: 0.5, scoped_multiplier: 1,
      vsync: false, max_fps: 360,
    })
  })
  it('defaults, keeps and clamps the scoped sensitivity multiplier', () => {
    expect(normalizeTrainerMouse({}).scopedMultiplier).toBe(1)
    expect(normalizeTrainerMouse({ scopedMultiplier: 0.85 }).scopedMultiplier).toBe(0.85)
    expect(normalizeTrainerMouse({ scopedMultiplier: 9 }).scopedMultiplier).toBe(3)
    expect(normalizeTrainerMouse({ scopedMultiplier: 0 }).scopedMultiplier).toBe(0.1)
    expect(normalizeTrainerMouse({ scopedMultiplier: '' }).scopedMultiplier).toBe(1)
    expect(trainerMouseToGodot({ scopedMultiplier: 1.25 }).scoped_multiplier).toBe(1.25)
  })
  it('keeps FOV and sensitivity where the trainer can start a drill (it refuses every drill otherwise)', () => {
    // The trainer refuses sensitivity 0 or below and a FOV outside 1–179. FOV stays in the settings box's 60–120.
    expect(normalizeTrainerMouse({ fov: 1030 }).fov).toBe(120)
    expect(normalizeTrainerMouse({ fov: 0 }).fov).toBe(60)
    expect(normalizeTrainerMouse({ game: 'cs2', fov: 68 }).fov).toBe(68)
    expect(normalizeTrainerMouse({ sensitivity: 0 }).sensitivity).toBe(0.01)
    expect(normalizeTrainerMouse({ sensitivity: -2 }).sensitivity).toBe(0.01)
    // Any positive sensitivity starts a drill; games such as Overwatch 2 go above the box's 20.
    expect(normalizeTrainerMouse({ sensitivity: 25 }).sensitivity).toBe(25)
    // The launch payload goes through the same rule.
    expect(trainerMouseToGodot({ fov: 1030, sensitivity: 0 })).toMatchObject({ fov: 120, sensitivity: 0.01 })
  })
})

describe('sensitivity and FOV per game', () => {
  const valorant = normalizeTrainerMouse({ dpi: 1600, game: 'valorant', sensitivity: 0.35, fov: 103 })

  it('an existing single value becomes the saved game’s own', () => {
    expect(valorant.perGame).toEqual({ valorant: { sensitivity: 0.35, fov: 103 } })
    expect(normalizeTrainerMouse({ game: 'cs2', sensitivity: 1.6 }).perGame).toEqual({ cs2: { sensitivity: 1.6, fov: 90 } })
  })

  it('a game switch loads that game’s numbers, never the old number on the new game’s scale', () => {
    // Valorant 0.35 sent as CS2 0.35 turned about 3.2 times slower. A first switch keeps the same turn per mouse movement.
    const cs2 = mergeTrainerMouse(valorant, { game: 'cs2' })
    expect(cs2).toMatchObject({ game: 'cs2', sensitivity: 1.114, fov: 90, dpi: 1600 })
    expect(trainerMouseToGodot(cs2)).toMatchObject({ game: 'cs2', sensitivity: 1.114, fov: 90 })
    const cs2Set = mergeTrainerMouse(cs2, { sensitivity: 1.6, fov: 100 })
    const back = mergeTrainerMouse(cs2Set, { game: 'valorant' })
    expect(back).toMatchObject({ game: 'valorant', sensitivity: 0.35, fov: 103 })
    expect(mergeTrainerMouse(back, { game: 'cs2' })).toMatchObject({ game: 'cs2', sensitivity: 1.6, fov: 100 })
  })

  it('a switch that carries the old game’s numbers along (title bar, onboarding) still loads the new game’s', () => {
    // Those callers save { ...trainerMouse, game }.
    expect(mergeTrainerMouse(valorant, { ...valorant, game: 'cs2' })).toMatchObject({ game: 'cs2', sensitivity: 1.114, fov: 90 })
    // A number typed for the new game in the same save is kept.
    expect(mergeTrainerMouse(valorant, { game: 'cs2', sensitivity: 2 })).toMatchObject({ game: 'cs2', sensitivity: 2, fov: 90 })
  })

  it('a game the trainer has no scale for (League) leaves the trainer on its game', () => {
    const cs2 = mergeTrainerMouse(valorant, { game: 'cs2' })
    expect(mergeTrainerMouse(cs2, { ...cs2, game: 'lol' })).toMatchObject({ game: 'cs2', sensitivity: 1.114 })
  })

  it('only the app writes the other games’ numbers, never an old copy sent back from a screen', () => {
    const cs2 = mergeTrainerMouse(valorant, { game: 'cs2', perGame: { valorant: { sensitivity: 9, fov: 60 } } })
    expect(cs2.perGame?.valorant).toEqual({ sensitivity: 0.35, fov: 103 })
  })

  it('"Custom" and League saves keep the Valorant scale the trainer always used for them', () => {
    expect(normalizeTrainerMouse({ game: 'custom', sensitivity: 0.4, fov: 100 })).toMatchObject({ game: 'valorant', sensitivity: 0.4, fov: 100 })
    expect(normalizeTrainerMouse({ game: 'lol', sensitivity: 0.4 })).toMatchObject({ game: 'valorant', sensitivity: 0.4 })
  })

  it('drops broken saved numbers and keeps the rest where the trainer can start a drill', () => {
    const ms = normalizeTrainerMouse({
      game: 'valorant', sensitivity: 0.4,
      perGame: { cs2: { sensitivity: 'x', fov: 90 }, custom: { sensitivity: 1, fov: 90 }, deadlock: { sensitivity: 0, fov: 500 }, apex: null },
    })
    expect(ms.perGame).toEqual({ valorant: { sensitivity: 0.4, fov: 103 }, deadlock: { sensitivity: 0.01, fov: 120 } })
    expect(normalizeTrainerMouse({ perGame: 'x' }).perGame).toEqual({ valorant: { sensitivity: 0.5, fov: 103 } })
  })
})

describe('trainer display settings', () => {
  it('sends V-Sync and the frame cap, with the trainer’s own defaults when never set', () => {
    expect(trainerMouseToGodot({})).toMatchObject({ vsync: false, max_fps: 360 })
    expect(trainerMouseToGodot({ vsync: true, maxFps: 144 })).toMatchObject({ vsync: true, max_fps: 144 })
    expect(trainerMouseToGodot({ maxFps: 0 }).max_fps).toBe(0) // no cap
    // The trainer keeps a cap within 30–1000; the app sends what it will use.
    expect(trainerMouseToGodot({ maxFps: 5 }).max_fps).toBe(30)
    expect(trainerMouseToGodot({ maxFps: 5000 }).max_fps).toBe(1000)
    expect(trainerMouseToGodot({ maxFps: 'x', vsync: 'yes' })).toMatchObject({ vsync: false, max_fps: 360 })
  })

  it('starts the trainer in a window only when that was chosen', () => {
    expect(trainerSpawnOptions({})).toEqual({ windowed: false })
    expect(trainerSpawnOptions({ windowMode: 'windowed' })).toEqual({ windowed: true })
    expect(trainerSpawnOptions({ windowMode: 'borderless' })).toEqual({ windowed: false })
    expect(normalizeTrainerMouse({ windowMode: 'borderless' }).windowMode).toBe('fullscreen')
  })
})

describe('crosshairSettingsToGodot', () => {
  it('does not throw on a partial legacy save with a custom colour index and no customColor', () => {
    const cs = crosshairSettingsToGodot({ colorIndex: 6 } as never)
    expect(cs.color.map(c => Math.round(c * 255))).toEqual([0, 255, 107]) // default custom colour 00FF6B
    expect(cs.dot_show).toBe(true)
  })
  it('uses a valid custom colour and the palette', () => {
    expect(crosshairSettingsToGodot({ colorIndex: 6, customColor: '#ff0000' } as never).color).toEqual([1, 0, 0])
    expect(crosshairSettingsToGodot({ colorIndex: 0 } as never).color).toEqual([1, 1, 1])
    expect(crosshairSettingsToGodot(null).color).toEqual([0.0, 1.0, 0.42])
  })
  it('drops wrong-typed saved values', () => {
    expect(normalizeCrosshairSettings({ version: 2, dotSize: null, innerLength: 'x', outerShow: true })).toMatchObject({ dotSize: 2, innerLength: 10, outerShow: true })
  })
})

describe('trainer settings pane only offers settings the trainer uses', () => {
  const pane = readFileSync(resolve(__dirname, '../../src/components/settings/SettingsTrainerPane.vue'), 'utf8')
  const bound = [...new Set([...pane.matchAll(/settings\.trainerMouse\.(\w+)/g)].map(m => m[1]))]
  const changed: Record<string, unknown> = {
    dpi: 1600, game: 'cs2', sensitivity: 0.9, fov: 95, movementSpeed: 4.4,
    trainerVolume: 40, scopedMultiplier: 1.5, rawInput: false, pollingRate: 125,
    vsync: true, maxFps: 144, windowMode: 'windowed',
  }
  /** What a launch sends: the message's mouse settings and the trainer's start options. */
  const launchOf = (saved: Record<string, unknown>) => ({ mouse: trainerMouseToGodot(saved), spawn: trainerSpawnOptions(saved) })

  it('finds the bound fields', () => {
    expect(bound).toContain('dpi')
  })

  it('the FOV and sensitivity boxes bring a typed value into range before saving', () => {
    for (const field of ['fov', 'sensitivity']) {
      const input = pane.match(new RegExp(`<input v-model\\.number="settings\\.trainerMouse\\.${field}"[^>]*>`))?.[0] ?? ''
      expect(input, field).toContain('@change="clampTrainerMouseInput(settings.trainerMouse); debouncedSave()"')
    }
  })

  it.each(bound)('changing %s changes the trainer launch settings', (field) => {
    expect(field in changed, `add a test value for ${field}`).toBe(true)
    expect(launchOf({ [field]: changed[field] })).not.toEqual(launchOf({}))
  })

  it('offers window mode, V-Sync and the frame cap', () => {
    expect(bound).toEqual(expect.arrayContaining(['windowMode', 'vsync', 'maxFps']))
  })

  it('offers only games the trainer has a scale for (no "Custom")', () => {
    expect(pane).not.toMatch(/value="custom"/)
    expect(pane).not.toMatch(/>Custom</)
  })

  it('says Shift walks in the trainer, not that a preset is the shift-walk', () => {
    expect(pane).not.toMatch(/shift-walk/i)
    expect(pane).toMatch(/Hold Shift in a drill to walk/)
  })
})
