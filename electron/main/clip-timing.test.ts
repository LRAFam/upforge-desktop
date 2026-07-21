import { describe, expect, it } from 'vitest'
import { adjustMomentOffsetAfterTrim } from './clip-timing'

describe('adjustMomentOffsetAfterTrim', () => {
  it('returns null when clip has no moment offset', () => {
    expect(adjustMomentOffsetAfterTrim(null, 2)).toBeNull()
    expect(adjustMomentOffsetAfterTrim(undefined, 2)).toBeNull()
  })

  it('shifts offset back by trim start and clamps at zero', () => {
    expect(adjustMomentOffsetAfterTrim(20_000, 8)).toBe(12_000)
    expect(adjustMomentOffsetAfterTrim(3_000, 5)).toBe(0)
  })
})
