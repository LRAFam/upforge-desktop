import { describe, expect, it } from 'vitest'
import { resolveObsRecordVerifyMs, waitForObsRecordArmed } from './obs-start-verify'

describe('waitForObsRecordArmed', () => {
  it('returns armed when output becomes active', async () => {
    let n = 0
    const result = await waitForObsRecordArmed({
      getOutputActive: async () => (++n) >= 2,
      timeoutMs: 1000,
      intervalMs: 10,
      sleep: async () => {},
    })
    expect(result).toEqual({ armed: true })
  })

  it('defaults to 5000ms', () => {
    expect(resolveObsRecordVerifyMs()).toBe(5000)
  })

  it('reads env override and clamps to 15000ms max', () => {
    expect(resolveObsRecordVerifyMs({ envValue: '12000' })).toBe(12000)
    expect(resolveObsRecordVerifyMs({ envValue: '99999' })).toBe(15000)
    expect(resolveObsRecordVerifyMs({ envValue: '100' })).toBe(1000)
  })

  it('falls back to settings when env is unset', () => {
    expect(resolveObsRecordVerifyMs({ envValue: '', settingsMs: 8000 })).toBe(8000)
    expect(resolveObsRecordVerifyMs({ settingsMs: 20000 })).toBe(15000)
  })

  it('prefers env over settings', () => {
    expect(resolveObsRecordVerifyMs({ envValue: '6000', settingsMs: 9000 })).toBe(6000)
  })

  it('times out when never active', async () => {
    let now = 0
    const result = await waitForObsRecordArmed({
      getOutputActive: async () => false,
      timeoutMs: 100,
      intervalMs: 50,
      now: () => now,
      sleep: async (ms) => { now += ms },
    })
    expect(result).toEqual({ armed: false, timedOut: true })
  })
})
