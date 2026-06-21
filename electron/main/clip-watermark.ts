import { app } from 'electron'
import { join } from 'path'
import { existsSync } from 'fs'

/** Display width of the logo overlay (height scales with aspect ratio). */
const LOGO_WIDTH_PX = 128
/** Inset from the bottom-right corner. */
const MARGIN_PX = 18
/** Base opacity — kept subtle so gameplay stays readable. */
const BASE_ALPHA = 0.58
/** Opacity pulse amplitude (gentle breathe). */
const ALPHA_PULSE = 0.12
/** Seconds per opacity pulse cycle. */
const ALPHA_PERIOD_SEC = 2.8
/** Horizontal drift amplitude in pixels. */
const DRIFT_X_PX = 6
/** Vertical drift amplitude in pixels. */
const DRIFT_Y_PX = 4
/** Seconds per horizontal drift cycle. */
const DRIFT_X_PERIOD_SEC = 3.2
/** Seconds per vertical drift cycle. */
const DRIFT_Y_PERIOD_SEC = 2.6

/** Resolve bundled UpForge logo for FFmpeg overlay (dev + packaged). */
export function watermarkLogoPath(): string {
  const base = app.isPackaged
    ? join(process.resourcesPath, 'branding')
    : join(app.getAppPath(), 'resources', 'branding')
  return join(base, 'upforge-logo.png')
}

export function isWatermarkAvailable(): boolean {
  return existsSync(watermarkLogoPath())
}

/**
 * FFmpeg filter_complex that overlays an animated UpForge logo in the bottom-right.
 * Combines a soft opacity pulse with a slow corner drift to catch the eye without
 * obscuring gameplay.
 */
export function buildClipWatermarkFilterComplex(): string {
  const alphaExpr = `${BASE_ALPHA}+${ALPHA_PULSE}*sin(2*PI*t/${ALPHA_PERIOD_SEC})`
  return [
    `[1:v]scale=${LOGO_WIDTH_PX}:-1,format=rgba,`,
    `geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a='alpha(X,Y)*(${alphaExpr})'[wm];`,
    `[0:v][wm]overlay=`,
    `x='W-w-${MARGIN_PX}+${DRIFT_X_PX}*sin(2*PI*t/${DRIFT_X_PERIOD_SEC})':`,
    `y='H-h-${MARGIN_PX}+${DRIFT_Y_PX}*sin(2*PI*t/${DRIFT_Y_PERIOD_SEC})':`,
    `eval=frame,format=yuv420p[v]`,
  ].join('')
}
