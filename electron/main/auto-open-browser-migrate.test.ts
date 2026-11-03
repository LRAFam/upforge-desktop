import { describe, expect, it } from 'vitest'
import { migrateAutoOpenBrowserInApp } from './auto-open-browser-migrate'

describe('migrateAutoOpenBrowserInApp', () => {
  it('turns the old default (stored true) off once', () => {
    const r = migrateAutoOpenBrowserInApp({ autoOpenBrowser: true, savePath: '/x' })
    expect(r.migrated).toBe(true)
    expect(r.settings).toEqual({ autoOpenBrowser: false, autoOpenBrowserInAppV1: true, savePath: '/x' })
  })

  it('marks installs without the setting too, so a later choice is never undone', () => {
    expect(migrateAutoOpenBrowserInApp({}).settings).toEqual({ autoOpenBrowser: false, autoOpenBrowserInAppV1: true })
  })

  it('keeps a choice made after the migration ran', () => {
    const input = { autoOpenBrowser: true, autoOpenBrowserInAppV1: true }
    const r = migrateAutoOpenBrowserInApp(input)
    expect(r.migrated).toBe(false)
    expect(r.settings).toBe(input)
  })
})
