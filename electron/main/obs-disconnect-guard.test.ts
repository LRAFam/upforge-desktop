import { describe, expect, it } from 'vitest'
import {
  shouldKeepMatchOwnershipWhileDisconnected,
  shouldReleaseOwnershipAfterReconnect,
} from './obs-disconnect-guard'

describe('shouldKeepMatchOwnershipWhileDisconnected', () => {
  it('keeps ownership when WebSocket dropped mid-recording', () => {
    expect(shouldKeepMatchOwnershipWhileDisconnected({
      matchOwned: true,
      connected: false,
      disconnectedDuringRecording: true,
    })).toBe(true)
  })

  it('does not keep ownership when connected or not mid-recording disconnect', () => {
    expect(shouldKeepMatchOwnershipWhileDisconnected({
      matchOwned: true,
      connected: true,
      disconnectedDuringRecording: true,
    })).toBe(false)
    expect(shouldKeepMatchOwnershipWhileDisconnected({
      matchOwned: true,
      connected: false,
      disconnectedDuringRecording: false,
    })).toBe(false)
    expect(shouldKeepMatchOwnershipWhileDisconnected({
      matchOwned: false,
      connected: false,
      disconnectedDuringRecording: true,
    })).toBe(false)
  })
})

describe('shouldReleaseOwnershipAfterReconnect', () => {
  it('releases only when reconnected and OBS output is idle', () => {
    expect(shouldReleaseOwnershipAfterReconnect({
      matchOwned: true,
      disconnectedDuringRecording: true,
      outputActive: false,
    })).toBe(true)
    expect(shouldReleaseOwnershipAfterReconnect({
      matchOwned: true,
      disconnectedDuringRecording: true,
      outputActive: true,
    })).toBe(false)
  })
})
