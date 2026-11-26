import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { OBSRecorder } from './obs-recorder'
import { waitForRecordingStopped } from './obs-record-progress'
import { retargetUpForgeCapture, setupUpForgeScene } from './obs-setup'
import { noteObsClosedByUpForge, noteObsLaunchedByUpForge, resetObsLifecycleStampsForTests } from './obs-lifecycle-stamps'

const mock = vi.hoisted(() => ({ call: vi.fn(), on: vi.fn(), root: '' }))
vi.mock('obs-websocket-js', () => ({ OBSWebSocket: class { call = mock.call; on = mock.on } }))
vi.mock('electron', () => ({ app: { getPath: () => mock.root, getAppPath: () => mock.root }, nativeImage: {} }))
vi.mock('electron-log', () => ({ default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))
vi.mock('./disk-space', () => ({ getFreeDiskSpace: vi.fn(async () => Infinity), CRITICAL_FREE_DISK_BYTES: 100, WARN_FREE_DISK_BYTES: 200 }))
vi.mock('./obs-setup', () => ({
  UPFORGE_SCENE_NAME: 'UpForge',
  retargetUpForgeCapture: vi.fn(async () => ({ captureWindow: 'Valorant' })),
  setupUpForgeScene: vi.fn(async () => ({ ok: true, sceneCreated: true, inputCreated: true })),
  fitUpForgeCaptureToCanvas: vi.fn(),
  getUpForgeSceneIdentity: vi.fn(async () => null),
}))
vi.mock('./game-window-finder', () => ({ resolveObsCaptureWindow: async () => 'Valorant', findObsWindowString: async () => null }))
vi.mock('fs', async (original) => ({
  ...await original<typeof import('fs')>(),
  existsSync: () => true,
  statSync: () => ({ size: 100 }),
}))

const STUCK = 'OBS did not stop recording. Restart OBS before recording another match.'

/** Fake OBS whose record output ignores the first `ignoredStops` StopRecord requests. */
function fakeObs(options: { active: boolean; ignoredStops?: number }) {
  const state = { active: options.active, bytes: 0, stops: 0, starts: 0, order: [] as string[] }
  let ignored = options.ignoredStops ?? 0
  mock.call.mockImplementation(async (method: string) => {
    if (method === 'GetProfileParameter') return { parameterValue: 'Simple' }
    if (method === 'GetProfileList') return { currentProfileName: 'UpForge', profiles: ['UpForge'] }
    if (method === 'StopRecord') {
      state.stops++
      state.order.push('StopRecord')
      if (ignored > 0) ignored--
      else state.active = false
      return { outputPath: '/tmp/previous-match.mp4' }
    }
    if (method === 'StartRecord') {
      state.starts++
      state.order.push('StartRecord')
      state.active = true
      return {}
    }
    return { outputActive: state.active, outputBytes: state.active ? state.bytes += 100 : 0 }
  })
  return state
}

function recorder(owned: boolean): OBSRecorder {
  const rec = new OBSRecorder(() => ({ host: 'localhost', port: 4455, password: '', replayBufferSeconds: 30, obsPreserveActiveScene: false }))
  Object.assign(rec, {
    _connected: true,
    _recording: false,
    _matchOwnedRecording: owned,
    _outputPath: owned ? '/tmp/previous-match.mp4' : null,
    _startedAt: owned ? Date.now() - 60_000 : null,
    _recordingFailure: STUCK,
  })
  rec.onStatusChange = vi.fn()
  vi.spyOn(rec, 'isCurrentProgramSceneGameplay').mockResolvedValue(true)
  vi.spyOn(rec as unknown as { _startLiveKillPoll(): void }, '_startLiveKillPoll').mockImplementation(() => {})
  return rec
}

beforeEach(() => {
  vi.useFakeTimers(); vi.clearAllMocks()
  mock.root = fs.mkdtempSync(path.join(os.tmpdir(), 'upforge-stuck-output-'))
  resetObsLifecycleStampsForTests()
})
afterEach(() => {
  vi.clearAllTimers(); vi.useRealTimers()
  fs.rmSync(mock.root, { recursive: true, force: true })
})

describe('OBS output left active by a failed stop', () => {
  it('sends StopRecord again while waiting when OBS ignored the first request', async () => {
    let active = true
    const resendStop = vi.fn(async () => { active = false })
    const waiting = waitForRecordingStopped(async () => ({ outputActive: active }), 15_000, { resendStop })
    await vi.advanceTimersByTimeAsync(6_000)
    await expect(waiting).resolves.toBeUndefined()
    expect(resendStop).toHaveBeenCalledTimes(1)
  })

  it('stops the stuck match output itself and records the next match', async () => {
    const obs = fakeObs({ active: true })
    const rec = recorder(true)
    const starting = Promise.allSettled([rec.start('valorant')])
    await vi.advanceTimersByTimeAsync(30_000)
    expect(await starting).toEqual([{ status: 'fulfilled', value: undefined }])
    expect(obs.order).toEqual(['StopRecord', 'StartRecord'])
    expect(rec.hasRecordingFailure()).toBe(false)
    expect(rec.isActivelyRecording()).toBe(true)
  })

  it('recovers when OBS ignores the first StopRecord but honours the repeat', async () => {
    const obs = fakeObs({ active: true, ignoredStops: 1 })
    const rec = recorder(true)
    const starting = Promise.allSettled([rec.start('valorant')])
    await vi.advanceTimersByTimeAsync(40_000)
    expect(await starting).toEqual([{ status: 'fulfilled', value: undefined }])
    expect(obs.stops).toBe(2)
    expect(obs.starts).toBe(1)
  })

  it('still refuses the match, without starting OBS, when the output never stops', async () => {
    const obs = fakeObs({ active: true, ignoredStops: Infinity })
    const rec = recorder(true)
    const starting = Promise.allSettled([rec.start('valorant')])
    await vi.advanceTimersByTimeAsync(60_000)
    const [result] = await starting
    expect(result.status).toBe('rejected')
    expect(String((result as PromiseRejectedResult).reason)).toContain('did not stop recording')
    expect(obs.stops).toBeGreaterThan(0)
    expect(obs.starts).toBe(0)
  })

  it('never stops an active OBS recording UpForge no longer owns', async () => {
    const obs = fakeObs({ active: true })
    const rec = recorder(false)
    const starting = Promise.allSettled([rec.start('valorant')])
    await vi.advanceTimersByTimeAsync(30_000)
    const [result] = await starting
    expect(result.status).toBe('rejected')
    expect(obs.stops).toBe(0)
    expect(obs.starts).toBe(0)
  })
})

describe('capture setup failure at match start', () => {
  it('repairs the UpForge scene and retries the capture setup once', async () => {
    const obs = fakeObs({ active: false })
    const rec = recorder(false)
    Object.assign(rec, { _recordingFailure: null })
    vi.mocked(retargetUpForgeCapture)
      .mockRejectedValueOnce(Object.assign(new Error('Failed to create the scene item.'), { code: 700 }))
    const starting = Promise.allSettled([rec.start('valorant')])
    await vi.advanceTimersByTimeAsync(30_000)
    expect(await starting).toEqual([{ status: 'fulfilled', value: undefined }])
    expect(setupUpForgeScene).toHaveBeenCalledTimes(1)
    expect(retargetUpForgeCapture).toHaveBeenCalledTimes(2)
    expect(obs.starts).toBe(1)
  })

  it('gives up after one repair and keeps the OBS error detail', async () => {
    const obs = fakeObs({ active: false })
    const rec = recorder(false)
    Object.assign(rec, { _recordingFailure: null })
    vi.mocked(retargetUpForgeCapture).mockRejectedValue(Object.assign(
      new Error('Failed to create the scene item. (OBS code 700; scene "UpForge"; input "UpForge Capture")'),
      { code: 700 },
    ))
    const starting = Promise.allSettled([rec.start('valorant')])
    await vi.advanceTimersByTimeAsync(30_000)
    const [result] = await starting
    expect(result.status).toBe('rejected')
    expect(String((result as PromiseRejectedResult).reason)).toContain('OBS code 700; scene "UpForge"; input "UpForge Capture"')
    expect(setupUpForgeScene).toHaveBeenCalledTimes(1)
    expect(retargetUpForgeCapture).toHaveBeenCalledTimes(2)
    expect(obs.starts).toBe(0)
    vi.mocked(retargetUpForgeCapture).mockReset()
    vi.mocked(retargetUpForgeCapture).mockResolvedValue({ captureWindow: 'Valorant' })
  })
})

describe('capture setup timeout at match start', () => {
  it('does not try a scene repair when OBS did not answer at all', async () => {
    fakeObs({ active: false })
    const rec = recorder(false)
    Object.assign(rec, { _recordingFailure: null })
    vi.mocked(retargetUpForgeCapture).mockRejectedValueOnce(new Error('OBS GetInputList timed out'))
    const starting = Promise.allSettled([rec.start('valorant')])
    await vi.advanceTimersByTimeAsync(30_000)
    const [result] = await starting
    expect(result.status).toBe('rejected')
    expect(setupUpForgeScene).not.toHaveBeenCalled()
  })
})

describe('OBS disconnect report — who closed OBS', () => {
  it('says how long the socket was up and when UpForge last launched or closed OBS', () => {
    const rec = recorder(true)
    Object.assign(rec, { _recordingFailure: null, _recording: true, _connectedAt: Date.now() })
    rec.resetRecordingDiagnostics('valorant')
    vi.spyOn(rec as unknown as { _startReconnectLoop(): void }, '_startReconnectLoop').mockImplementation(() => {})
    noteObsLaunchedByUpForge()
    vi.advanceTimersByTime(73_000)
    let report: Record<string, unknown> | undefined
    rec.onStatusChange = (_active, error) => { if (error) report = rec.getRecordingDiagnostics() }
    const closed = mock.on.mock.calls.find(([event]) => event === 'ConnectionClosed')![1]
    closed({ code: 1001, message: 'Server stopping.' })
    expect(report).toMatchObject({
      obs_close_code: 1001,
      obs_connected_for_ms: 73_000,
      obs_launched_by_upforge_ms_ago: 73_000,
      obs_closed_by_upforge_ms_ago: null,
    })
  })

  it('reports a recent UpForge close request', () => {
    const rec = recorder(true)
    Object.assign(rec, { _recordingFailure: null, _recording: true, _connectedAt: Date.now() })
    vi.spyOn(rec as unknown as { _startReconnectLoop(): void }, '_startReconnectLoop').mockImplementation(() => {})
    noteObsClosedByUpForge()
    vi.advanceTimersByTime(2_000)
    let report: Record<string, unknown> | undefined
    rec.onStatusChange = (_active, error) => { if (error) report = rec.getRecordingDiagnostics() }
    mock.on.mock.calls.find(([event]) => event === 'ConnectionClosed')![1]({ code: 1001, message: 'Server stopping.' })
    expect(report).toMatchObject({ obs_closed_by_upforge_ms_ago: 2_000, obs_launched_by_upforge_ms_ago: null })
  })
})
