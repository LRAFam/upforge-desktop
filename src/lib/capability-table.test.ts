import { describe, expect, it } from 'vitest'
import { capabilityRows } from './capability-table'
import type { AccountUsage } from './account-usage'
import type { CoachAllowances } from './coach-allowances'

const usage = (over: Partial<AccountUsage> = {}): AccountUsage => ({
  version: 1, as_of: '2026-11-25T10:00:00Z',
  reports: { used: 1, limit: 3, remaining: 2, period: 'monthly', resets_at: '2026-12-01T00:00:00Z', reset_on_next_use: false, purchased: 0 },
  clips: { used: 0, limit: null, remaining: null },
  footage: { used: 0, limit: null, remaining: null, stored: 0, reserved: 0, stored_bytes: null, retention_days: null, next_expiry_at: null },
  coach_credits: 0,
  cloud_storage: { included_bytes: 10e9, addon_bytes: 0, capacity_bytes: 10e9, used_bytes: 4e9, reserved_bytes: 0, remaining_bytes: 6e9, unknown_size_files: 0 },
  ...over,
} as AccountUsage)

const allowance = { enabled: true, used: 1, limit: 3, remaining: 2, resets_at: '2026-11-26T00:00:00Z' }
const coach: CoachAllowances = { tier: 'free', match_report: { enabled: true }, starting_report: { enabled: true }, notes: allowance, key_moments: { ...allowance, remaining: 0 }, round_reviews: { ...allowance, enabled: false } }

describe('capabilityRows', () => {
  it('puts every allowance in one table with what uses it and when it resets', () => {
    const rows = capabilityRows(usage(), coach)
    expect(rows.map(r => r.id)).toEqual(['notes', 'key_moments', 'reports', 'purchased', 'coach_credits', 'cloud'])
    const reports = rows.find(r => r.id === 'reports')!
    expect(reports.left).toBe('2 of 3 left')
    expect(reports.usedBy).toMatch(/full-match AI report/)
    expect(reports.resets).toMatch(/^Monthly · next /)
    expect(reports.more).toBe('buy_reports')
  })

  it('says "used up" in words, not only colour', () => {
    expect(capabilityRows(usage(), coach).find(r => r.id === 'key_moments')!.empty).toBe(true)
  })

  it('offers no storage purchase when the account has no cap', () => {
    const cloud = capabilityRows(usage({ cloud_storage: { included_bytes: null, addon_bytes: 0, capacity_bytes: null, used_bytes: 1, reserved_bytes: 0, remaining_bytes: null, unknown_size_files: 0 } }), null).find(r => r.id === 'cloud')!
    expect(cloud.left).toBe('No cap')
    expect(cloud.more).toBeNull()
  })

  it('shows purchased credits and lifetime allowances honestly', () => {
    const rows = capabilityRows(usage({ reports: { used: 1, limit: 1, remaining: 0, period: 'lifetime', resets_at: null, reset_on_next_use: false, purchased: 2 } }), null)
    expect(rows.find(r => r.id === 'reports')!.resets).toBe("Lifetime, doesn't reset")
    expect(rows.find(r => r.id === 'purchased')!.left).toBe('2 left')
  })
})
