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
