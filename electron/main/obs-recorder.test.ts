import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { OBSRecorder } from './obs-recorder'
import { waitForRecordingProgress, waitForRecordingStopped } from './obs-record-progress'
import { runObsTestRecording } from './obs-preflight'
import { withObsRecordingOperation } from './obs-recording-operation'
import { startRecordingWhenReady } from './recording-start'
import { getUpForgeSceneIdentity, retargetUpForgeCapture } from './obs-setup'
import { getFreeDiskSpace } from './disk-space'

const mock = vi.hoisted(() => ({ call: vi.fn(), on: vi.fn(), fileSize: 100, root: '' }))
vi.mock('obs-websocket-js', () => ({ OBSWebSocket: class { call = mock.call; on = mock.on } }))
vi.mock('electron', () => ({ app: { getPath: () => mock.root, getAppPath: () => mock.root }, nativeImage: {} }))
vi.mock('electron-log', () => ({ default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))
vi.mock('./disk-space', () => ({ getFreeDiskSpace: vi.fn(async () => Infinity), CRITICAL_FREE_DISK_BYTES: 100, WARN_FREE_DISK_BYTES: 200 }))
vi.mock('./obs-setup', () => ({ UPFORGE_SCENE_NAME: 'UpForge', retargetUpForgeCapture: vi.fn(), fitUpForgeCaptureToCanvas: vi.fn(), getUpForgeSceneIdentity: vi.fn(async () => null) }))
vi.mock('./game-window-finder', () => ({ resolveObsCaptureWindow: async () => 'CS2', findObsWindowString: async () => null }))
vi.mock('fs', async (original) => ({
  ...await original<typeof import('fs')>(),
  existsSync: () => true,
  statSync: () => ({ size: mock.fileSize }),
}))

function recorder() {
  const rec = new OBSRecorder(() => ({ host: 'localhost', port: 4455, password: '', replayBufferSeconds: 30, obsPreserveActiveScene: false }))
  // Simulate an already connected, owned recording without launching OBS.
  Object.assign(rec, { _connected: true, _recording: true, _matchOwnedRecording: true, _outputPath: '/tmp/match.mp4', _startedAt: Date.now() })
  rec.onStatusChange = vi.fn()
  return rec
}

beforeEach(() => {
  vi.useFakeTimers(); vi.clearAllMocks(); mock.fileSize = 100
  mock.root = fs.mkdtempSync(path.join(os.tmpdir(), 'upforge-recorder-test-'))
})
afterEach(() => {
  vi.clearAllTimers(); vi.useRealTimers()
  fs.rmSync(mock.root, { recursive: true, force: true })
})

describe('profile recording directory startup', () => {
  it('creates a fresh profile folder before checking its free space and starting capture', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'upforge-start-directory-'))
    const savePath = path.join(root, 'users', '3', 'recordings')
    vi.mocked(getFreeDiskSpace).mockImplementation(async directory => fs.existsSync(directory) ? Infinity : 0)
    let active = false
    let bytes = 0
    mock.call.mockImplementation(async (method) => {
      if (method === 'GetProfileParameter') return { parameterValue: 'Simple' }
      if (method === 'GetProfileList') return { currentProfileName: 'UpForge', profiles: ['UpForge'] }
      if (method === 'StartRecord') active = true
      return { outputActive: active, outputBytes: bytes += 100 }
    })
    const rec = recorder()
    Object.assign(rec, { _matchOwnedRecording: false, _recording: false, _startedAt: null })
    vi.spyOn(rec, 'isCurrentProgramSceneGameplay').mockResolvedValue(true)
    vi.spyOn(rec as unknown as { _startLiveKillPoll(): void }, '_startLiveKillPoll').mockImplementation(() => {})
    try {
      const starting = Promise.allSettled([rec.start('lol', {
        quality: '720p', bitrate: 5, audioEnabled: true, savePath, captureMonitor: 'auto', manageObsVideo: false,
      })])
      await vi.advanceTimersByTimeAsync(1000)
      expect(await starting).toEqual([{ status: 'fulfilled', value: undefined }])
      expect(fs.statSync(savePath).isDirectory()).toBe(true)
      expect(mock.call).toHaveBeenCalledWith('SetRecordDirectory', { recordDirectory: savePath })
      expect(rec.isActivelyRecording()).toBe(true)
    } finally {
      vi.mocked(getFreeDiskSpace).mockResolvedValue(Infinity)
      fs.rmSync(root, { recursive: true, force: true })
    }
  })
})

describe('wrong OBS scene at match start', () => {
  function startingRecorder() {
    let active = false
    let bytes = 0
    mock.call.mockImplementation(async (method) => {
      if (method === 'GetProfileParameter') return { parameterValue: 'Simple' }
      if (method === 'GetProfileList') return { currentProfileName: 'UpForge', profiles: ['UpForge'] }
      if (method === 'StartRecord') active = true
      return { outputActive: active, outputBytes: bytes += 100 }
    })
    const rec = recorder()
    Object.assign(rec, { _matchOwnedRecording: false, _recording: false, _startedAt: null,
      _gameplaySceneIdentity: { collectionName: 'Main', sceneName: 'UpForge', sceneUuid: 'old-uuid' } })
    vi.spyOn(rec as unknown as { _startLiveKillPoll(): void }, '_startLiveKillPoll').mockImplementation(() => {})
    return rec
  }
  const config = { quality: '720p', bitrate: 5, audioEnabled: true, savePath: '', captureMonitor: 'auto', manageObsVideo: false } as const

  it('re-reads the UpForge scene and selects it again instead of refusing the match', async () => {
    const rec = startingRecorder()
    const fresh = { collectionName: 'Main', sceneName: 'UpForge', sceneUuid: 'new-uuid' }
    vi.mocked(getUpForgeSceneIdentity).mockResolvedValueOnce(fresh)
    vi.spyOn(rec, 'isCurrentProgramSceneGameplay').mockResolvedValueOnce(false).mockResolvedValue(true)
    const starting = Promise.allSettled([rec.start('valorant', { ...config, savePath: mock.root })])
    await vi.advanceTimersByTimeAsync(1000)
    expect(await starting).toEqual([{ status: 'fulfilled', value: undefined }])
    expect(mock.call).toHaveBeenCalledWith('SetCurrentProgramScene', { sceneName: 'UpForge' })
    expect((rec as unknown as { _gameplaySceneIdentity: unknown })._gameplaySceneIdentity).toEqual(fresh)
    expect(mock.call).toHaveBeenCalledWith('StartRecord')
  })

  it('still refuses (and never records) when the player keeps another scene active', async () => {
    const rec = startingRecorder()
    vi.spyOn(rec, 'isCurrentProgramSceneGameplay').mockResolvedValue(false)
    const starting = Promise.allSettled([rec.start('valorant', { ...config, savePath: mock.root })])
    await vi.advanceTimersByTimeAsync(1000)
    const [result] = await starting
    expect(result.status).toBe('rejected')
    expect(String((result as PromiseRejectedResult).reason)).toMatch(/registered UpForge gameplay scene/)
    expect(mock.call).not.toHaveBeenCalledWith('StartRecord')
  })
})

