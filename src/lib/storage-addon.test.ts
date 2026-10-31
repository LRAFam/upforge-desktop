import { expect, it } from 'vitest'
import { validStorageRequest, validStorageSnapshot } from './storage-addon'
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
