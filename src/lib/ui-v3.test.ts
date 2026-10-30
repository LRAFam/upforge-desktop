import { describe, expect, it } from 'vitest'
import { readUiV3 } from './ui-v3'

const store = (v: string | null) => ({ getItem: () => v })

describe('readUiV3', () => {
  it('follows the build mode when nothing is stored', () => {
    expect(readUiV3(true, store(null))).toBe(true)
    expect(readUiV3(false, store(null))).toBe(false)
  })
  it('lets a stored choice override the default', () => {
    expect(readUiV3(false, store('1'))).toBe(true)
    expect(readUiV3(true, store('0'))).toBe(false)
  })
  it('falls back to the default when storage throws or is missing', () => {
    expect(readUiV3(true, { getItem: () => { throw new Error('blocked') } })).toBe(true)
    expect(readUiV3(false, null)).toBe(false)
  })
})