/** Fake OBS with per-profile output settings, like basic.ini on disk. */
function fakePlayerObs(options: { streaming?: boolean; upforgeProfileExists?: boolean } = {}) {
  type ProfileState = { video: Record<string, number>; recordDirectory: string; params: Record<string, string> }
  const playerVideo = { baseWidth: 2560, baseHeight: 1440, outputWidth: 1920, outputHeight: 1080, fpsNumerator: 60, fpsDenominator: 1 }
  const profiles: Record<string, ProfileState> = {
    Streaming: { video: { ...playerVideo }, recordDirectory: '/player/videos', params: { 'Output/Mode': 'Advanced' } },
  }
  if (options.upforgeProfileExists !== false) {
    profiles.UpForge = { video: { ...playerVideo }, recordDirectory: '/upforge', params: { 'Output/Mode': 'Simple' } }
  }
  const state = { profile: 'Streaming', scene: 'Just Chatting', recording: false, streaming: options.streaming === true, bytes: 0 }
  mock.call.mockImplementation(async (method: string, args: Record<string, unknown> = {}) => {
    const current = profiles[state.profile]
    switch (method) {
      case 'GetProfileList': return { currentProfileName: state.profile, profiles: Object.keys(profiles) }
      case 'SetCurrentProfile': state.profile = String(args.profileName); return {}
      case 'CreateProfile':
        profiles[String(args.profileName)] = { video: { ...playerVideo }, recordDirectory: '/default', params: {} }
        state.profile = String(args.profileName)
        return {}
      case 'GetProfileParameter': return { parameterValue: current.params[`${args.parameterCategory}/${args.parameterName}`] ?? null }
      case 'SetProfileParameter': current.params[`${args.parameterCategory}/${args.parameterName}`] = String(args.parameterValue); return {}
      case 'GetVideoSettings': return { ...current.video }
      case 'SetVideoSettings': current.video = { ...(args as Record<string, number>) }; return {}
      case 'SetRecordDirectory': current.recordDirectory = String(args.recordDirectory); return {}
      case 'GetCurrentProgramScene': return { currentProgramSceneName: state.scene }
      case 'SetCurrentProgramScene': state.scene = String(args.sceneName); return {}
      case 'GetStreamStatus': return { outputActive: state.streaming }
      case 'GetReplayBufferStatus':
      case 'GetVirtualCamStatus': return { outputActive: false }
      case 'StartRecord': state.recording = true; return {}
      case 'StopRecord': state.recording = false; return { outputPath: '/upforge/match.mp4' }
      default: return { outputActive: state.recording, outputBytes: state.bytes += 100, outputPath: '/upforge/match.mp4' }
    }
  })
  vi.mocked(retargetUpForgeCapture).mockImplementation(async (obs, _game, opts) => {
    if (opts?.switchScene !== false) await obs.call('SetCurrentProgramScene', { sceneName: 'UpForge' })
    return { captureWindow: 'VALORANT' }
  })
  return { profiles, state, playerVideo }
}

async function playMatch(rec: OBSRecorder, savePath: string) {
  vi.spyOn(rec, 'isCurrentProgramSceneGameplay').mockResolvedValue(true)
  vi.spyOn(rec as unknown as { _startLiveKillPoll(): void }, '_startLiveKillPoll').mockImplementation(() => {})
  const started = Promise.allSettled([rec.start('valorant', {
    quality: '720p', bitrate: 5, fps: 30, audioEnabled: true, savePath, captureMonitor: 'auto', manageObsVideo: true,
  })])
  await vi.advanceTimersByTimeAsync(1000)
  expect(await started).toEqual([{ status: 'fulfilled', value: undefined }])
  const stopped = rec.stop()
  await vi.advanceTimersByTimeAsync(5000)
  return stopped
}

describe('player OBS profile and scene are left as found', () => {
  function idleRecorder() {
    const rec = recorder()
    Object.assign(rec, { _matchOwnedRecording: false, _recording: false, _startedAt: null, _outputPath: null })
    return rec
  }

  it('records in the UpForge profile and restores the player profile and scene after the match', async () => {
    const obs = fakePlayerObs()
    const rec = idleRecorder()
    expect(await playMatch(rec, mock.root)).toBe('/upforge/match.mp4')
    expect(obs.state.profile).toBe('Streaming')
    expect(obs.state.scene).toBe('Just Chatting')
    expect(obs.profiles.Streaming.video).toEqual(obs.playerVideo)
    expect(obs.profiles.Streaming.recordDirectory).toBe('/player/videos')
    expect(obs.profiles.Streaming.params).toEqual({ 'Output/Mode': 'Advanced' })
    // UpForge's own profile received the match settings.
    expect(obs.profiles.UpForge.video).toMatchObject({ baseWidth: 1280, baseHeight: 720, fpsNumerator: 30 })
    expect(obs.profiles.UpForge.recordDirectory).toBe(mock.root)
    expect(obs.profiles.UpForge.params['Output/Mode']).toBe('Simple')
  })

  it('creates the UpForge profile when OBS does not have one yet', async () => {
    const obs = fakePlayerObs({ upforgeProfileExists: false })
    const rec = idleRecorder()
    await playMatch(rec, mock.root)
    expect(mock.call).toHaveBeenCalledWith('CreateProfile', { profileName: 'UpForge' })
    expect(obs.state.profile).toBe('Streaming')
    expect(obs.profiles.Streaming.video).toEqual(obs.playerVideo)
    expect(obs.profiles.Streaming.recordDirectory).toBe('/player/videos')
  })

  it('changes nothing in OBS while the player is streaming', async () => {
    const obs = fakePlayerObs({ streaming: true })
    obs.state.scene = 'UpForge'
    const rec = idleRecorder()
    await playMatch(rec, mock.root)
    for (const method of ['SetCurrentProfile', 'CreateProfile', 'SetVideoSettings', 'SetRecordDirectory', 'SetProfileParameter', 'SetCurrentProgramScene']) {
      expect(mock.call).not.toHaveBeenCalledWith(method, expect.anything())
    }
    expect(obs.state.profile).toBe('Streaming')
    expect(obs.profiles.Streaming.video).toEqual(obs.playerVideo)
    expect(rec.getStartupWarning() ?? '').toMatch(/your own OBS settings/)
  })

  it('does not touch the player profile when settings change between matches', async () => {
    fakePlayerObs()
    const rec = idleRecorder()
    expect(await rec.applyRecordingSettings({
      quality: '1080p', bitrate: 8, fps: 60, audioEnabled: true, savePath: mock.root, captureMonitor: 'auto', manageObsVideo: true,
    })).toBeNull()
    expect(mock.call).not.toHaveBeenCalledWith('SetVideoSettings', expect.anything())
    expect(mock.call).not.toHaveBeenCalledWith('SetRecordDirectory', expect.anything())
    expect(mock.call).not.toHaveBeenCalledWith('SetProfileParameter', expect.anything())
  })
})

