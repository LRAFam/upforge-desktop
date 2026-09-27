import { describe, it, expect } from 'vitest'
import { validAccountUsage, validReviewAccess, capacityLabel } from './account-usage'
const capacity = { used: 2, limit: 5, remaining: 3 }
const usage = { version: 1, as_of: '2026-09-27T12:00:00Z', reports: { ...capacity, period: 'monthly', resets_at: null, reset_on_next_use: true, purchased: 3 }, clips: capacity, footage: { ...capacity, stored: 1, reserved: 1, stored_bytes: null, retention_days: 90, next_expiry_at: null }, coach_credits: 4 }
describe('account usage contract', () => {
  it('keeps reserved uploads and purchased credits separate', () => { expect(validAccountUsage(usage)).toBe(true) })
  it('rejects incomplete or inconsistent capacity instead of inventing allowances', () => {
    expect(validAccountUsage({ ...usage, clips: undefined })).toBe(false)
    expect(validAccountUsage({ ...usage, clips: { ...capacity, remaining: 5 } })).toBe(false)
    expect(validAccountUsage({ ...usage, footage: { ...usage.footage, stored: 2 } })).toBe(false)
  })
  it('supports explicit unlimited and exhausted limits', () => {
    expect(validAccountUsage({ ...usage, clips: { used: 0, limit: null, remaining: null } })).toBe(true)
    expect(capacityLabel({used: 8, limit: 5, remaining: 0})).toBe('8 / 5 used · 0 available')
  })
})

it('requires explicit access decisions and supports a rolling API deployment without granting access', () => {
  const access = { version: 1, replay: true, personal_notes: true, next_match_focus: true, comparison: false, save_comparison: false, read_saved_comparisons: true, comparison_access_reason: 'upgrade_required' }
  expect(validReviewAccess(access)).toBe(true)
  expect(validReviewAccess(undefined)).toBe(false)
  expect(validReviewAccess({ ...access, comparison: undefined })).toBe(false)
  expect(validReviewAccess({ ...access, comparison_access_reason: 'free_trial_maybe' })).toBe(false)
  expect(validAccountUsage({ ...usage, review_access: access })).toBe(true)
  expect(validAccountUsage({ ...usage, review_access: {} })).toBe(false)
  expect(validAccountUsage(usage)).toBe(true)
  expect((usage as import('./account-usage').AccountUsage).review_access).toBeUndefined()
})
