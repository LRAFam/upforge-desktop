import { describe, expect, it } from 'vitest'
import { explainObsConnectionFailure } from './obs-connect'

describe('explainObsConnectionFailure', () => {
  it('says OBS is not running when no process', () => {
    expect(explainObsConnectionFailure({ processRunning: false })).toMatch(/not running/i)
  })

  it('says to open OBS manually when launch did not start a process', () => {
    expect(explainObsConnectionFailure({ processRunning: false, launched: true })).toMatch(/manually/i)
  })

  it('suggests crash recovery when process is running but not connected', () => {
    expect(explainObsConnectionFailure({ processRunning: true, connectError: 'ECONNREFUSED' })).toMatch(/crashed|not responding/i)
  })

  it('preserves auth errors when process is running', () => {
    expect(explainObsConnectionFailure({ processRunning: true, connectError: 'authentication failed' })).toMatch(/password/i)
  })
})