describe('recovered recording clock', () => {
  it('saves a pre-existing 50-minute OBS file separately before a new League match', async () => {
    let active = true
    let bytes = 1000
    mock.call.mockImplementation(async (method) => {
      if (method === 'StopRecord') { active = false; return { outputPath: '/tmp/pregame.mp4' } }
      return { outputActive: active, outputPaused: false, outputBytes: bytes += 100,
        outputDuration: 50 * 60_000, outputPath: '/tmp/pregame.mp4' }
    })
    const rec = recorder()
    Object.assign(rec, { _matchOwnedRecording: false, _recording: false, _startedAt: null })
    vi.spyOn(rec, 'isCurrentProgramSceneGameplay').mockResolvedValue(true)
    const pending = rec.prepareMatchCapture(async () => true, { matchStartedAt: Date.now() - 3000 })
    await vi.advanceTimersByTimeAsync(20_000)
    expect(await pending).toBe('idle')
    expect(mock.call).toHaveBeenCalledWith('StopRecord')
    expect(rec.getRecordingStartedAt()).toBeNull()
    expect(rec.isActivelyRecording()).toBe(false)
    expect(mock.call).not.toHaveBeenCalledWith('StartRecord')
  })

  it('keeps an existing recording that began during the same League match', async () => {
    let bytes = 1000
    mock.call.mockImplementation(async () => ({ outputActive: true, outputPaused: false,
      outputBytes: bytes += 100, outputDuration: 60_000 }))
    const rec = recorder()
    Object.assign(rec, { _matchOwnedRecording: false, _recording: false, _startedAt: null })
    vi.spyOn(rec, 'isCurrentProgramSceneGameplay').mockResolvedValue(true)
    const pending = rec.prepareMatchCapture(async () => true, { matchStartedAt: Date.now() - 120_000 })
    await vi.advanceTimersByTimeAsync(1000)
    expect(await pending).toBe('reclaimed')
    expect(mock.call).not.toHaveBeenCalledWith('StopRecord')
  })

  it('does not stop an unrelated OBS scene when preparing a League match', async () => {
    mock.call.mockResolvedValue({ outputActive: true, outputDuration: 50 * 60_000 })
    const rec = recorder()
    Object.assign(rec, { _matchOwnedRecording: false, _recording: false, _startedAt: null })
    vi.spyOn(rec, 'isCurrentProgramSceneGameplay').mockResolvedValue(false)
    expect(await rec.prepareMatchCapture(async () => true, { matchStartedAt: Date.now() })).toBe('blocked')
    expect(mock.call).not.toHaveBeenCalledWith('StopRecord')
  })

  it('blocks a fresh match recording when the pre-match file cannot be finalized', async () => {
    let active = true
    let bytes = 1000
    mock.fileSize = 0
    mock.call.mockImplementation(async (method) => {
      if (method === 'StopRecord') { active = false; return { outputPath: '/tmp/pregame.mp4' } }
      return { outputActive: active, outputPaused: false, outputBytes: bytes += 100,
        outputDuration: 50 * 60_000, outputPath: '/tmp/pregame.mp4' }
    })
    const rec = recorder()
    Object.assign(rec, { _matchOwnedRecording: false, _recording: false, _startedAt: null })
    vi.spyOn(rec, 'isCurrentProgramSceneGameplay').mockResolvedValue(true)
    const pending = rec.prepareMatchCapture(async () => true, { matchStartedAt: Date.now() })
    await vi.advanceTimersByTimeAsync(50_000)
    expect(await pending).toBe('blocked')
    expect(mock.call).not.toHaveBeenCalledWith('StartRecord')
    expect(rec.hasRecordingFailure()).toBe(true)
  })
  it('keeps a known recording origin across a reconnect', async () => {
    const start = Date.now() - 600_000
    let bytes = 1000
    mock.call.mockImplementation(async () => ({ outputActive: true, outputBytes: bytes += 100 }))
    const rec = recorder()
    Object.assign(rec, { _startedAt: start, _disconnectedDuringRecording: true })
    vi.spyOn(rec, 'isCurrentProgramSceneGameplay').mockResolvedValue(true)
    const reclaim = rec.reclaimActiveRecording()
    await vi.advanceTimersByTimeAsync(1000)
    expect(await reclaim).toBe(true)
    expect(rec.getRecordingStartedAt()).toBe(start)
  })

  it('preserves the elapsed video when taking over an existing recording', async () => {
    const now = Date.now()
    const elapsedMs = 46 * 60_000
    let bytes = 1000
    mock.call.mockImplementation(async () => ({ outputActive: true, outputPaused: false, outputBytes: bytes += 100, outputDuration: elapsedMs + Date.now() - now }))
    const rec = recorder()
    Object.assign(rec, { _matchOwnedRecording: false, _recording: false, _startedAt: null })
    vi.spyOn(rec, 'isCurrentProgramSceneGameplay').mockResolvedValue(true)
    const reclaim = rec.reclaimActiveRecording()
    await vi.advanceTimersByTimeAsync(1000)
    expect(await reclaim).toBe(true)
    expect(rec.getRecordingStartedAt()).toBe(now - elapsedMs)
    expect(mock.call).not.toHaveBeenCalledWith('StartRecord')
  })

  it.each([undefined, NaN, -1])('refuses an unknown clock instead of inventing a start time (%s)', async (duration) => {
    let bytes = 100
    mock.call.mockImplementation(async () => ({ outputActive: true, outputBytes: bytes += 100, outputDuration: duration }))
    const rec = recorder()
    Object.assign(rec, { _matchOwnedRecording: false, _recording: false, _startedAt: null })
    vi.spyOn(rec, 'isCurrentProgramSceneGameplay').mockResolvedValue(true)
    const reclaim = rec.reclaimActiveRecording()
    await vi.advanceTimersByTimeAsync(16_000)
    expect(await reclaim).toBe(false)
    expect(rec.getRecordingStartedAt()).toBeNull()
  })
})

