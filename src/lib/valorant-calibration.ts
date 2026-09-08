/** Pinhole measurements of an uncropped, level-camera frame. Visual geometry only. */
export interface CalibrationInput {
  width: number
  height: number
  horizontalFovDeg: number
  depthM: number
  depthErrorM: number
  pixelError: number
  headTopY: number
  headBottomY: number
  feetY: number
}

export interface Measurement {
  value: number
  min: number
  max: number
  unit: 'm'
}

export function measureCalibration(input: CalibrationInput) {
  const { width, height, horizontalFovDeg, depthM, depthErrorM, pixelError, headTopY, headBottomY, feetY } = input
  if (!Object.values(input).every(Number.isFinite)) throw new Error('Complete every measurement field with a finite number.')
  if (width <= 0 || height <= 0 || horizontalFovDeg <= 0 || horizontalFovDeg >= 180) throw new Error('Frame dimensions and horizontal field of view must be valid.')
  if (depthM <= 0 || depthErrorM < 0 || depthErrorM >= depthM || pixelError < 0) throw new Error('Distance must be positive and greater than its uncertainty.')
  if (headTopY < 0 || feetY >= height || headTopY >= headBottomY || headBottomY >= feetY) throw new Error('Mark head top, chin, then feet, in that vertical order.')
  if (feetY <= height / 2) throw new Error('Feet must be below the frame centre. Check the level-camera setup.')
  if (headBottomY - headTopY <= pixelError * 2) throw new Error('Head is too small for the selected pixel uncertainty. Use a closer or sharper frame.')
  const focalPx = width / (2 * Math.tan(horizontalFovDeg * Math.PI / 360))
  const measure = (pixels: number, error: number): Measurement => ({
    value: pixels * depthM / focalPx,
    min: Math.max(0, pixels - error) * (depthM - depthErrorM) / focalPx,
    max: (pixels + error) * (depthM + depthErrorM) / focalPx,
    unit: 'm',
  })
  return {
    visualHeadHeight: measure(headBottomY - headTopY, 2 * pixelError),
    headCentreAboveGround: measure(feetY - (headTopY + headBottomY) / 2, 2 * pixelError),
    cameraAboveGround: measure(feetY - height / 2, pixelError),
    focalPx,
  }
}
