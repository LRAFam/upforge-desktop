import { describe, expect, it } from 'vitest'
import { crosshairSettingsToGodot, normalizeCrosshairSettings, normalizeTrainerMouse, trainerMouseToGodot } from './trainer-settings'

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
    expect(normalizeCrosshairSettings({ dotRadius: null, innerLength: 'x', outerShow: true })).toMatchObject({ dotRadius: 1.5, innerLength: 10, outerShow: true })
  })
})
