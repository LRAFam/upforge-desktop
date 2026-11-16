import { describe, expect, it, vi } from 'vitest'
import { LEGACY_UI_V3_STORAGE_KEY, clearLegacyUiPreference, uiV3 } from './ui-v3'

describe('ui v3 (classic design retired)', () => {
  it('is always on', () => {
    expect(uiV3.value).toBe(true)
  })
  it('clears a saved classic-design choice', () => {
    const removeItem = vi.fn()
    clearLegacyUiPreference({ removeItem })
    expect(removeItem).toHaveBeenCalledWith(LEGACY_UI_V3_STORAGE_KEY)
    expect(LEGACY_UI_V3_STORAGE_KEY).toBe('uf.uiV3')
  })
  it('ignores missing or blocked storage', () => {
    expect(() => clearLegacyUiPreference(null)).not.toThrow()
    expect(() => clearLegacyUiPreference({ removeItem: () => { throw new Error('blocked') } })).not.toThrow()
  })
})
