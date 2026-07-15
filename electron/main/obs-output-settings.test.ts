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
})
