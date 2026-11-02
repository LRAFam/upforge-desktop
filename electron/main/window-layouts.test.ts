import { describe, expect, it, vi } from 'vitest'
vi.mock('electron', () => ({ BrowserWindow: class {}, screen: {} }))
import { restoreAfterCompact } from './window-layouts'

describe('restoreAfterCompact', () => {
  it('brings back a maximised window', () => {
    expect(restoreAfterCompact({ bounds: { x: 0, y: 0, width: 1728, height: 1079 }, maximized: true }, { minWidth: 1100, minHeight: 700 }).maximize).toBe(true)
  })
  it('restores the earlier size, never below the minimum', () => {
    const r = restoreAfterCompact({ bounds: { x: 10, y: 20, width: 900, height: 1000 }, maximized: false }, { minWidth: 1100, minHeight: 700 })
    expect(r).toEqual({ maximize: false, bounds: { x: 10, y: 20, width: 1100, height: 1000 } })
  })
})
