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
