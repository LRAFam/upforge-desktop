import { describe, expect, it } from 'vitest'
import { plural } from './plural'

describe('plural', () => {
  it('uses the singular only for exactly one', () => {
    expect(plural(1, 'analysis', 'analyses')).toBe('1 analysis')
    expect(plural(0, 'analysis', 'analyses')).toBe('0 analyses')
    expect(plural(2, 'purchased report credit')).toBe('2 purchased report credits')
    expect(plural(1, 'purchased report credit')).toBe('1 purchased report credit')
  })
})
