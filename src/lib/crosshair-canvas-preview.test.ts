import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { DEFAULT_CROSSHAIR, crosshairRects, renderCrosshairPreview, type CrosshairSettings } from './crosshair'

type Rect = { x: number; y: number; w: number; h: number }

/** Run the canvas renderer on a fake 2D context and collect the rectangles it fills, around the centre. */
function canvasRects(s: CrosshairSettings, size = 400): Rect[] {
  const rects: Rect[] = []
  const ctx = {
    clearRect() {}, set fillStyle(_v: string) {},
    fillRect(x: number, y: number, w: number, h: number) { rects.push({ x: x - size / 2, y: y - size / 2, w, h }) },
  }
  const canvas = { width: size, height: size, getContext: () => ctx } as unknown as HTMLCanvasElement
  renderCrosshairPreview(canvas, s)
  return rects
}

describe('crosshair previews match the trainer geometry', () => {
  it('the canvas renderer fills the trainer rectangles, magnified by a whole number', () => {
    const thick: CrosshairSettings = { ...DEFAULT_CROSSHAIR, innerThickness: 6, innerOffset: 3, innerLength: 4, outerShow: true, outerThickness: 4, outerLength: 3, shadowShow: true }
    const scale = 5 // 400 px canvas / 80
    const expected = crosshairRects(thick).map(r => ({ x: r.x * scale, y: r.y * scale, w: r.w * scale, h: r.h * scale }))
    expect(canvasRects(thick)).toEqual(expected)
  })

  it('the Settings crosshair editor uses the shared preview, not its own drawing', () => {
    const src = readFileSync(join(__dirname, '..', 'components', 'v3', 'settings', 'CrosshairEditorV3.vue'), 'utf8')
    expect(src).toContain('<CrosshairPreview')
    expect(src).not.toContain('renderCrosshairPreview')
  })

  it('no preview draws a round dot', () => {
    for (const file of [['components', 'v3', 'practice', 'CrosshairPreview.vue'], ['components', 'training', 'TrainingLoadoutsTab.vue']]) {
      const src = readFileSync(join(__dirname, '..', ...file), 'utf8')
      expect(src, file.join('/')).not.toMatch(/<circle|rounded-full/)
    }
  })
})
