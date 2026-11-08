import { describe, expect, it } from 'vitest'
import { hasAnalysisQuotaRemaining } from './tier-features'

describe('purchased report credits', () => {
  it('allows a purchased report after the included allowance is exhausted', () => {
    expect(hasAnalysisQuotaRemaining({ total: 5, limit: 5, purchased: 1 }, 'premium')).toBe(true)
    expect(hasAnalysisQuotaRemaining({ total: 1, limit: 1, purchased: 3 }, 'free')).toBe(true)
  })
  it('blocks exhausted balances and preserves older API behaviour', () => {
    expect(hasAnalysisQuotaRemaining({ total: 5, limit: 5, purchased: 0 }, 'premium')).toBe(false)
    expect(hasAnalysisQuotaRemaining({ total: 5, limit: 5 }, 'premium')).toBe(false)
    expect(hasAnalysisQuotaRemaining({ total: 4, limit: 5 }, 'premium')).toBe(true)
  })
})

describe('cloud archive quota', () => {
  it('reads the archived_* names the API actually sends', async () => {
    const { hasArchiveQuotaRemaining } = await import('./tier-features')
    expect(hasArchiveQuotaRemaining({ archived_count: 5, archived_limit: 5, archived_remaining: 0 }, 'free')).toBe(false)
    expect(hasArchiveQuotaRemaining({ archived_count: 2, archived_limit: 5, archived_remaining: 3 }, 'free')).toBe(true)
    // No remaining field: work it out from count/limit.
    expect(hasArchiveQuotaRemaining({ archived_count: 5, archived_limit: 5 }, 'free')).toBe(false)
  })
  it('keeps older count/limit names, unlimited and admin behaviour', async () => {
    const { hasArchiveQuotaRemaining } = await import('./tier-features')
    expect(hasArchiveQuotaRemaining({ count: 5, limit: 5, remaining: 0 }, 'free')).toBe(false)
    expect(hasArchiveQuotaRemaining({ count: 1, limit: 5, remaining: 4 }, 'free')).toBe(true)
    expect(hasArchiveQuotaRemaining({ archived_count: 50, archived_limit: null, archived_remaining: null }, 'premium')).toBe(true)
    expect(hasArchiveQuotaRemaining({ archived_count: 5, archived_limit: 5, archived_remaining: 0 }, 'free', true)).toBe(true)
    expect(hasArchiveQuotaRemaining(null, 'free')).toBe(true)
  })
})
