import { describe, expect, it, vi } from 'vitest'

vi.mock('electron-log', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

import { applyObsRecordingSettings } from './obs-output-settings'

describe('applyObsRecordingSettings replay configuration', () => {
  it('writes RecRB as a boolean and never as bitrate', async () => {
    const call = vi.fn(async (name: string, args?: Record<string, unknown>) => {
      if (name === 'GetProfileParameter') {
        if (args?.parameterName === 'Mode') return { parameterValue: 'Simple' }
        if (args?.parameterName === 'RecRB') return { parameterValue: 'false' }
        return { parameterValue: null }
      }
      if (name === 'GetVideoSettings') return { outputWidth: 1280, outputHeight: 720 }
      return {}
    })

    await applyObsRecordingSettings({ call } as never, {
      quality: '720p',
      bitrate: 5,
      fps: 30,
      manageObsVideo: false,
      audioEnabled: true,
      savePath: '/recordings',
      captureMonitor: 'auto',
      clipsOnly: false,
    })

    const recRbWrites = call.mock.calls.filter(([name, args]) =>
      name === 'SetProfileParameter'
      && args?.parameterCategory === 'SimpleOutput'
      && args?.parameterName === 'RecRB')
    expect(recRbWrites).toEqual([
      ['SetProfileParameter', {
        parameterCategory: 'SimpleOutput',
        parameterName: 'RecRB',
        parameterValue: 'false',
      }],
    ])
  })

  it('blocks start when Output Mode remains Advanced after Simple push', async () => {
    const call = vi.fn(async (name: string, args?: Record<string, unknown>) => {
      if (name === 'GetProfileParameter' && args?.parameterName === 'Mode') {
        return { parameterValue: 'Advanced' }
      }
      if (name === 'GetProfileParameter') return { parameterValue: null }
      if (name === 'GetVideoSettings') return { outputWidth: 1280, outputHeight: 720 }
      return {}
    })

    const result = await applyObsRecordingSettings({ call } as never, {
      quality: '720p',
      bitrate: 5,
      fps: 30,
      manageObsVideo: false,
      audioEnabled: true,
      savePath: '/recordings',
      captureMonitor: 'auto',
      clipsOnly: false,
    })

    expect(result.blocking).toBe(true)
    expect(result.ok).toBe(false)
    expect(result.errors).toContain('advanced_output')
    expect(result.outputMode).toBe('Advanced')
  })

  it('pushes 1080p canvas when manageObsVideo is true', async () => {
    const call = vi.fn(async (name: string, args?: Record<string, unknown>) => {
      if (name === 'GetProfileParameter') {
        if (args?.parameterName === 'Mode') return { parameterValue: 'Simple' }
        return { parameterValue: null }
      }
      if (name === 'GetVideoSettings') return { outputWidth: 1920, outputHeight: 1080 }
      return {}
    })

    await applyObsRecordingSettings({ call } as never, {
      quality: '1080p',
      bitrate: 10,
      fps: 60,
      manageObsVideo: true,
      audioEnabled: true,
      savePath: '/recordings',
      captureMonitor: 'auto',
      clipsOnly: false,
    })

    expect(call.mock.calls.some(([name, args]) =>
      name === 'SetVideoSettings'
      && args?.baseWidth === 1920
      && args?.baseHeight === 1080
      && args?.fpsNumerator === 60,
    )).toBe(true)
  })

  it('does not reset OBS video when canvas and fps already match', async () => {
    const call = vi.fn(async (name: string, args?: Record<string, unknown>) => {
      if (name === 'GetProfileParameter') {
        if (args?.parameterName === 'Mode') return { parameterValue: 'Simple' }
        return { parameterValue: null }
      }
      if (name === 'GetVideoSettings') {
        return {
          baseWidth: 1280,
          baseHeight: 720,
          outputWidth: 1280,
          outputHeight: 720,
          fpsNumerator: 30,
          fpsDenominator: 1,
        }
      }
      return {}
    })

    await applyObsRecordingSettings({ call } as never, {
      quality: '720p',
      bitrate: 5,
      fps: 30,
      manageObsVideo: true,
      audioEnabled: true,
      savePath: '/recordings',
      captureMonitor: 'auto',
      clipsOnly: false,
    })

    expect(call.mock.calls.some(([name]) => name === 'SetVideoSettings')).toBe(false)
  })
})
