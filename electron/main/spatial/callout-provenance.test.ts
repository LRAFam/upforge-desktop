import { describe, expect, it, vi } from 'vitest'
vi.mock('./paths', () => ({ spatialResourcePath: (...parts: string[]) => require('path').join(process.cwd(), 'resources', 'spatial', ...parts) }))
import { resolveCallout } from './callout-resolver'
describe('R8 approximate callout provenance', () => {
  it.each([{x: 0.285, y: 0.604}])('marks nearest-anchor guesses', (point) => {
    expect(resolveCallout('Ascent', point)).toMatchObject({callout: 'Market', resolution: 'nearest_anchor'})
  })
  it('distinguishes radius matches from guesses', () => {
    expect(resolveCallout('Ascent', {x: .2985, y: .497})).toMatchObject({resolution: 'anchor_radius'})
  })
})

describe('Ascent Logs calibrated interior', () => {
  it.each([{x: .326415, y: .604182}, {x: .33, y: .61}])('uses the bounded region', (point) => {
    expect(resolveCallout('Ascent', point)).toEqual({callout: 'B Logs', site: 'B', resolution: 'callout_polygon'})
  })
  it.each([{x: .285, y: .604}, {x: .2985, y: .497}, {x: .405, y: .7121},
    {x: .33, y: .625}, {x: .32, y: .61}, {x: .34, y: .61}, {x: .33, y: .598}])('does not extend Logs into nearby areas', (point) => {
    expect(resolveCallout('Ascent', point).callout).not.toBe('B Logs')
  })
})
