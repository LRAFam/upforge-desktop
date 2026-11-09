import { describe, expect, it } from 'vitest'
import { freeArchiveRetentionHint } from './archive-retention-hint'

const base = { count: 2, limit: 10, remaining: 8, retention_days: 14, storage_bytes_used: 0 }

describe('freeArchiveRetentionHint', () => {
  it('uses the Plus keep days the API sends, never a hard-coded number', () => {
    expect(freeArchiveRetentionHint({ ...base, plus_retention: { name: 'Plus', keep_days: 60, keeps_while_subscribed: false } }))
      .toBe('Free keeps cloud VODs for 14 days (10 max). Plus keeps them 60 days.')
  })

  it('says "while you\'re subscribed" when Plus has no day limit', () => {
    expect(freeArchiveRetentionHint({ ...base, plus_retention: { name: 'Plus', keep_days: null, keeps_while_subscribed: true } }))
      .toBe("Free keeps cloud VODs for 14 days (10 max). Plus keeps them while you're subscribed.")
  })

  it('makes no Plus claim when an older API sends no plus_retention', () => {
    const hint = freeArchiveRetentionHint(base)
    expect(hint).toBe('Free keeps cloud VODs for 14 days (10 max).')
    expect(hint).not.toMatch(/90/)
  })

  it('reads the archived_* names the API actually sends', () => {
    expect(freeArchiveRetentionHint({
      archived_count: 1, archived_limit: 5, retention_days: 14,
      plus_retention: { name: 'Plus', keep_days: 90, keeps_while_subscribed: false },
    })).toBe('Free keeps cloud VODs for 14 days (5 max). Plus keeps them 90 days.')
  })

  it('needs retention days and a limit; requireSaved also needs one saved VOD', () => {
    expect(freeArchiveRetentionHint(null)).toBeNull()
    expect(freeArchiveRetentionHint({ ...base, retention_days: null })).toBeNull()
    expect(freeArchiveRetentionHint({ ...base, limit: null })).toBeNull()
    expect(freeArchiveRetentionHint({ ...base, count: 0 }, { requireSaved: true })).toBeNull()
    expect(freeArchiveRetentionHint({ ...base, count: 0 })).not.toBeNull()
  })
})

describe('no hard-coded Plus retention in screens', () => {
  it('dashboard and post-game no longer say "Plus keeps them 90 days"', async () => {
    const { readFileSync } = await import('node:fs')
    for (const f of ['src/composables/useDashboard.ts', 'src/views/PostGameView.vue']) {
      expect(readFileSync(f, 'utf8')).not.toMatch(/Plus keeps them \d+ days/)
    }
  })
})

describe('readArchiveQuota', () => {
  it('prefers the archived_* names and falls back to count/limit', async () => {
    const { readArchiveQuota } = await import('./archive-retention-hint')
    expect(readArchiveQuota({ archived_count: 3, archived_limit: 10, archived_remaining: 7 })).toEqual({ count: 3, limit: 10, remaining: 7 })
    expect(readArchiveQuota({ count: 2, limit: 10, remaining: 8 })).toEqual({ count: 2, limit: 10, remaining: 8 })
    expect(readArchiveQuota({ archived_count: 4, archived_limit: 10 })).toEqual({ count: 4, limit: 10, remaining: 6 })
    expect(readArchiveQuota({ archived_count: 4, archived_limit: null, archived_remaining: null })).toEqual({ count: 4, limit: null, remaining: null })
    expect(readArchiveQuota(null)).toEqual({ count: 0, limit: null, remaining: null })
  })
})

describe('screens read archive quota through the shared reader', () => {
  it('no direct archive_stats count/limit/remaining reads', async () => {
    const { readFileSync } = await import('node:fs')
    for (const f of ['src/composables/useSettings.ts', 'src/composables/useDashboard.ts', 'src/components/dashboard/DashboardPlayerCard.vue']) {
      expect(readFileSync(f, 'utf8'), f).not.toMatch(/archive_stats\??\.(count|limit|remaining)\b/)
    }
    expect(readFileSync('src/composables/useDashboard.ts', 'utf8')).not.toMatch(/stats\.count \/ stats\.limit/)
  })
})

describe('normalizeArchiveStats (main-process profile mapper)', () => {
  it('keeps both key names and passes plus_retention through', async () => {
    const { normalizeArchiveStats, freeArchiveRetentionHint: hint } = await import('./archive-retention-hint')
    const out = normalizeArchiveStats({
      archived_count: 2, archived_limit: 10, archived_remaining: 8, retention_days: 14, storage_bytes_used: 5,
      plus_retention: { name: 'Plus', keep_days: null, keeps_while_subscribed: true },
    })
    expect(out).toMatchObject({ count: 2, limit: 10, remaining: 8, archived_count: 2, archived_limit: 10, archived_remaining: 8, retention_days: 14, storage_bytes_used: 5 })
    expect(hint(out)).toBe("Free keeps cloud VODs for 14 days (10 max). Plus keeps them while you're subscribed.")
  })
  it('returns undefined when the API sends no archive count', async () => {
    const { normalizeArchiveStats } = await import('./archive-retention-hint')
    expect(normalizeArchiveStats(undefined)).toBeUndefined()
    expect(normalizeArchiveStats({})).toBeUndefined()
  })
  it('auth-manager uses the shared mapper', async () => {
    const { readFileSync } = await import('node:fs')
    expect(readFileSync('electron/main/auth-manager.ts', 'utf8')).toMatch(/normalizeArchiveStats\(/)
  })
})
