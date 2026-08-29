import { describe, expect, it } from 'vitest'
import { sanitizeUnsupportedRankClaimsForDisplay } from './coaching-copy-safety'

describe('coaching copy safety', () => {
  it('removes unsupported skill-rank and causal rank claims from stored reports', () => {
    const text = 'Aim is Diamond-level (35% HS%), but 9 deaths are keeping you in Plat 1.'
    const safe = sanitizeUnsupportedRankClaimsForDisplay(text) ?? ''

    expect(safe).not.toContain('Diamond-level')
    expect(safe).not.toContain('keeping you in')
    expect(safe).toContain('35% HS%')
    expect(safe).toContain('this match')
  })
})
