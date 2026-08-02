import { describe, expect, it } from 'vitest'
import { waitForObsRecordArmed } from './obs-start-verify'

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
