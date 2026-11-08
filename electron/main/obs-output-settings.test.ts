import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

vi.mock('electron-log', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

import { applyObsRecordingSettings } from './obs-output-settings'

let root: string
let savePath: string
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'upforge-obs-output-'))
  savePath = path.join(root, 'users', '3', 'recordings')
})
afterEach(() => { fs.rmSync(root, { recursive: true, force: true }) })

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
      savePath,
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
      savePath,
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
      savePath,
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
      savePath,
      captureMonitor: 'auto',
      clipsOnly: false,
    })

    expect(call.mock.calls.some(([name]) => name === 'SetVideoSettings')).toBe(false)
  })

  it('creates the new profile folder before pointing OBS at it', async () => {
    const call = vi.fn(async (name: string) => {
      if (name === 'SetRecordDirectory') expect(fs.statSync(savePath).isDirectory()).toBe(true)
      return { parameterValue: 'Simple' }
    })
    await applyObsRecordingSettings({ call } as never, {
      quality: '720p', bitrate: 5, audioEnabled: true, savePath, captureMonitor: 'auto', manageObsVideo: false,
    })
    expect(fs.statSync(savePath).isDirectory()).toBe(true)
    expect(call).toHaveBeenCalledWith('SetRecordDirectory', { recordDirectory: savePath })
  })

  it('blocks output changes when the profile folder cannot be created', async () => {
    fs.writeFileSync(path.join(root, 'users'), 'an existing file')
    const call = vi.fn(async () => ({ parameterValue: 'Simple' }))
    const result = await applyObsRecordingSettings({ call } as never, {
      quality: '720p', bitrate: 5, audioEnabled: true, savePath, captureMonitor: 'auto', manageObsVideo: false,
    })
    expect(result).toMatchObject({ ok: false, blocking: true, errors: ['recording_directory'] })
    expect(result.warnings[0]).toContain('recording folder')
    expect(call).not.toHaveBeenCalled()
    expect(fs.readFileSync(path.join(root, 'users'), 'utf8')).toBe('an existing file')
  })

  function profileWrites(call: ReturnType<typeof vi.fn>): Array<[string, string, string]> {
    return call.mock.calls
      .filter(([name]) => name === 'SetProfileParameter')
      .map(([, args]) => [args.parameterCategory, args.parameterName, args.parameterValue])
  }

  function simpleObs() {
    return vi.fn(async (name: string, args?: Record<string, unknown>) => {
      if (name === 'GetProfileParameter') {
        if (args?.parameterName === 'Mode') return { parameterValue: 'Simple' }
        return { parameterValue: null }
      }
      if (name === 'GetVideoSettings') return { outputWidth: 1920, outputHeight: 1080 }
      return {}
    })
  }

  it('writes the detected hardware encoder for recording only', async () => {
    const call = simpleObs()
    await applyObsRecordingSettings({ call } as never, {
      quality: '1080p', bitrate: 10, fps: 60, manageObsVideo: false, audioEnabled: true, savePath, captureMonitor: 'auto',
    }, '31.0.0', {
      detectEncoders: async () => ({ available: process.platform === 'darwin' ? ['apple_h264'] : ['nvenc', 'qsv'], source: 'obs-log' }),
    })
    const writes = profileWrites(call)
    const expected = process.platform === 'darwin' ? 'apple_h264' : process.platform === 'win32' ? 'nvenc' : 'x264'
    expect(writes).toContainEqual(['SimpleOutput', 'RecEncoder', expected])
    expect(writes).toContainEqual(['SimpleOutput', 'RecQuality', 'Small'])
    // Never touch the user's streaming encoder, bitrate or service settings.
    expect(writes.some(([category, key]) => category === 'Stream1' || key === 'StreamEncoder' || key === 'VBitrate')).toBe(false)
  })

  it.each([
    ['returns null', async () => null],
    ['throws', async () => { throw new Error('boom') }],
  ])('keeps the previous Small-quality behaviour when detection %s', async (_label, detectEncoders) => {
    const call = simpleObs()
    const result = await applyObsRecordingSettings({ call } as never, {
      quality: '720p', bitrate: 5, fps: 30, manageObsVideo: false, audioEnabled: true, savePath, captureMonitor: 'auto',
    }, '31.0.0', { detectEncoders })
    const writes = profileWrites(call)
    expect(writes).toContainEqual(['SimpleOutput', 'RecQuality', 'Small'])
    expect(writes.some(([, key]) => key === 'RecEncoder' || key === 'VBitrate')).toBe(false)
    expect(result.blocking).toBe(false)
  })
})

