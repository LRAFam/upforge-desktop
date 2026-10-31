import { describe, expect, it } from 'vitest'
import { validCloudPage, cloudBytes, cloudRetention } from './cloud-storage'
const sample = () => ({ version: 1, page: 1, last_page: 1, total: 1, items: [{ id: '4', kind: 'clip', title: null, map: null, status: 'stored', bytes: null, expires_at: null, created_at: '2026-09-28 12:00:00' }] })
describe('cloud storage data contract', () => {
  it('keeps unknown sizes distinct from zero', () => { expect(validCloudPage(sample())).toBe(true); expect(cloudBytes(null)).toBe('Size unavailable'); expect(cloudBytes(0)).toBe('0.0 MB'); expect(cloudBytes(1e9)).toBe('1.00 GB') })
  it('rejects invalid identifiers, timestamps and negative sizes', () => {
    for (const change of [{ id: '../anything' }, { created_at: 'invalid' }, { bytes: -1 }, { kind: 'local' }, { expires_at: 123 }]) {
      const value = sample(); Object.assign(value.items[0], change); expect(validCloudPage(value)).toBe(false)
    }
  })
})

describe('cloud retention labels', () => {
  const now = Date.parse('2026-09-28T12:00:00Z')
  it('distinguishes elapsed retention from files due soon', () => {
    expect(cloudRetention(null, now).state).toBe('kept')
    expect(cloudRetention(new Date(now).toISOString(), now).state).toBe('expired')
    expect(cloudRetention(new Date(now + 1).toISOString(), now).label).toBe('Expires within 24 hours')
    expect(cloudRetention(new Date(now + 7 * 86400000).toISOString(), now).state).toBe('soon')
    expect(cloudRetention(new Date(now + 7 * 86400000 + 1).toISOString(), now).state).toBe('scheduled')
  })
})
