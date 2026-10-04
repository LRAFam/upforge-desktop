import { describe, expect, it, vi } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { OBSWebSocketError } from 'obs-websocket-js'
import { isCompatibleObsVersion, readGuidedObsOutputs, runGuidedObsSetup, type GuidedObsSetupDependencies } from './obs-guided-setup'

vi.mock('electron-log', () => ({ default: { debug: vi.fn() } }))

function fixture() {
  return {
    isRecording: vi.fn(() => false), isConnected: vi.fn(() => false),
    isRunning: vi.fn(async () => false), isInstalled: vi.fn(() => false),
    install: vi.fn(async () => ({ ok: true })), configure: vi.fn(() => ({ ok: true })),
    connect: vi.fn(async () => ({ ok: true })),
    version: vi.fn(async () => ({ obsVersion: '32.0.1', obsWebSocketVersion: '5.6.3' })),
    outputs: vi.fn(async () => ({ recording: false, streaming: false, replayBuffer: false })),
    setupCapture: vi.fn(async () => ({ ok: true })), testRecording: vi.fn(async () => ({ ok: true })),
    progress: vi.fn(),
  } satisfies GuidedObsSetupDependencies
}

describe('guided OBS setup', () => {
  function withOutputReader(overrides: Partial<Record<'GetRecordStatus' | 'GetStreamStatus' | 'GetReplayBufferStatus', boolean | Error>> = {}) {
    const d = fixture()
    d.isConnected.mockReturnValue(true)
    const call = vi.fn(async (request: 'GetRecordStatus' | 'GetStreamStatus' | 'GetReplayBufferStatus') => {
      const response = overrides[request] ?? false
      if (response instanceof Error) throw response
      return { outputActive: response }
    })
    d.outputs.mockImplementation(() => readGuidedObsOutputs({ call }))
    return { d, call }
  }

  it('finishes setup when OBS explicitly reports that the replay buffer is unavailable', async () => {
    const { d, call } = withOutputReader({
      GetReplayBufferStatus: new OBSWebSocketError(604, 'Replay buffer is not available.'),
    })
    expect(await runGuidedObsSetup(d)).toEqual({ ok: true, studioVersion: '32.0.1' })
    expect(d.setupCapture).toHaveBeenCalledOnce()
    expect(d.testRecording).toHaveBeenCalledOnce()
    expect(call.mock.calls.filter(([request]) => request === 'GetReplayBufferStatus')).toHaveLength(3)
  })

  it.each(['GetRecordStatus', 'GetStreamStatus'] as const)('still protects %s when the replay buffer is unavailable', async request => {
    const { d } = withOutputReader({
      GetReplayBufferStatus: new OBSWebSocketError(604, 'Replay buffer is not available.'),
      [request]: true,
    })
    expect((await runGuidedObsSetup(d)).ok).toBe(false)
    expect(d.setupCapture).not.toHaveBeenCalled()
    expect(d.testRecording).not.toHaveBeenCalled()
  })

  it.each([
    new OBSWebSocketError(604, 'Another resource is unavailable.'),
    new OBSWebSocketError(500, 'Replay buffer is not available.'),
    new OBSWebSocketError(1006, 'Connection closed'),
    new Error('Replay buffer is not available.'),
  ])('does not treat an unrecognised replay status error as idle: %s', async error => {
    const { d } = withOutputReader({ GetReplayBufferStatus: error })
    expect(await runGuidedObsSetup(d)).toEqual({ ok: false, error: error.message })
    expect(d.setupCapture).not.toHaveBeenCalled()
    expect(d.testRecording).not.toHaveBeenCalled()
  })

  it.each(['GetRecordStatus', 'GetStreamStatus'] as const)('does not suppress a failure from %s', async request => {
    const error = new OBSWebSocketError(604, 'Replay buffer is not available.')
    const { d } = withOutputReader({ [request]: error })
    expect(await runGuidedObsSetup(d)).toEqual({ ok: false, error: error.message })
    expect(d.setupCapture).not.toHaveBeenCalled()
  })

  it('protects an active replay buffer read from OBS', async () => {
    const { d } = withOutputReader({ GetReplayBufferStatus: true })
    expect((await runGuidedObsSetup(d)).ok).toBe(false)
    expect(d.setupCapture).not.toHaveBeenCalled()
    expect(d.testRecording).not.toHaveBeenCalled()
  })

  it('installs, configures and tests a fresh installation in order', async () => {
    const d = fixture()
    expect(await runGuidedObsSetup(d)).toEqual({ ok: true, studioVersion: '32.0.1' })
    expect(d.progress.mock.calls.flat()).toEqual(['checking', 'installing', 'connecting', 'version', 'capture', 'testing', 'complete'])
    expect(d.configure).toHaveBeenCalledOnce()
    expect(d.testRecording).toHaveBeenCalledOnce()
  })
  it('does not touch an unreachable running OBS instance', async () => {
    const d = fixture(); d.isRunning.mockResolvedValue(true)
    expect((await runGuidedObsSetup(d)).ok).toBe(false)
    expect(d.configure).not.toHaveBeenCalled()
    expect(d.install).not.toHaveBeenCalled()
    expect(d.connect).not.toHaveBeenCalled()
  })
  it.each(['recording', 'streaming', 'replayBuffer'] as const)('protects an active %s', async key => {
    const d = fixture(); d.isConnected.mockReturnValue(true)
    d.outputs.mockResolvedValue({ recording: false, streaming: false, replayBuffer: false, [key]: true })
    expect((await runGuidedObsSetup(d)).ok).toBe(false)
    expect(d.setupCapture).not.toHaveBeenCalled()
    expect(d.testRecording).not.toHaveBeenCalled()
  })
  it('fails closed if output status cannot be read', async () => {
    const d = fixture(); d.outputs.mockRejectedValue(new Error('status unavailable'))
    expect((await runGuidedObsSetup(d)).ok).toBe(false)
    expect(d.setupCapture).not.toHaveBeenCalled()
  })
  it('checks again when a stream starts during setup', async () => {
    const d = fixture()
    d.outputs.mockResolvedValueOnce({ recording: false, streaming: false, replayBuffer: false })
      .mockResolvedValue({ recording: false, streaming: true, replayBuffer: false })
    expect((await runGuidedObsSetup(d)).ok).toBe(false)
    expect(d.setupCapture).not.toHaveBeenCalled()
  })
  it('does not claim success when configuration or recording fails', async () => {
    const d = fixture(); d.configure.mockReturnValue({ ok: false })
    expect((await runGuidedObsSetup(d)).ok).toBe(false)
    expect(d.connect).not.toHaveBeenCalled()
    const t = fixture(); t.testRecording.mockResolvedValue({ ok: false })
    expect((await runGuidedObsSetup(t)).ok).toBe(false)
    expect(t.progress).not.toHaveBeenCalledWith('complete')
  })
  it.each([['27.2.4', '5.0.0'], ['32.0.0-beta1', '5.6.0'], ['', '5.6.0'], ['32.0.0', '6.0.0']])('rejects unsupported or unknown versions %s / %s', (obs, ws) => {
    expect(isCompatibleObsVersion(obs, ws)).toBe(false)
  })
  it('blocks an incompatible version before capture changes', async () => {
    const d = fixture(); d.version.mockResolvedValue({ obsVersion: '27.2.4', obsWebSocketVersion: '5.0.0' })
    expect((await runGuidedObsSetup(d)).ok).toBe(false)
    expect(d.setupCapture).not.toHaveBeenCalled()
  })
  it('ships the OBS profile at the location required by the packaged app', () => {
    const pkg = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'))
    expect(pkg.build.extraResources).toContainEqual({ from: 'resources/obs', to: 'obs', filter: ['**/*'] })
    expect(existsSync(new URL('../../resources/obs/upforge-profile/basic.ini', import.meta.url))).toBe(true)
  })
})
