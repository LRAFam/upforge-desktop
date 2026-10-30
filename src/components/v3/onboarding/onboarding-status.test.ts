import { describe, expect, it } from 'vitest'
import {
  ONBOARDING_GAME_LOGOS,
  captureCheckTone,
  captureMessageTone,
  missionStageTone,
  progressRowTone,
  recordingCheckTone,
} from './onboarding-status'

describe('onboarding v3 status tones', () => {
  it('puts the recording error before a passed check', () => {
    expect(recordingCheckTone({ error: true, ready: true, connecting: false })).toBe('warn')
    expect(recordingCheckTone({ error: false, ready: true, connecting: false })).toBe('ok')
    expect(recordingCheckTone({ error: false, ready: false, connecting: true })).toBe('live')
    expect(recordingCheckTone({ error: false, ready: false, connecting: false })).toBe('idle')
  })

  it('maps capture checks and progress rows', () => {
    expect(captureCheckTone('ok')).toBe('ok')
    expect(captureCheckTone('active')).toBe('rec')
    expect(captureCheckTone('error')).toBe('warn')
    expect(captureCheckTone('pending')).toBe('idle')
    expect(progressRowTone('complete')).toBe('ok')
    expect(progressRowTone('active')).toBe('live')
    expect(progressRowTone('pending')).toBe('idle')
  })

  it('maps mission stages', () => {
    expect(missionStageTone('recording')).toBe('rec')
    expect(missionStageTone('ready')).toBe('ok')
    expect(missionStageTone('failed')).toBe('warn')
    expect(missionStageTone('uploading')).toBe('live')
  })

  it('keeps the old capture message rule', () => {
    const base = { obsConnected: true, valorantInFront: false, captureVerified: false, obsRecording: false }
    expect(captureMessageTone({ ...base, obsConnected: false })).toBe('warn')
    expect(captureMessageTone({ ...base, valorantInFront: true })).toBe('warn')
    expect(captureMessageTone({ ...base, obsRecording: true })).toBe('rec')
    expect(captureMessageTone(base)).toBe('ok')
  })

  it('has a logo for every primary game', () => {
    expect(Object.keys(ONBOARDING_GAME_LOGOS).sort()).toEqual(['cs2', 'deadlock', 'lol', 'valorant'])
  })
})