describe('OBS recording completion', () => {
  it('does not release ownership when the status query fails', async () => {
    mock.call.mockRejectedValue(new Error('connection lost'))
    const rec = recorder()
    const stopped = rec.stop()
    await vi.advanceTimersByTimeAsync(120_000)
    expect(await stopped).toBeNull()
    expect(rec.isRecording()).toBe(true)
    expect(await rec.releaseStaleMatchOwnership()).toBe(false)
  })

  it('allows detection to resume after a failed recording is confirmed idle', async () => {
    mock.call.mockResolvedValue({ outputActive: false })
    const rec = recorder()
    Object.assign(rec, { _recordingFailure: 'Restart OBS' })
    expect(await rec.releaseStaleMatchOwnership()).toBe(true)
    expect(rec.isRecording()).toBe(false)
    // Only a fresh start may clear the failure; the old output cannot be reclaimed.
    expect(await rec.reclaimActiveRecording()).toBe(false)
  })

  it('forceStop uses the verified path instead of clearing ownership immediately', async () => {
    mock.call.mockResolvedValue({ outputActive: true, outputBytes: 0 })
    const rec = recorder()
    rec.forceStop()
    expect(rec.isRecording()).toBe(true)
    await vi.advanceTimersByTimeAsync(16_000)
    expect(rec.hasRecordingFailure()).toBe(true)
    expect(rec.isRecording()).toBe(true)
  })

  it('forceStop (quit/update) leaves the user\'s own OBS recording running', async () => {
    mock.call.mockResolvedValue({ outputActive: true, outputBytes: 100 })
    const rec = recorder()
    Object.assign(rec, { _matchOwnedRecording: false, _recording: false, _startedAt: null })
    rec.forceStop()
    await vi.advanceTimersByTimeAsync(16_000)
    expect(mock.call).not.toHaveBeenCalledWith('StopRecord')
    expect(mock.call).not.toHaveBeenCalledWith('StopReplayBuffer')
  })

  it('does not confuse a clips-only session with a full recording', async () => {
    mock.call.mockResolvedValue({ outputActive: false })
    const rec = recorder()
    Object.assign(rec, { _clipsOnlySession: true, _replayBufferActive: true })
    expect(await rec.stop()).toBeNull()
    expect(mock.call).toHaveBeenCalledWith('StopReplayBuffer')
    expect(mock.call).not.toHaveBeenCalledWith('StopRecord')
    expect(rec.hasRecordingFailure()).toBe(false)
  })
  it('does not release ownership or reuse a recording when StopRecord succeeds but OBS stays active', async () => {
    mock.call.mockImplementation(async (method) => method === 'StopRecord' ? { outputPath: '/tmp/match.mp4' } : { outputActive: true, outputBytes: 0 })
    const rec = recorder()
    const stopped = rec.stop()
    expect(rec.stop()).toBe(stopped)
    await vi.advanceTimersByTimeAsync(16_000)
    // Not confirmed idle — still owned while the stop is retried with backoff.
    expect(rec.isRecording()).toBe(true)
    await vi.advanceTimersByTimeAsync(130_000)
    expect(await stopped).toBeNull()
    expect(rec.isRecording()).toBe(true)
    expect(rec.hasRecordingFailure()).toBe(true)
    expect(rec.onStatusChange).not.toHaveBeenCalledWith(false)
    expect(rec.onStatusChange).toHaveBeenCalledWith(false, expect.stringContaining('did not stop'), 'stop')
    await vi.advanceTimersByTimeAsync(90_000)
    expect(await rec.reclaimActiveRecording()).toBe(false)
    await expect(rec.start('valorant')).rejects.toThrow('did not stop')
  })

  it('waits for inactive status and a finalized file before reporting success', async () => {
    let active = true
    mock.call.mockImplementation(async (method) => {
      if (method === 'StopRecord') { setTimeout(() => { active = false }, 2000); return { outputPath: '/tmp/match.mp4' } }
      return { outputActive: active, outputBytes: 100 }
    })
    const rec = recorder()
    const stopped = rec.stop()
    await vi.advanceTimersByTimeAsync(1000)
    expect(rec.isRecording()).toBe(true)
    await vi.advanceTimersByTimeAsync(3000)
    expect(await stopped).toBe('/tmp/match.mp4')
    expect(rec.isRecording()).toBe(false)
    expect(rec.hasRecordingFailure()).toBe(false)
  })

  it('releases capture and retains a slow owned output for durable background finalization', async () => {
    mock.fileSize = 0
    mock.call.mockResolvedValue({ outputActive: false, outputBytes: 0 })
    const rec = recorder()
    const stopped = rec.stop()
    await vi.advanceTimersByTimeAsync(46_000)
    expect(await stopped).toBe('/tmp/match.mp4')
    expect(rec.getFinalizingRecordingPath()).toBe('/tmp/match.mp4')
    expect(rec.isRecording()).toBe(false)
    expect(rec.hasRecordingFailure()).toBe(false)
    expect(rec.onStatusChange).toHaveBeenCalledWith(false, undefined, 'stop')
  })

  it('retries a hung stop request with backoff and releases ownership once OBS confirms idle', async () => {
    let active = true
    let stopCalls = 0
    mock.call.mockImplementation((method) => {
      if (method === 'StopRecord') {
        stopCalls++
        if (stopCalls === 1) return new Promise(() => {})
        active = false
        return Promise.resolve({ outputPath: '/tmp/match.mp4' })
      }
      return Promise.resolve({ outputActive: active, outputBytes: 100 })
    })
    const rec = recorder()
    const gaveUp = vi.fn()
    rec.onStopGaveUp = gaveUp
    const stopped = rec.stop()
    await vi.advanceTimersByTimeAsync(6000)
    // First attempt timed out: still owned, no failure surfaced yet, retry pending.
    expect(rec.isRecording()).toBe(true)
    expect(rec.hasRecordingFailure()).toBe(false)
    await vi.advanceTimersByTimeAsync(10_000)
    expect(await stopped).toBe('/tmp/match.mp4')
    expect(stopCalls).toBe(2)
    expect(rec.isRecording()).toBe(false)
    expect(rec.hasRecordingFailure()).toBe(false)
    expect(gaveUp).not.toHaveBeenCalled()
  })

  it('bounds a permanently hung stop request, keeps ownership and reports the give-up', async () => {
    mock.call.mockImplementation((method) => method === 'StopRecord' ? new Promise(() => {}) : Promise.resolve({ outputActive: true }))
    const rec = recorder()
    const gaveUp = vi.fn()
    rec.onStopGaveUp = gaveUp
    const stopped = rec.stop()
    await vi.advanceTimersByTimeAsync(6000)
    expect(gaveUp).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(120_000)
    expect(await stopped).toBeNull()
    expect(mock.call.mock.calls.filter(([m]) => m === 'StopRecord')).toHaveLength(4)
    expect(rec.isRecording()).toBe(true)
    expect(rec.getLastError()).toMatch(/timed out/)
    expect(gaveUp).toHaveBeenCalledOnce()
  })
})

