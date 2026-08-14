import { describe, expect, it } from 'vitest'
import { assessCaptureFrame } from './capture-frame-quality'

function frame(width: number, height: number, pixel: (x: number, y: number) => [number, number, number, number]) {
  const bytes = new Uint8Array(width * height * 4)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) bytes.set(pixel(x, y), (y * width + x) * 4)
  }
  return bytes
}

describe('capture frame quality', () => {
  it('rejects a black OBS capture', () => {
    const result = assessCaptureFrame(frame(40, 40, () => [0, 0, 0, 255]), 40, 40)
    expect(result).toMatchObject({ verified: false, reason: 'mostly_black' })
  })

  it('rejects a flat placeholder frame', () => {
    const result = assessCaptureFrame(frame(40, 40, () => [80, 80, 80, 255]), 40, 40)
    expect(result).toMatchObject({ verified: false, reason: 'flat_image' })
  })

  it('accepts a varied game-like frame', () => {
    const result = assessCaptureFrame(
      frame(40, 40, (x, y) => [x * 6, y * 6, (x + y) * 3, 255]),
      40,
      40,
    )
    expect(result).toMatchObject({ verified: true, reason: 'ok' })
  })
})
