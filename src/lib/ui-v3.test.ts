import { describe, expect, it } from 'vitest'
import { readUiV3 } from './ui-v3'

const store = (v: string | null) => ({ getItem: () => v })

describe('readUiV3', () => {
  it('is on by default for everyone', () => {
    expect(readUiV3(store(null))).toBe(true)
    expect(readUiV3(null)).toBe(true)
  })
  it('respects a player who switched back to the classic design', () => {
    expect(readUiV3(store('0'))).toBe(false)
    expect(readUiV3(store('1'))).toBe(true)
  })
  it('stays on when storage throws', () => {
    expect(readUiV3({ getItem: () => { throw new Error('blocked') } })).toBe(true)
  })
})