describe('mid-match progress watchdog', () => {
  function watch(rec: OBSRecorder) {
    (rec as unknown as { _startProgressWatch(): void })._startProgressWatch()
  }

  it('reports a lost recording once when subsequent shutdown succeeds', async () => {
    mock.call.mockResolvedValue({ outputActive: false, outputBytes: 1000 })
    const rec = recorder()
    watch(rec)
    await vi.advanceTimersByTimeAsync(20_000)
    expect(rec.hasRecordingFailure()).toBe(true)
    expect(rec.onStatusChange).toHaveBeenCalledTimes(1)
    expect(rec.onStatusChange).toHaveBeenCalledWith(false, expect.stringContaining('stopped producing'), undefined)
  })

  it('still reports a distinct file-finalization failure after capture is lost', async () => {
    mock.fileSize = 0
    mock.call.mockResolvedValue({ outputActive: false, outputBytes: 1000 })
    const rec = recorder()
    watch(rec)
    await vi.advanceTimersByTimeAsync(60_000)
    expect(rec.onStatusChange).toHaveBeenCalledTimes(2)
    expect(rec.onStatusChange).toHaveBeenLastCalledWith(false, expect.stringContaining('did not finalize'), 'stop')
  })

  it('does not count an unchanged byte count after a missing sample as progress', async () => {
    let samples = 0
    mock.call.mockImplementation(async () => ({
      outputActive: true,
      outputBytes: ++samples % 2 ? 1000 : undefined,
    }))
    const rec = recorder()
    vi.spyOn(rec, 'stop').mockResolvedValue(null)
    watch(rec)
    await vi.advanceTimersByTimeAsync(90_000)
    expect(rec.hasRecordingFailure()).toBe(true)
    expect(rec.stop).toHaveBeenCalledTimes(1)
  })

  it('captures the failing status rather than stale startup diagnostics', async () => {
    const rec = recorder()
    rec.resetRecordingDiagnostics('valorant')
    mock.call.mockResolvedValue({ outputActive: true, outputPaused: false, outputBytes: 2500 })
    vi.spyOn(rec, 'stop').mockResolvedValue(null)
    let diagnostics: Record<string, unknown> | undefined
    rec.onStatusChange = (_active, error) => {
      if (error) diagnostics = rec.getRecordingDiagnostics()
    }
    watch(rec)
    await vi.advanceTimersByTimeAsync(70_000)
    expect(diagnostics).toMatchObject({
      game: 'valorant', stage: 'recording', output_active: true,
      output_bytes: 2500, output_paused: false, no_progress_ms: 60_000,
    })
    rec.resetRecordingDiagnostics('cs2')
    expect(rec.getRecordingDiagnostics()).toMatchObject({ output_paused: null, no_progress_ms: null })
  })

  it('attempts shutdown and blocks reuse after recording data stops advancing', async () => {
    mock.call.mockResolvedValue({ outputActive: true, outputPaused: false, outputBytes: 1000 })
    const rec = recorder()
    watch(rec)
    await vi.advanceTimersByTimeAsync(90_000)
    expect(mock.call).toHaveBeenCalledWith('StopRecord')
    expect(rec.hasRecordingFailure()).toBe(true)
    expect(await rec.reclaimActiveRecording()).toBe(false)
  })

  it('does not stop a deliberately paused recording', async () => {
    mock.call.mockResolvedValue({ outputActive: true, outputPaused: true, outputBytes: 1000 })
    const rec = recorder()
    watch(rec)
    await vi.advanceTimersByTimeAsync(180_000)
    expect(mock.call).not.toHaveBeenCalledWith('StopRecord')
    expect(rec.hasRecordingFailure()).toBe(false)
  })

  it('keeps a healthy growing recording running', async () => {
    let bytes = 1000
    mock.call.mockImplementation(async () => ({ outputActive: true, outputBytes: bytes += 500 }))
    const rec = recorder()
    watch(rec)
    await vi.advanceTimersByTimeAsync(180_000)
    expect(mock.call).not.toHaveBeenCalledWith('StopRecord')
    expect(rec.hasRecordingFailure()).toBe(false)
  })
})

