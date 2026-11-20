/**
 * Crosshair geometry for CrosshairPreview.vue: the trainer's own rectangles (lib/crosshair.ts crosshairRects,
 * the same numbers as upforge-trainer scripts/CrosshairConfig.gd), magnified `scale` times.
 * Units are screen pixels in the trainer; `scale` multiplies them (2 = the "2×" preview).
 */
import { crosshairRects, crosshairRectsExtent, resolveColor, type CrosshairRect, type CrosshairSettings } from '../../../lib/crosshair'

export type { CrosshairRect }
export interface CrosshairShapes { rects: CrosshairRect[]; color: string }

export function crosshairShapes(s: CrosshairSettings, scale = 2): CrosshairShapes {
  const rects = crosshairRects(s).map(r => ({ ...r, x: r.x * scale, y: r.y * scale, w: r.w * scale, h: r.h * scale }))
  return { rects, color: resolveColor(s) }
}

/** Half the size of the drawn crosshair (for sizing the preview box). */
export function crosshairExtent(s: CrosshairSettings, scale = 2): number {
  return crosshairRectsExtent(s) * scale
}
