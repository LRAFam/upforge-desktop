import { describe, expect, it } from 'vitest'
import { migrateObsPreserveSceneDefaultV2 } from './obs-preserve-scene-migrate'

describe('migrateObsPreserveSceneDefaultV2', () => {
  it('forces preserve off and sets sentinel when sentinel missing', () => {
    expect(
      migrateObsPreserveSceneDefaultV2({
        obsPreserveActiveScene: true,
      }),
    ).toEqual({
      obsPreserveActiveScene: false,
      obsPreserveSceneDefaultV2: true,
    })
  })

  it('forces preserve off when sentinel is false', () => {
    expect(
      migrateObsPreserveSceneDefaultV2({
        obsPreserveActiveScene: true,
        obsPreserveSceneDefaultV2: false,
      }),
    ).toEqual({
      obsPreserveActiveScene: false,
      obsPreserveSceneDefaultV2: true,
    })
  })

  it('leaves creator opt-in alone after migration', () => {
    expect(
      migrateObsPreserveSceneDefaultV2({
        obsPreserveActiveScene: true,
        obsPreserveSceneDefaultV2: true,
      }),
    ).toEqual({
      obsPreserveActiveScene: true,
      obsPreserveSceneDefaultV2: true,
    })
  })

  it('leaves preserve off alone after migration', () => {
    expect(
      migrateObsPreserveSceneDefaultV2({
        obsPreserveActiveScene: false,
        obsPreserveSceneDefaultV2: true,
      }),
    ).toEqual({
      obsPreserveActiveScene: false,
      obsPreserveSceneDefaultV2: true,
    })
  })

  it('does not mutate the input object', () => {
    const input = { obsPreserveActiveScene: true as boolean }
    migrateObsPreserveSceneDefaultV2(input)
    expect(input).toEqual({ obsPreserveActiveScene: true })
  })
})