describe('recording progress verification', () => {
  it('starts a separate sustained match recording after the onboarding test completes', async () => {
    let active = false
    let bytes = 0
    mock.call.mockImplementation(async (request) => {
      if (request === 'StartRecord') active = true
      if (request === 'StopRecord') active = false
      return { outputActive: active, outputBytes: bytes += 100, outputDuration: 1000, outputPath: '/tmp/test.mp4' }
    })
    const rec = recorder()
    Object.assign(rec, { _matchOwnedRecording: false, _recording: false, _startedAt: null })
    vi.spyOn(rec, 'isCurrentProgramSceneGameplay').mockResolvedValue(true)
    vi.spyOn(rec as unknown as { _startLiveKillPoll(): void }, '_startLiveKillPoll').mockImplementation(() => {})
    const check = runObsTestRecording({ obs: rec.getObsClient(), recordDurationMs: 4000 })
    await vi.advanceTimersByTimeAsync(1)
    const match = (async () => {
      expect(await rec.prepareMatchCapture()).toBe('idle')
      await rec.start('cs2')
    })()
    await vi.advanceTimersByTimeAsync(1000)
    expect(rec.isRecording()).toBe(false)
    await vi.advanceTimersByTimeAsync(6000)
    expect(await check).toMatchObject({ ok: true })
    await match
    expect(active).toBe(true)
    expect(rec.isActivelyRecording()).toBe(true)
    expect(mock.call.mock.calls.filter(([method]) => method === 'StartRecord')).toHaveLength(2)
    expect(mock.call.mock.calls.filter(([method]) => method === 'StopRecord')).toHaveLength(1)
  })

  it('keeps a test with unconfirmed shutdown out of match recovery until OBS is idle', async () => {
    let active = false
    let bytes = 0
    mock.call.mockImplementation(async (request) => {
      if (request === 'StartRecord') active = true
      return { outputActive: active, outputBytes: bytes += 100, outputDuration: 1000, outputPath: '/tmp/test.mp4' }
    })
    const rec = recorder()
    Object.assign(rec, { _matchOwnedRecording: false, _recording: false, _startedAt: null })
    vi.spyOn(rec, 'isCurrentProgramSceneGameplay').mockResolvedValue(true)
    vi.spyOn(rec as unknown as { _startLiveKillPoll(): void }, '_startLiveKillPoll').mockImplementation(() => {})
    const check = runObsTestRecording({ obs: rec.getObsClient(), recordDurationMs: 1 })
    await vi.advanceTimersByTimeAsync(16_000)
    expect(await check).toMatchObject({ ok: false })
    expect(await rec.prepareMatchCapture()).toBe('blocked')
    expect(await rec.isCaptureActive()).toBe(false)
    expect(await rec.reclaimActiveRecording()).toBe(false)
    await expect(rec.start('cs2')).rejects.toThrow('already recording')
    active = false
    expect(await rec.prepareMatchCapture()).toBe('idle')
    const match = rec.start('cs2')
    await vi.advanceTimersByTimeAsync(1000)
    await match
    expect(rec.isActivelyRecording()).toBe(true)
  })

  it('rechecks match presence after waiting for an onboarding recording operation', async () => {
    const rec = recorder()
    Object.assign(rec, { _matchOwnedRecording: false, _recording: false, _startedAt: null })
    let release!: () => void
    let inGame = true
    const blocker = withObsRecordingOperation(rec.getObsClient(), () => new Promise<void>(resolve => { release = resolve }))
    const canStart = vi.fn(async () => inGame)
    const pending = rec.prepareMatchCapture(canStart)
    await vi.advanceTimersByTimeAsync(1)
    expect(canStart).not.toHaveBeenCalled()
    inGame = false
    release()
    await blocker
    expect(await pending).toBe('cancelled')
    expect(mock.call).not.toHaveBeenCalled()
    expect(rec.isRecording()).toBe(false)
  })

  it.each(['isCaptureActive', 'reclaimActiveRecording'] as const)('does not treat an onboarding test as a match in %s', async (method) => {
    let active = false
    let bytes = 0
    mock.call.mockImplementation(async (request) => {
      if (request === 'StartRecord') active = true
      if (request === 'StopRecord') active = false
      return { outputActive: active, outputBytes: bytes += 100, outputDuration: 1000, outputPath: '/tmp/test.mp4' }
    })
    const rec = recorder()
    Object.assign(rec, { _matchOwnedRecording: false, _recording: false, _startedAt: null })
    vi.spyOn(rec, 'isCurrentProgramSceneGameplay').mockResolvedValue(true)
    const check = runObsTestRecording({ obs: rec.getObsClient(), recordDurationMs: 4000 })
    await vi.advanceTimersByTimeAsync(1)
    expect(active).toBe(true)
    const changed = mock.on.mock.calls.find(([event]) => event === 'RecordStateChanged')![1]
    changed({ outputActive: true, outputPath: '/tmp/test.mp4' })
    expect(rec.getLastRecordingPath()).toBe('/tmp/match.mp4')
    const match = rec[method]()
    await vi.advanceTimersByTimeAsync(500)
    expect(await match).toBe(false)
    expect(rec.isRecording()).toBe(false)
    await vi.advanceTimersByTimeAsync(6000)
    expect(await check).toMatchObject({ ok: true })
  })

  it.each([true, false])('coordinates a match start with an overlapping recording check (test first=%s)', async (testFirst) => {
    let active = false
    let bytes = 0
    mock.call.mockImplementation(async (method) => {
      if (method === 'StartRecord') {
        if (active) throw new Error('Already recording')
        active = true
      }
      if (method === 'StopRecord') active = false
      return { outputActive: active, outputBytes: active ? bytes += 100 : 0, outputPath: '/tmp/test.mp4' }
    })
    const rec = recorder()
    Object.assign(rec, { _matchOwnedRecording: false, _recording: false, _startedAt: null })
    vi.spyOn(rec, 'isCurrentProgramSceneGameplay').mockResolvedValue(true)
    vi.spyOn(rec as unknown as { _startLiveKillPoll(): void }, '_startLiveKillPoll').mockImplementation(() => {})
    const check = () => runObsTestRecording({ obs: rec.getObsClient(), recordDurationMs: 1000 })
    const first = testFirst ? check() : rec.start('cs2')
    const second = testFirst ? rec.start('cs2') : check()
    const pending = Promise.allSettled([first, second])
    await vi.advanceTimersByTimeAsync(6000)
    const results = await pending
    expect(results[testFirst ? 1 : 0]).toEqual({ status: 'fulfilled', value: undefined })
    expect(results[testFirst ? 0 : 1]).toMatchObject({ status: 'fulfilled', value: { ok: testFirst } })
    expect(active).toBe(true)
    expect(rec.isActivelyRecording()).toBe(true)
    expect(mock.call.mock.calls.filter(([method]) => method === 'StopRecord')).toHaveLength(testFirst ? 1 : 0)
  })

  it('allows a fresh startup after shared setup fails', async () => {
    let active = false
    let bytes = 0
    mock.call.mockImplementation(async (method) => {
      if (method === 'StartRecord') active = true
      return { outputActive: active, outputBytes: active ? bytes += 100 : 0 }
    })
    const rec = recorder()
    Object.assign(rec, { _matchOwnedRecording: false, _recording: false, _startedAt: null })
    // Wrong scene on the first check and after the one recovery attempt.
    vi.spyOn(rec, 'isCurrentProgramSceneGameplay').mockResolvedValueOnce(false).mockResolvedValueOnce(false).mockResolvedValue(true)
    vi.spyOn(rec as unknown as { _startLiveKillPoll(): void }, '_startLiveKillPoll').mockImplementation(() => {})
    await expect(rec.start('cs2')).rejects.toThrow('registered UpForge gameplay scene')
    const retry = rec.start('cs2')
    await vi.advanceTimersByTimeAsync(1000)
    await expect(retry).resolves.toBeUndefined()
    expect(rec.isRecording()).toBe(true)
  })

  it('shares startup before asynchronous setup so duplicate match detection cannot start OBS twice', async () => {
    let active = false
    let bytes = 0
    mock.call.mockImplementation(async (method) => {
      if (method === 'StartRecord') {
        if (active) throw new Error('Already recording')
        active = true
      }
      return { outputActive: active, outputBytes: active ? bytes += 100 : 0 }
    })
    const rec = recorder()
    Object.assign(rec, { _matchOwnedRecording: false, _recording: false, _startedAt: null })
    vi.spyOn(rec, 'isCurrentProgramSceneGameplay').mockResolvedValue(true)
    vi.spyOn(rec as unknown as { _startLiveKillPoll(): void }, '_startLiveKillPoll').mockImplementation(() => {})
    const first = rec.start('cs2')
    const second = rec.start('cs2')
    const results = Promise.allSettled([first, second])
    await vi.advanceTimersByTimeAsync(35_000)
    expect(await results).toEqual([{ status: 'fulfilled', value: undefined }, { status: 'fulfilled', value: undefined }])
    expect(mock.call.mock.calls.filter(([method]) => method === 'StartRecord')).toHaveLength(1)
    expect(mock.call).not.toHaveBeenCalledWith('StopRecord')
    expect(rec.isRecording()).toBe(true)
  })

  it('does not announce start success when OBS is active but produces no bytes', async () => {
    let active = false
    mock.call.mockImplementation(async (method) => {
      if (method === 'StartRecord') {
        active = true
        const changed = mock.on.mock.calls.find(([event]) => event === 'RecordStateChanged')![1]
        changed({ outputActive: true, outputPath: '/tmp/match.mp4' })
      }
      return { outputActive: active, outputBytes: 0 }
    })
    const rec = recorder()
    Object.assign(rec, { _matchOwnedRecording: false, _recording: false, _startedAt: null })
    vi.spyOn(rec, 'isCurrentProgramSceneGameplay').mockResolvedValue(true)
    const check = expect(rec.start('valorant')).rejects.toMatchObject({ code: 'obs_recording_no_data', message: expect.stringContaining('not producing') })
    await vi.advanceTimersByTimeAsync(35_000)
    await check
    expect(rec.onStatusChange).not.toHaveBeenCalledWith(true)
    expect(mock.call).toHaveBeenCalledWith('StopRecord')
    expect(rec.hasRecordingFailure()).toBe(true)
    expect(rec.isRecording()).toBe(true)
  })

  it('starts again after OBS is confirmed idle and the new recording produces data', async () => {
    let active = false
    let bytes = 0
    mock.call.mockImplementation(async (method) => {
      if (method === 'StartRecord') active = true
      return { outputActive: active, outputBytes: active ? bytes += 100 : 0 }
    })
    const rec = recorder()
    Object.assign(rec, { _recordingFailure: 'Restart OBS', _startedAt: null })
    vi.spyOn(rec, 'isCurrentProgramSceneGameplay').mockResolvedValue(true)
    vi.spyOn(rec as unknown as { _startLiveKillPoll(): void }, '_startLiveKillPoll').mockImplementation(() => {})
    const start = rec.start('valorant')
    await vi.advanceTimersByTimeAsync(1000)
    await start
    expect(rec.hasRecordingFailure()).toBe(false)
    expect(rec.isActivelyRecording()).toBe(true)
    expect(rec.onStatusChange).toHaveBeenCalledWith(true)
  })

  it('rejects an active output whose bytes never advance', async () => {
    const check = expect(waitForRecordingProgress(async () => ({ outputActive: true, outputBytes: 0 }))).rejects.toThrow('not producing')
    await vi.advanceTimersByTimeAsync(16_000)
    await check
  })

  it('requires new bytes, including when reclaiming a nonempty stalled recording', async () => {
    const check = expect(waitForRecordingProgress(async () => ({ outputActive: true, outputBytes: 12345 }))).rejects.toThrow('not producing')
    await vi.advanceTimersByTimeAsync(16_000)
    await check
  })

  it('accepts actual output progress', async () => {
    let bytes = 0
    const check = waitForRecordingProgress(async () => ({ outputActive: true, outputBytes: bytes += 100 }))
    await vi.advanceTimersByTimeAsync(500)
    await expect(check).resolves.toBeUndefined()
  })

  it('bounds an unresponsive status request', async () => {
    const check = expect(waitForRecordingStopped(() => new Promise(() => {}))).rejects.toThrow('status timed out')
    await vi.advanceTimersByTimeAsync(3000)
    await check
  })
})


