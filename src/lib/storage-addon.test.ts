import { describe, expect, it } from 'vitest'
import { hideStorageOffer, packEndLine, packGain, validStorageRequest, validStorageSnapshot } from './storage-addon'
it('accepts only known actions and pack amounts', () => {
  expect(validStorageRequest({ action: 'checkout', gb: 50 })).toBe(true)
  expect(validStorageRequest({ action: 'change', gb: 51 })).toBe(false)
  expect(validStorageRequest({ action: 'keep', kind: 'clip', id: '../12' })).toBe(false)
})
it('rejects incomplete or negative storage accounting', () => {
  const data = { usage: { active: true, capacity_bytes: 50e9, used_bytes: 0, reserved_bytes: 0, remaining_bytes: 50e9, paid_until: null, grace_until: null, cancel_at_period_end: false, status: 'active' }, packs: [{ gb: 50, cents: 499, available: true }], grace_days: 14 }
  expect(validStorageSnapshot(data)).toBe(true)
  expect(validStorageSnapshot({ ...data, usage: { ...data.usage, used_bytes: -1 } })).toBe(false)
  expect(validStorageSnapshot({ packs: data.packs })).toBe(false)
})

it('confirms only paid active capacity matching the selected pack', async () => {
  const { storagePaymentConfirmed } = await import('./storage-addon')
  const data = { usage: { active: true, capacity_bytes: 100e9, used_bytes: 0, reserved_bytes: 0, remaining_bytes: 100e9, paid_until: null, grace_until: null, cancel_at_period_end: false, status: 'active' }, packs: [{ gb: 100, cents: 998, available: true }], grace_days: 14 }
  expect(storagePaymentConfirmed(data, 100)).toBe(true)
  expect(storagePaymentConfirmed(data, 50)).toBe(false)
  expect(storagePaymentConfirmed({ ...data, usage: { ...data.usage, status: 'past_due' } }, 100)).toBe(false)
  expect(storagePaymentConfirmed({ ...data, usage: { ...data.usage, active: false } }, 100)).toBe(false)
  expect(validStorageRequest({ action: 'sync' })).toBe(true)
})

describe('packEndLine', () => {
  it('uses the retention grace once retention has started, not the old pack window', () => {
    const line = packEndLine({ retentionStarted: true, packGraceDays: 14, retentionGraceDays: 30, freeKeepDays: 14 })
    expect(line).toContain('your full videos stay for 30 days, then Free rules apply (each video kept 14 days)')
    expect(line).not.toContain('14 days before')
  })
  it('keeps the pack download window before retention starts', () => {
    expect(packEndLine({ retentionStarted: false, packGraceDays: 14 })).toContain('you have 14 days to download them')
  })
  it('leaves out numbers the API did not send', () => {
    expect(packEndLine({ retentionStarted: true, packGraceDays: null, retentionGraceDays: null, freeKeepDays: null })).not.toMatch(/\d/)
  })
})

describe('storage offer for accounts with no cap', () => {
  it('hides the upsell for unlimited accounts but keeps pack management', () => {
    expect(hideStorageOffer(true, true, false)).toBe(true)
    expect(hideStorageOffer(true, false, false)).toBe(true)
    expect(hideStorageOffer(true, true, true)).toBe(false)
    expect(hideStorageOffer(false, true, false)).toBe(false)
  })
  it('says exactly what a pack adds', () => {
    const fmt = (n: number) => `${n / 1e9} GB`
    expect(packGain(10e9, 0, 50, fmt)).toBe('Your cloud space: 10 GB → 60 GB')
    expect(packGain(10e9, 50e9, 100, fmt)).toBe('Your cloud space: 60 GB → 110 GB')
    expect(packGain(10e9, 50e9, 50, fmt)).toBe('Your cloud space: 60 GB (this is your current pack)')
    expect(packGain(null, 0, 50, fmt)).toBe('')
  })
})
