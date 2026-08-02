import { describe, expect, it } from 'vitest'
import {
  canHardRecoverObs,
  canMutateObsCaptureHot,
  shouldReclaimAfterProcessDeath,
  shouldRelaunchAfterFinalize,
} from './obs-watchdog-policy'

const idle = {
  processRunning: true,
  matchOwned: false,
  activelyRecording: false,
  disconnectedDuringRecording: false,
  outputActive: false,
}

describe('canHardRecoverObs', () => {
  it('allows hard recover when idle', () => {
    expect(canHardRecoverObs(idle)).toBe(true)
  })

  it('blocks when match-owned / actively recording / disconnected-during / outputActive / perf mode', () => {
    expect(canHardRecoverObs({ ...idle, matchOwned: true })).toBe(false)
    expect(canHardRecoverObs({ ...idle, activelyRecording: true })).toBe(false)
    expect(canHardRecoverObs({ ...idle, disconnectedDuringRecording: true })).toBe(false)
    expect(canHardRecoverObs({ ...idle, outputActive: true })).toBe(false)
    expect(canHardRecoverObs({ ...idle, matchPerformanceModeActive: true })).toBe(false)
  })
})

describe('shouldReclaimAfterProcessDeath', () => {
  it('reclaims when process dead and match owned', () => {
    expect(shouldReclaimAfterProcessDeath({
      ...idle,
      processRunning: false,
      matchOwned: true,
    })).toBe(true)
  })

  it('does not reclaim when process still running', () => {
    expect(shouldReclaimAfterProcessDeath({ ...idle, matchOwned: true })).toBe(false)
  })

  it('reclaims when process dead during disconnected match-owned session', () => {
    expect(shouldReclaimAfterProcessDeath({
      processRunning: false,
      matchOwned: true,
      activelyRecording: false,
      disconnectedDuringRecording: true,
      outputActive: false,
    })).toBe(true)
  })
})

describe('shouldRelaunchAfterFinalize', () => {
  it('allows relaunch when process dead and ownership already released', () => {
    expect(shouldRelaunchAfterFinalize({
      ...idle,
      processRunning: false,
      matchOwned: false,
    })).toBe(true)
  })

  it('blocks relaunch while still match-owned', () => {
    expect(shouldRelaunchAfterFinalize({
      ...idle,
      processRunning: false,
      matchOwned: true,
    })).toBe(false)
  })
})

describe('canMutateObsCaptureHot', () => {
  it('allows cold mutations', () => {
    expect(canMutateObsCaptureHot(idle)).toBe(true)
  })

  it('blocks while owned / active / disconnected-during / outputActive', () => {
    expect(canMutateObsCaptureHot({ ...idle, outputActive: true })).toBe(false)
    expect(canMutateObsCaptureHot({ ...idle, matchOwned: true })).toBe(false)
  })
})
