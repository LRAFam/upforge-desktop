import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { OBSRecorder } from './obs-recorder'

const mock = vi.hoisted(() => ({ call: vi.fn(), on: vi.fn(), root: '', handlers: new Map<string, (data: unknown) => void>() }))
vi.mock('obs-websocket-js', () => ({
  OBSWebSocket: class {
    call = mock.call
    on = (event: string, fn: (data: unknown) => void) => { mock.handlers.set(event, fn); mock.on(event, fn) }
  },
}))
vi.mock('electron', () => ({ app: { getPath: () => mock.root, getAppPath: () => mock.root }, nativeImage: {} }))
vi.mock('electron-log', () => ({ default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))
vi.mock('./disk-space', () => ({ getFreeDiskSpace: vi.fn(async () => Infinity), CRITICAL_FREE_DISK_BYTES: 100, WARN_FREE_DISK_BYTES: 200 }))
vi.mock('./obs-setup', () => ({ UPFORGE_SCENE_NAME: 'UpForge', retargetUpForgeCapture: vi.fn(), fitUpForgeCaptureToCanvas: vi.fn(), getUpForgeSceneIdentity: vi.fn(async () => null) }))
vi.mock('./game-window-finder', () => ({ resolveObsCaptureWindow: async () => 'CS2', findObsWindowString: async () => null }))

const config = { quality: '720p', bitrate: 5, audioEnabled: true, savePath: '', captureMonitor: 'auto', manageObsVideo: false, clipsOnly: true } as const

/** Fake OBS where the replay buffer behaves as `replay` says. */
function fakeObs(replay: { startError?: { code: number; message: string }; becomesActive?: boolean }) {
  let replayActive = false
  mock.call.mockImplementation(async (method: string) => {
    if (method === 'GetProfileParameter') return { parameterValue: 'Simple' }
    if (method === 'GetProfileList') return { currentProfileName: 'UpForge', profiles: ['UpForge'] }
    if (method === 'StartReplayBuffer') {
      if (replay.startError) throw Object.assign(new Error(replay.startError.message), { code: replay.startError.code })
      if (replay.becomesActive !== false) replayActive = true
      return {}
    }
    if (method === 'StopReplayBuffer') { replayActive = false; return {} }
    if (method === 'GetReplayBufferStatus') return { outputActive: replayActive }
    return { outputActive: false, outputBytes: 0 }
  })
  return { setReplayActive: (v: boolean) => { replayActive = v } }
}

function startingRecorder() {
  const rec = new OBSRecorder(() => ({ host: 'localhost', port: 4455, password: '', replayBufferSeconds: 30, obsPreserveActiveScene: false }))
  Object.assign(rec, { _connected: true })
  rec.onStatusChange = vi.fn()
  vi.spyOn(rec, 'isCurrentProgramSceneGameplay').mockResolvedValue(true)
  vi.spyOn(rec as unknown as { _startLiveKillPoll(): void }, '_startLiveKillPoll').mockImplementation(() => {})
  return rec
}

beforeEach(() => {
  vi.useFakeTimers(); vi.clearAllMocks(); mock.handlers.clear()
  mock.root = fs.mkdtempSync(path.join(os.tmpdir(), 'upforge-clips-only-'))
})
afterEach(() => {
  vi.clearAllTimers(); vi.useRealTimers()
  fs.rmSync(mock.root, { recursive: true, force: true })
})

describe('clips-only capture is only reported once its replay buffer runs', () => {
  it('a rejected StartReplayBuffer fails the start and never reports recording', async () => {
    fakeObs({ startError: { code: 604, message: 'Replay buffer disabled' } })
    const rec = startingRecorder()
    const starting = Promise.allSettled([rec.start('valorant', { ...config, savePath: mock.root })])
    await vi.advanceTimersByTimeAsync(1000)
    const [result] = await starting
    expect(result.status).toBe('rejected')
    expect(String((result as PromiseRejectedResult).reason)).toMatch(/Replay Buffer could not start/)
    expect(rec.isRecording()).toBe(false)
    expect(rec.isActivelyRecording()).toBe(false)
    expect(rec.onStatusChange).not.toHaveBeenCalledWith(true)
    expect(rec.onStatusChange).toHaveBeenCalledWith(false, expect.stringMatching(/Replay Buffer/), 'start')
    expect(mock.call).not.toHaveBeenCalledWith('StartRecord')
  })

  it('a replay buffer that never becomes active times out without a false recording badge', async () => {
    fakeObs({ becomesActive: false })
    const rec = startingRecorder()
    const starting = Promise.allSettled([rec.start('valorant', { ...config, savePath: mock.root })])
    await vi.advanceTimersByTimeAsync(10_000)
    const [result] = await starting
    expect(result.status).toBe('rejected')
    expect(String((result as PromiseRejectedResult).reason)).toMatch(/did not become active/)
    expect(rec.onStatusChange).not.toHaveBeenCalledWith(true)
    expect(mock.call).not.toHaveBeenCalledWith('StartRecord')
  })

  it('an active replay buffer starts the session and reports recording', async () => {
    fakeObs({})
    const rec = startingRecorder()
    const starting = Promise.allSettled([rec.start('valorant', { ...config, savePath: mock.root })])
    await vi.advanceTimersByTimeAsync(1000)
    expect(await starting).toEqual([{ status: 'fulfilled', value: undefined }])
    expect(rec.isActivelyRecording()).toBe(true)
    expect(rec.onStatusChange).toHaveBeenCalledWith(true)
    expect(mock.call).not.toHaveBeenCalledWith('StartRecord')
  })

  it('a confirmed mid-match replay buffer stop reports a failure instead of staying "recording"', async () => {
    const obs = fakeObs({})
    const rec = startingRecorder()
    const starting = rec.start('valorant', { ...config, savePath: mock.root })
    await vi.advanceTimersByTimeAsync(1000)
    await starting
    obs.setReplayActive(false)
    mock.handlers.get('ReplayBufferStateChanged')!({ outputActive: false })
    await vi.advanceTimersByTimeAsync(2000)
    expect(rec.isActivelyRecording()).toBe(false)
    expect(rec.hasRecordingFailure()).toBe(true)
    expect(rec.onStatusChange).toHaveBeenLastCalledWith(false, expect.stringMatching(/Replay Buffer stopped/), undefined)
  })

  it('a transient inactive event that OBS does not confirm keeps the session', async () => {
    fakeObs({})
    const rec = startingRecorder()
    const starting = rec.start('valorant', { ...config, savePath: mock.root })
    await vi.advanceTimersByTimeAsync(1000)
    await starting
    mock.handlers.get('ReplayBufferStateChanged')!({ outputActive: false })
    await vi.advanceTimersByTimeAsync(2000)
    expect(rec.hasRecordingFailure()).toBe(false)
    expect(rec.isActivelyRecording()).toBe(true)
  })
})
