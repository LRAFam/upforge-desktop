import { describe, expect, it } from 'vitest'
import { DEFAULT_CROSSHAIR, crosshairRects } from '../../../lib/crosshair'
import { crosshairExtent, crosshairShapes } from './crosshair-preview'

describe('crosshairShapes', () => {
  it('is the trainer rectangles magnified: outline frames first, then the inner lines and a square dot', () => {
    const s = crosshairShapes(DEFAULT_CROSSHAIR, 2)
    expect(s.color).toBe('#00FF6B')
    // 4 inner arms + the dot, each with a 4-sided outline frame; no outer lines (outerShow false)
    expect(s.rects).toHaveLength(5 * 4 + 5)
    // inner offset 4, length 10, thickness 2 at 2× → from 8 to 28 px above the centre, 4 px wide
    expect(s.rects[20]).toMatchObject({ x: -2, y: -28, w: 4, h: 20, fill: '#00FF6B', opacity: 1 })
    expect(s.rects[0]).toMatchObject({ x: -4, y: -30, w: 8, h: 2, fill: '#000000', opacity: 0.5 })
    expect(s.rects[24]).toMatchObject({ x: -2, y: -2, w: 4, h: 4, fill: '#00FF6B', opacity: 1 }) // 2 px square dot
    expect(crosshairShapes(DEFAULT_CROSSHAIR, 1).rects).toEqual(crosshairRects(DEFAULT_CROSSHAIR))
  })

  it('places outer lines at their offset from the centre', () => {
    const s = crosshairShapes({ ...DEFAULT_CROSSHAIR, outerShow: true, shadowShow: false, dotShow: false, outerOpacity: 0.5, colorIndex: 6, customColor: 'ff0000' }, 1)
    expect(s.rects).toHaveLength(8)
    // default outer offset 24 (what 4 + 10 + 10 drew before), length 5
    expect(s.rects[3]).toMatchObject({ x: 24, w: 5, fill: '#ff0000', opacity: 0.5 })
  })

  it('reports how far the crosshair reaches, outline included', () => {
    expect(crosshairExtent(DEFAULT_CROSSHAIR, 2)).toBe(30)
    expect(crosshairExtent({ ...DEFAULT_CROSSHAIR, outerShow: true }, 1)).toBe(30)
    expect(crosshairExtent({ ...DEFAULT_CROSSHAIR, shadowShow: false }, 1)).toBe(14)
  })
})
