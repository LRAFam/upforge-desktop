import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { DEFAULT_CROSSHAIR, renderCrosshairPreview, type CrosshairSettings } from './crosshair'
import { crosshairShapes } from '../components/v3/practice/crosshair-preview'

type Rect = { x: number; y: number; w: number; h: number }

/** Run the canvas renderer on a fake 2D context and turn each stroked segment into the rectangle it paints. */
function canvasRects(s: CrosshairSettings, size = 400): { rects: Rect[]; scale: number } {
  const rects: Rect[] = []
  let lineWidth = 0, lineCap = 'butt'
  let from: [number, number] | null = null
  const segments: Array<[number, number, number, number]> = []
  const ctx = {
    clearRect() {}, beginPath() { segments.length = 0 }, arc() {}, fill() {},
    set lineWidth(v: number) { lineWidth = v }, set lineCap(v: string) { lineCap = v },
    set strokeStyle(_v: string) {}, set fillStyle(_v: string) {},
    moveTo(x: number, y: number) { from = [x, y] },
    lineTo(x: number, y: number) { if (from) segments.push([from[0], from[1], x, y]) },
    stroke() {
      const ext = lineCap === 'butt' ? 0 : lineWidth / 2
      for (const [x1, y1, x2, y2] of segments) {
        const c = size / 2
        if (x1 === x2) rects.push({ x: x1 - c - lineWidth / 2, y: Math.min(y1, y2) - c - ext, w: lineWidth, h: Math.abs(y2 - y1) + 2 * ext })
        else rects.push({ x: Math.min(x1, x2) - c - ext, y: y1 - c - lineWidth / 2, w: Math.abs(x2 - x1) + 2 * ext, h: lineWidth })
      }
    },
  }
  const canvas = { width: size, height: size, getContext: () => ctx } as unknown as HTMLCanvasElement
  renderCrosshairPreview(canvas, s)
  return { rects, scale: size / 80 }
}

const key = (r: Rect) => [r.x, r.y, r.w, r.h].map(n => Math.round(n * 1000) / 1000).join(',')

describe('crosshair previews match the trainer geometry', () => {
  it('the canvas renderer draws the same lines as crosshairShapes() for a thick, short crosshair', () => {
    const thick: CrosshairSettings = { ...DEFAULT_CROSSHAIR, innerThickness: 6, innerOffset: 3, innerLength: 4, outerShow: true, outerThickness: 4, outerLength: 3, shadowShow: true }
    const { rects, scale } = canvasRects(thick)
    const expected = crosshairShapes(thick, scale).rects
    expect(rects.map(key).sort()).toEqual(expected.map(key).sort())
  })

  it('the Settings crosshair editor uses the shared preview, not its own drawing', () => {
    const src = readFileSync(join(__dirname, '..', 'components', 'v3', 'settings', 'CrosshairEditorV3.vue'), 'utf8')
    expect(src).toContain('<CrosshairPreview')
    expect(src).not.toContain('renderCrosshairPreview')
  })
})
