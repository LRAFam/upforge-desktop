import { describe, expect, it } from 'vitest'
import { DEFAULT_CROSSHAIR } from '../../../lib/crosshair'
import { crosshairExtent, crosshairShapes } from './crosshair-preview'

describe('crosshairShapes', () => {
  it('draws the default crosshair: inner lines with outline, then the dot', () => {
    const s = crosshairShapes(DEFAULT_CROSSHAIR, 2)
    expect(s.color).toBe('#00FF6B')
    // 4 shadow + 4 inner arms, no outer (outerShow false)
    expect(s.rects).toHaveLength(8)
    const top = s.rects[4]
    // inner offset 4, length 10, thickness 2 at 2× → starts 8px above centre, 20px long, 4px wide
    expect(top).toMatchObject({ x: -2, y: -28, w: 4, h: 20, fill: '#00FF6B', opacity: 1 })
    expect(s.rects[0]).toMatchObject({ w: 8, fill: '#000000', opacity: 0.55 })
    expect(s.dots).toEqual([{ r: 5, fill: '#000000', opacity: 0.55 }, { r: 3, fill: '#00FF6B', opacity: 1 }])
  })

  it('places outer lines after the inner line, like the trainer', () => {
    const s = crosshairShapes({ ...DEFAULT_CROSSHAIR, outerShow: true, shadowShow: false, dotShow: false, outerOpacity: 0.5, colorIndex: 6, customColor: 'ff0000' }, 1)
    expect(s.rects).toHaveLength(8)
    // outer gap = 4 + 10 + 10 = 24; right arm starts at x = 24, length 5
    expect(s.rects[3]).toMatchObject({ x: 24, w: 5, fill: '#ff0000', opacity: 0.5 })
    expect(s.dots).toEqual([])
  })

  it('reports how far the crosshair reaches', () => {
    expect(crosshairExtent(DEFAULT_CROSSHAIR, 2)).toBe(28)
    expect(crosshairExtent({ ...DEFAULT_CROSSHAIR, outerShow: true }, 1)).toBe(29)
  })
})
