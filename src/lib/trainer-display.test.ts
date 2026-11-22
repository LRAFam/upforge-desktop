import { describe, expect, it } from 'vitest'
import trainerPin from '../../trainer-version.json'
import { TRAINER_TARGET_PALETTES, isTrainerTargetPalette, trainerReadsTargetPalette, trainerStaysOpen } from './trainer-display'

describe('target colour', () => {
  it('offers the trainer’s palettes, default first (upforge-trainer TargetPalette.NAMES)', () => {
    expect(TRAINER_TARGET_PALETTES.map(p => p.value)).toEqual(['default', 'yellow', 'cyan', 'magenta'])
    expect(TRAINER_TARGET_PALETTES.map(p => p.label)).toEqual(['Default', 'Yellow', 'Cyan', 'Magenta'])
    expect(isTrainerTargetPalette('cyan')).toBe(true)
    expect(isTrainerTargetPalette('red')).toBe(false)
    expect(isTrainerTargetPalette(undefined)).toBe(false)
  })

  it('only trainers from 1.14.0 read target_palette', () => {
    for (const v of ['1.14.0', '1.14.3', '1.15.0', '1.20.1', '2.0.0', 'v1.14.0']) expect(trainerReadsTargetPalette(v), v).toBe(true)
    for (const v of ['1.13.0', '1.13.9', '1.9.0', '0.99.0', '', 'dev', '1.14']) expect(trainerReadsTargetPalette(v), v).toBe(false)
  })

  it('the bundled trainer reads it, so Settings offers the row', () => {
    expect(trainerReadsTargetPalette(trainerPin.version)).toBe(true)
  })
})

describe('staying open between runs', () => {
  it('only trainers from 1.16.0 stay open after a result (end card, R again, N next drill)', () => {
    for (const v of ['1.16.0', '1.16.4', '1.20.0', '2.0.0', 'v1.16.0']) expect(trainerStaysOpen(v), v).toBe(true)
    for (const v of ['1.15.0', '1.15.9', '1.14.0', '1.9.0', '0.99.0', '', 'dev', '1.16']) expect(trainerStaysOpen(v), v).toBe(false)
  })
})
