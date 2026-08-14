export type CaptureFrameQuality = {
  verified: boolean
  reason: 'ok' | 'mostly_black' | 'flat_image' | 'empty_image'
  darkPixelRatio: number
  luminanceSpread: number
}

/**
 * Fast sampled validation for an Electron NativeImage BGRA bitmap.
 * A successful OBS screenshot call only proves the source exists; it can still be black.
 */
export function assessCaptureFrame(
  bitmap: Uint8Array,
  width: number,
  height: number,
): CaptureFrameQuality {
  if (width <= 0 || height <= 0 || bitmap.length < width * height * 4) {
    return { verified: false, reason: 'empty_image', darkPixelRatio: 1, luminanceSpread: 0 }
  }

  const pixelCount = width * height
  const stride = Math.max(1, Math.floor(Math.sqrt(pixelCount / 12_000)))
  let sampled = 0
  let dark = 0
  let sum = 0
  let sumSquares = 0

  for (let y = 0; y < height; y += stride) {
    for (let x = 0; x < width; x += stride) {
      const offset = (y * width + x) * 4
      const blue = bitmap[offset] ?? 0
      const green = bitmap[offset + 1] ?? 0
      const red = bitmap[offset + 2] ?? 0
      const luminance = (red * 0.2126) + (green * 0.7152) + (blue * 0.0722)
      sampled++
      if (luminance < 12) dark++
      sum += luminance
      sumSquares += luminance * luminance
    }
  }

  const darkPixelRatio = sampled ? dark / sampled : 1
  const mean = sampled ? sum / sampled : 0
  const variance = sampled ? Math.max(0, (sumSquares / sampled) - (mean * mean)) : 0
  const luminanceSpread = Math.sqrt(variance)
  const reason = darkPixelRatio >= 0.96
    ? 'mostly_black'
    : luminanceSpread < 5
      ? 'flat_image'
      : 'ok'

  return {
    verified: reason === 'ok',
    reason,
    darkPixelRatio,
    luminanceSpread,
  }
}
