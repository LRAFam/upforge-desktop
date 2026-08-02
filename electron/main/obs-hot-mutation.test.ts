import { describe, expect, it } from 'vitest'
import { buildRetargetMutationFlags, buildSetupMutationFlags } from './obs-watchdog-policy'

describe('buildRetargetMutationFlags', () => {
  const idle = {
    gameChanged: true,
    matchOwned: false,
    recording: false,
    disconnectedDuringRecording: false,
  }

  it('allows recreate when idle and game changed', () => {
    expect(buildRetargetMutationFlags(idle)).toEqual({
      forceRecreate: true,
      allowRecreate: true,
    })
  })

  it('allows recreate without force when game unchanged', () => {
    expect(buildRetargetMutationFlags({ ...idle, gameChanged: false })).toEqual({
      forceRecreate: false,
      allowRecreate: true,
    })
  })

  it('blocks recreate while actively recording (gameplay refit)', () => {
    expect(buildRetargetMutationFlags({ ...idle, recording: true })).toEqual({
      forceRecreate: false,
      allowRecreate: false,
    })
  })

  it('blocks recreate while match-owned', () => {
    expect(buildRetargetMutationFlags({ ...idle, matchOwned: true })).toEqual({
      forceRecreate: false,
      allowRecreate: false,
    })
  })

  it('blocks recreate while disconnected during recording', () => {
    expect(buildRetargetMutationFlags({
      ...idle,
      disconnectedDuringRecording: true,
    })).toEqual({
      forceRecreate: false,
      allowRecreate: false,
    })
  })
})

describe('buildSetupMutationFlags', () => {
  const idle = {
    matchOwned: false,
    recording: false,
    disconnectedDuringRecording: false,
    outputActive: false,
  }

  it('allows recreate when idle', () => {
    expect(buildSetupMutationFlags(idle)).toEqual({ allowRecreate: true })
  })

  it('blocks recreate when match-owned (mid-match reconnect)', () => {
    expect(buildSetupMutationFlags({ ...idle, matchOwned: true })).toEqual({
      allowRecreate: false,
    })
  })

  it('blocks recreate when OBS output is active', () => {
    expect(buildSetupMutationFlags({ ...idle, outputActive: true })).toEqual({
      allowRecreate: false,
    })
  })

  it('blocks recreate when disconnected during recording', () => {
    expect(buildSetupMutationFlags({
      ...idle,
      disconnectedDuringRecording: true,
    })).toEqual({ allowRecreate: false })
  })
})
