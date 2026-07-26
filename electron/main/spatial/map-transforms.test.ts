import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  app: { isPackaged: false, getAppPath: () => process.cwd() },
}))

vi.mock('./paths', () => ({
  spatialResourcePath: (...parts: string[]) =>
    require('path').join(process.cwd(), 'resources', 'spatial', ...parts),
}))

import { rawWorldToTransform, worldToNorm } from './map-transforms'

describe('valorant-api minimap transform', () => {
  // Community fixture: Fracture Bridge (11473, -2897) → ~0.3315, 0.2615 on displayicon.
  const fracture = {
    displayName: 'Fracture',
    xMultiplier: 0.000078,
    yMultiplier: -0.000078,
    xScalarToAdd: 0.556952,
    yScalarToAdd: 1.155886,
  }

  it('swaps game axes into multiplier fields (Fracture Bridge)', () => {
    const raw = rawWorldToTransform(fracture as never, 11473, -2897)
    expect(raw).not.toBeNull()
    expect(raw!.x).toBeCloseTo(0.3315, 2)
    expect(raw!.y).toBeCloseTo(0.2615, 2)
  })

  it('worldToNorm returns clamped displayicon UV for Fracture', () => {
    const norm = worldToNorm('Fracture', 11473, -2897)
    expect(norm).not.toBeNull()
    expect(norm!.x).toBeCloseTo(0.3315, 2)
    expect(norm!.y).toBeCloseTo(0.2615, 2)
  })
})