describe('cancelled recording startup', () => {
  function idleRecorder() {
    let active = false
    let bytes = 0
    mock.call.mockImplementation(async (method) => {
      if (method === 'StartRecord') active = true
      if (method === 'StopRecord') active = false
      return { outputActive: active, outputBytes: active ? bytes += 100 : 0 }
    })
    const rec = recorder()
    Object.assign(rec, { _matchOwnedRecording: false, _recording: false, _startedAt: null })
    vi.spyOn(rec, 'isCurrentProgramSceneGameplay').mockResolvedValue(true)
    vi.spyOn(rec as unknown as { _startLiveKillPoll(): void }, '_startLiveKillPoll').mockImplementation(() => {})
    return rec
  }

  it('allows the next start after a permanently lost initial output-status reply', async () => {
    const rec = idleRecorder()
    mock.call.mockImplementationOnce(() => new Promise(() => {}))
    const first = expect(startRecordingWhenReady({
      ensureReady: async () => {}, start: (signal) => rec.start('cs2', undefined, { signal }), timeoutMs: 10_000,
    })).rejects.toThrow(/timed out/)
    await vi.advanceTimersByTimeAsync(10_000)
    await first

    const retry = startRecordingWhenReady({
      ensureReady: async () => {}, start: (signal) => rec.start('cs2', undefined, { signal }), timeoutMs: 10_000,
    })
    const result = Promise.allSettled([retry])
    await vi.advanceTimersByTimeAsync(10_000)
    expect(await result).toEqual([{ status: 'fulfilled', value: undefined }])
    expect(rec.isActivelyRecording()).toBe(true)
  })

  it('releases both startup and capture-setup queues after a permanently lost nested OBS reply', async () => {
    const actual = await vi.importActual<typeof import('./obs-setup')>('./obs-setup')
    vi.mocked(retargetUpForgeCapture).mockImplementation(actual.retargetUpForgeCapture)
    try {
      const rec = idleRecorder()
      let active = false
      let bytes = 0
      let inputs = 0
      mock.call.mockImplementation(async (request) => {
        if (request === 'GetInputList') {
          if (++inputs === 1) return new Promise(() => {})
          return { inputs: [] }
        }
        if (request === 'StartRecord') active = true
        return { outputActive: active, outputBytes: bytes += 100 }
      })
      const first = expect(rec.start('cs2')).rejects.toThrow('OBS GetInputList timed out')
      await vi.advanceTimersByTimeAsync(10_000)
      await first
      const retry = rec.start('cs2')
      await vi.advanceTimersByTimeAsync(10_000)
      await retry
      expect(inputs).toBe(2)
      expect(rec.isActivelyRecording()).toBe(true)
    } finally {
      vi.mocked(retargetUpForgeCapture).mockReset()
    }
  })

  it('cleans up a lost test-start reply when all OBS requests have a shared timeout', async () => {
    const rec = idleRecorder()
    let active = false
    mock.call.mockImplementation(async (request) => {
      if (request === 'StartRecord') {
        active = true
        return new Promise(() => {})
      }
      if (request === 'StopRecord') active = false
      return { outputActive: active }
    })
    const check = runObsTestRecording({ obs: rec.getObsClient() })
    await vi.advanceTimersByTimeAsync(6000)
    expect(await check).toMatchObject({ ok: false, technicalMessage: 'OBS StartRecord timed out' })
    expect(active).toBe(false)
    expect(mock.call).toHaveBeenCalledWith('StopRecord')
    expect(await rec.prepareMatchCapture()).toBe('idle')
  })

  it('does not start after its deadline expires behind another recording operation', async () => {
    const rec = idleRecorder()
    let release!: () => void
    const blocker = withObsRecordingOperation(rec.getObsClient(), () => new Promise<void>(resolve => { release = resolve }))
    const pending = expect(startRecordingWhenReady({
      ensureReady: async () => {}, start: (signal) => rec.start('cs2', undefined, { signal }), timeoutMs: 1000,
    })).rejects.toThrow('OBS start timed out')
    await vi.advanceTimersByTimeAsync(1000)
    await pending
    release()
    await blocker
    await vi.advanceTimersByTimeAsync(1000)
    expect(mock.call).not.toHaveBeenCalledWith('StartRecord')
  })

  it('does not start when the match ends while startup is queued', async () => {
    const rec = idleRecorder()
    let release!: () => void
    const blocker = withObsRecordingOperation(rec.getObsClient(), () => new Promise<void>(resolve => { release = resolve }))
    const start = Promise.allSettled([rec.start('cs2')])
    await vi.advanceTimersByTimeAsync(1)
    const stop = rec.stop()
    await vi.advanceTimersByTimeAsync(1000)
    await stop
    release()
    await blocker
    await vi.advanceTimersByTimeAsync(1000)
    await start
    expect(mock.call).not.toHaveBeenCalledWith('StartRecord')
    expect(rec.isRecording()).toBe(false)
  })

  it('does not start when the deadline expires during asynchronous capture setup', async () => {
    const rec = idleRecorder()
    let release!: (value: boolean) => void
    vi.mocked(rec.isCurrentProgramSceneGameplay).mockImplementationOnce(() => new Promise(resolve => { release = resolve }))
    const pending = expect(startRecordingWhenReady({
      ensureReady: async () => {}, start: (signal) => rec.start('cs2', undefined, { signal }), timeoutMs: 1000,
    })).rejects.toThrow('OBS start timed out')
    await vi.advanceTimersByTimeAsync(1000)
    await pending
    release(true)
    await vi.advanceTimersByTimeAsync(1000)
    expect(mock.call).not.toHaveBeenCalledWith('StartRecord')
  })

  it('releases a cancelled queued start without stopping the next match', async () => {
    const rec = idleRecorder()
    let release!: () => void
    const blocker = withObsRecordingOperation(rec.getObsClient(), () => new Promise<void>(resolve => { release = resolve }))
    const controller = new AbortController()
    const first = Promise.allSettled([rec.start('cs2', undefined, { signal: controller.signal })])
    await vi.advanceTimersByTimeAsync(1)
    controller.abort()
    const second = rec.start('cs2')
    release()
    await blocker
    await vi.advanceTimersByTimeAsync(1000)
    expect((await first)[0].status).toBe('rejected')
    await second
    expect(mock.call.mock.calls.filter(([method]) => method === 'StartRecord')).toHaveLength(1)
    expect(mock.call).not.toHaveBeenCalledWith('StopRecord')
    expect(rec.isActivelyRecording()).toBe(true)
  })

  it('does not stop the onboarding check when a queued match ends', async () => {
    const rec = idleRecorder()
    let release!: () => void
    const blocker = withObsRecordingOperation(rec.getObsClient(), () => new Promise<void>(resolve => { release = resolve }))
    mock.call.mockResolvedValue({ outputActive: true, outputBytes: 100 })
    const first = Promise.allSettled([rec.start('cs2')])
    await vi.advanceTimersByTimeAsync(1)
    const stop = rec.stop()
    await vi.advanceTimersByTimeAsync(1000)
    await stop
    expect(mock.call).not.toHaveBeenCalledWith('StopRecord')
    release()
    await blocker
    expect((await first)[0].status).toBe('rejected')
  })

  it('cleans up a cancelled request before the next match can begin', async () => {
    const rec = idleRecorder()
    let release!: () => void
    let active = false
    let bytes = 0
    let starts = 0
    mock.call.mockImplementation(async (method) => {
      if (method === 'StartRecord') {
        active = true
        if (++starts === 1) await new Promise<void>(resolve => { release = resolve })
      }
      if (method === 'StopRecord') active = false
      return { outputActive: active, outputBytes: active ? bytes += 100 : 0 }
    })
    const controller = new AbortController()
    const first = Promise.allSettled([rec.start('cs2', undefined, { signal: controller.signal })])
    await vi.advanceTimersByTimeAsync(1)
    controller.abort()
    const second = rec.start('cs2')
    release()
    await vi.advanceTimersByTimeAsync(2000)
    expect((await first)[0].status).toBe('rejected')
    await second
    expect(mock.call.mock.calls.filter(([method]) => method === 'StopRecord')).toHaveLength(1)
    expect(rec.isActivelyRecording()).toBe(true)
    expect(active).toBe(true)
    expect(rec.onStatusChange).not.toHaveBeenCalledWith(false, undefined, 'start')
  })

  it.each(['Output is already running.', ''])('does not stop an external recording that won the StartRecord race (%s)', async (message) => {
    const rec = idleRecorder()
    let active = false
    mock.call.mockImplementation(async (method) => {
      if (method === 'StartRecord') {
        active = true
        throw Object.assign(new Error(message), { code: 500 })
      }
      if (method === 'StopRecord') active = false
      return { outputActive: active, outputBytes: 100 }
    })
    const result = expect(rec.start('cs2')).rejects.toThrow(message || 'OBS is already recording')
    await vi.advanceTimersByTimeAsync(1000)
    await result
    expect(mock.call).not.toHaveBeenCalledWith('StopRecord')
    expect(active).toBe(true)
    expect(rec.isRecording()).toBe(false)
  })
})

