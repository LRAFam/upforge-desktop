import { describe, expect, it } from 'vitest'
import {
  maxValorantAccountsForTier,
  resolveMaxValorantAccounts,
} from './valorant-account-cap'

describe('maxValorantAccountsForTier', () => {
  it('returns 5 for admin flag', () => {
    expect(maxValorantAccountsForTier('free', true)).toBe(5)
  })

  it('returns caps by tier', () => {
    expect(maxValorantAccountsForTier('free')).toBe(1)
    expect(maxValorantAccountsForTier('premium')).toBe(3)
    expect(maxValorantAccountsForTier('plus')).toBe(3)
    expect(maxValorantAccountsForTier('pro')).toBe(5)
    expect(maxValorantAccountsForTier('admin')).toBe(5)
  })
})

describe('resolveMaxValorantAccounts', () => {
  it('uses tier when API max is missing', () => {
    expect(resolveMaxValorantAccounts({ tier: 'pro' })).toBe(5)
    expect(resolveMaxValorantAccounts({ isAdmin: true, apiMax: undefined })).toBe(5)
  })

  it('takes the higher of API and tier so stale API 1 does not trap Pro', () => {
    expect(resolveMaxValorantAccounts({ apiMax: 1, tier: 'pro' })).toBe(5)
    expect(resolveMaxValorantAccounts({ apiMax: 1, isAdmin: true })).toBe(5)
  })

  it('keeps free at 1', () => {
    expect(resolveMaxValorantAccounts({ apiMax: 1, tier: 'free' })).toBe(1)
  })
})
