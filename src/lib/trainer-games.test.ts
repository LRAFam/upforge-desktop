import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { reactive } from 'vue'
import { convertTrainerSensitivity, isTrainerGame, switchTrainerGame, trainerAimFacts, TRAINER_GAMES } from './trainer-games'

describe('trainer games', () => {
  it('are the games the trainer has a sensitivity scale for, with no "Custom" or League', () => {
    expect(TRAINER_GAMES).toEqual(['valorant', 'cs2', 'deadlock', 'apex', 'overwatch2'])
    expect(isTrainerGame('custom')).toBe(false)
    expect(isTrainerGame('lol')).toBe(false)
    expect(isTrainerGame('toString')).toBe(false)
  })

  it('converts a sensitivity so the mouse turns the camera the same distance', () => {
    expect(convertTrainerSensitivity(0.35, 'valorant', 'cs2')).toBe(1.114)
    expect(convertTrainerSensitivity(1.114, 'cs2', 'valorant')).toBe(0.35)
    expect(convertTrainerSensitivity(2, 'cs2', 'deadlock')).toBe(1)
    expect(convertTrainerSensitivity(0.5, 'valorant', 'valorant')).toBe(0.5)
  })
})

describe('switchTrainerGame', () => {
  it('keeps the old game’s numbers and loads the new game’s own', () => {
    const mouse = { game: 'valorant', sensitivity: 0.35, fov: 103, dpi: 800, perGame: { cs2: { sensitivity: 1.6, fov: 100 } } }
    expect(switchTrainerGame(mouse, 'cs2')).toEqual({
      game: 'cs2', sensitivity: 1.6, fov: 100, dpi: 800,
      perGame: { valorant: { sensitivity: 0.35, fov: 103 }, cs2: { sensitivity: 1.6, fov: 100 } },
    })
    expect(mouse.game).toBe('valorant') // input untouched
  })

  it('gives a game never set before the same turn per mouse movement and its default FOV', () => {
    expect(switchTrainerGame({ game: 'valorant', sensitivity: 0.35, fov: 95 }, 'cs2')).toMatchObject({ sensitivity: 1.114, fov: 90 })
    expect(switchTrainerGame({ game: 'cs2', sensitivity: 2, fov: 90 }, 'overwatch2')).toMatchObject({ sensitivity: 6.667, fov: 103 })
  })

  it('returns plain data from the reactive Settings copy, so it can be sent to the main process', () => {
    const mouse = reactive({ game: 'valorant', sensitivity: 0.35, fov: 103, perGame: { cs2: { sensitivity: 1.6, fov: 100 } } })
    const moved = switchTrainerGame(mouse, 'cs2')
    expect(() => structuredClone(moved)).not.toThrow()
  })
})

describe('Practice › Setup', () => {
  it('shows game, sensitivity, DPI, eDPI and FOV like Settings › Trainer (UX1124-25)', () => {
    expect(trainerAimFacts({ game: 'valorant', sensitivity: 0.1, fov: 90, dpi: 1600 })).toEqual([
      { label: 'Game', value: 'Valorant' }, { label: 'Sensitivity', value: '0.1' }, { label: 'Mouse DPI', value: '1600' },
      { label: 'eDPI', value: '160' }, { label: 'FOV', value: '90°' },
    ])
    expect(trainerAimFacts({ game: 'cs2', sensitivity: 1.114, fov: 90 })).toEqual([
      { label: 'Game', value: 'CS2' }, { label: 'Sensitivity', value: '1.114' }, { label: 'FOV', value: '90°' },
    ])
    expect(trainerAimFacts(null)).toEqual([])
    expect(trainerAimFacts({ game: 'lol' })).toEqual([])
  })

  it('the Setup tab shows the facts, the eDPI note and an Edit link', () => {
    const tab = readFileSync(resolve(__dirname, '../components/training/TrainingLoadoutsTab.vue'), 'utf8')
    expect(tab).toContain('trainerAimFacts(s.trainerMouse)')
    expect(tab).toContain('{{ EDPI_NOTE }}')
    expect(tab).toContain('Edit in Settings')
  })
})