describe('CS2 recording startup failure', () => {
  it('labels a failed start as startup, not a lost mid-match recording', async () => {
    mock.call.mockResolvedValue({ outputActive: false, outputBytes: 0 })
    const rec = recorder()
    Object.assign(rec, { _matchOwnedRecording: false, _recording: false, _startedAt: null })
    vi.spyOn(rec, 'isCurrentProgramSceneGameplay').mockResolvedValue(true)
    Object.assign(rec, { _obsStudioVersion: '32.2.1', _obsVersion: '5.6.3' })
    const check = expect(rec.start('cs2')).rejects.toMatchObject({ code: 'obs_recording_start_timeout', technicalMessage: expect.stringContaining('did not become active'), message: expect.stringContaining('did not start recording in time') })
    await vi.advanceTimersByTimeAsync(10_000)
    await check
    expect(rec.onStatusChange).toHaveBeenCalledWith(false, expect.stringContaining('did not start recording in time'), 'start')
    expect(rec.onStatusChange).not.toHaveBeenCalledWith(false, expect.any(String))
    expect(rec.getRecordingDiagnostics()).toMatchObject({ game: 'cs2', obs_studio_version: '32.2.1', stage: 'wait_output_active', output_active: false, output_bytes: 0 })
    rec.resetRecordingDiagnostics('valorant')
    expect(rec.getRecordingDiagnostics()).toMatchObject({ game: 'valorant', stage: 'preflight', output_active: null, output_bytes: null })
  })
})
