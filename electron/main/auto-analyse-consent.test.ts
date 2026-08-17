import { describe, expect, it } from 'vitest'
import { migrateAutoAnalyseConsent } from './auto-analyse-consent'

describe('migrateAutoAnalyseConsent', () => {
  it('turns legacy automatic analysis off even when an old default persisted true', () => {
    expect(migrateAutoAnalyseConsent({ autoAnalyse: true })).toEqual({
      settings: { autoAnalyse: false, autoAnalyseConsentVersion: 1 },
      migrated: true,
    })
  })

  it('preserves a versioned explicit choice', () => {
    expect(migrateAutoAnalyseConsent({
      autoAnalyse: true,
      autoAnalyseConsentVersion: 1,
    }).settings.autoAnalyse).toBe(true)
  })
})
