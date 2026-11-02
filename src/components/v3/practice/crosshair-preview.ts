/**
 * Crosshair geometry for CrosshairPreview.vue. Mirrors the trainer's drawing
 * (upforge-trainer/scripts/Crosshair.gd): outer lines start at inner offset + inner length + outer offset,
 * the shadow is the same line 2px thicker at 55% black, and the dot shadow is 1px bigger.
 * Units are trainer pixels; `scale` multiplies them (2 = the audit's "2×" preview).
 */
import { resolveColor, type CrosshairSettings } from '../../../lib/crosshair'

export interface CrosshairRect { x: number; y: number; w: number; h: number; fill: string; opacity: number }
export interface CrosshairDot { r: number; fill: string; opacity: number }
export interface CrosshairShapes { rects: CrosshairRect[]; dots: CrosshairDot[]; color: string }

const SHADOW = '#000000'
const SHADOW_OPACITY = 0.55

/** Four arms centred on (0,0): each starts `gap` from the centre and runs `length` outward. */
function arms(gap: number, length: number, thick: number, fill: string, opacity: number): CrosshairRect[] {
  const h = thick / 2
  return [
    { x: -h, y: -gap - length, w: thick, h: length, fill, opacity },
    { x: -h, y: gap, w: thick, h: length, fill, opacity },
    { x: -gap - length, y: -h, w: length, h: thick, fill, opacity },
    { x: gap, y: -h, w: length, h: thick, fill, opacity },
  ]
}

export function crosshairShapes(s: CrosshairSettings, scale = 2): CrosshairShapes {
  const color = resolveColor(s)
  const rects: CrosshairRect[] = []
  const dots: CrosshairDot[] = []
  // Outer first so the inner lines draw on top (same order as the trainer).
  if (s.outerShow && s.outerLength > 0) {
    const gap = (s.innerOffset + s.innerLength + s.outerOffset) * scale
    const len = s.outerLength * scale
    if (s.shadowShow) rects.push(...arms(gap, len, (s.outerThickness + 2) * scale, SHADOW, SHADOW_OPACITY))
    rects.push(...arms(gap, len, s.outerThickness * scale, color, s.outerOpacity))
  }
  if (s.innerShow && s.innerLength > 0) {
    const gap = s.innerOffset * scale
    const len = s.innerLength * scale
    if (s.shadowShow) rects.push(...arms(gap, len, (s.innerThickness + 2) * scale, SHADOW, SHADOW_OPACITY))
    rects.push(...arms(gap, len, s.innerThickness * scale, color, s.innerOpacity))
  }
  if (s.dotShow && s.dotRadius > 0) {
    if (s.shadowShow) dots.push({ r: (s.dotRadius + 1) * scale, fill: SHADOW, opacity: SHADOW_OPACITY })
    dots.push({ r: s.dotRadius * scale, fill: color, opacity: s.dotOpacity })
  }
  return { rects, dots, color }
}

/** Half the size of the drawn crosshair (for sizing the preview box). */
export function crosshairExtent(s: CrosshairSettings, scale = 2): number {
  const inner = s.innerShow ? s.innerOffset + s.innerLength : 0
  const outer = s.outerShow ? s.innerOffset + s.innerLength + s.outerOffset + s.outerLength : 0
  const dot = s.dotShow ? s.dotRadius + 1 : 0
  return Math.max(inner, outer, dot) * scale
}
