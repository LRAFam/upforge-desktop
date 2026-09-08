import { describe, expect, it } from 'vitest'
import { measureCalibration, type CalibrationInput } from './valorant-calibration'

// Synthetic 90-degree camera: focal length 1000px; 10m plane.
// Camera at 1.6m, head centre at 1.7m, visual head height 0.2m.
const frame: CalibrationInput = {
  width: 2000, height: 1000, horizontalFovDeg: 90, depthM: 10,
  depthErrorM: 0.5, pixelError: 1, headTopY: 480, headBottomY: 500, feetY: 660,
}
describe('recording calibration', () => {
  it('recovers known geometry independently of screen centre head placement', () => {
    const result = measureCalibration(frame)
    expect(result.visualHeadHeight.value).toBeCloseTo(0.2)
    expect(result.headCentreAboveGround.value).toBeCloseTo(1.7)
    expect(result.cameraAboveGround.value).toBeCloseTo(1.6)
    expect(result.visualHeadHeight.min).toBeCloseTo(0.171)
    expect(result.visualHeadHeight.max).toBeCloseTo(0.231)
  })
  it('is invariant under uniform frame scaling', () => {
    const result = measureCalibration({ ...frame, width: 1000, height: 500, headTopY: 240, headBottomY: 250, feetY: 330, pixelError: 0.5 })
    expect(result).toMatchObject({ visualHeadHeight: measureCalibration(frame).visualHeadHeight })
  })
  it.each([
    { depthM: 0 }, { depthErrorM: 10 }, { pixelError: -1 }, { horizontalFovDeg: 180 },
    { headTopY: 501 }, { feetY: 1000 }, { feetY: 499 }, { width: NaN }, { pixelError: 10 },
  ])('rejects unusable measurements: %j', (patch) => {
    expect(() => measureCalibration({ ...frame, ...patch })).toThrow()
  })
})
