import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { OBSRecorder } from './obs-recorder'
import { waitForRecordingProgress, waitForRecordingStopped } from './obs-record-progress'

const mock = vi.hoisted(() => ({ call: vi.fn(), on: vi.fn(), fileSize: 100 }))
vi.mock('obs-websocket-js', () => ({ OBSWebSocket: class { call = mock.call; on = mock.on } }))
vi.mock('electron', () => ({ app: { getPath: () => '/tmp', getAppPath: () => '/tmp' }, nativeImage: {} }))
vi.mock('electron-log', () => ({ default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))
vi.mock('./disk-space', () => ({ getFreeDiskSpace: async () => Infinity, CRITICAL_FREE_DISK_BYTES: 100, WARN_FREE_DISK_BYTES: 200 }))
vi.mock('./obs-setup', () => ({ retargetUpForgeCapture: vi.fn(), fitUpForgeCaptureToCanvas: vi.fn() }))
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

beforeEach(() => { vi.useFakeTimers(); vi.clearAllMocks(); mock.fileSize = 100 })
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers() })

describe('recovered recording clock', () => {
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
    expect(await rec.stop()).toBeNull()
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
    expect(await stopped).toBeNull()
    expect(rec.isRecording()).toBe(true)
    expect(rec.hasRecordingFailure()).toBe(true)
    expect(rec.onStatusChange).not.toHaveBeenCalledWith(false)
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

  it('reports a zero-byte finalization timeout as failure', async () => {
    mock.fileSize = 0
    mock.call.mockResolvedValue({ outputActive: false, outputBytes: 0 })
    const rec = recorder()
    const stopped = rec.stop()
    await vi.advanceTimersByTimeAsync(46_000)
    expect(await stopped).toBeNull()
    expect(rec.getLastError()).toMatch(/did not finalize/)
    expect(rec.onStatusChange).not.toHaveBeenCalledWith(false, undefined)
  })

  it('bounds a hung stop request and keeps ownership', async () => {
    mock.call.mockImplementation((method) => method === 'StopRecord' ? new Promise(() => {}) : Promise.resolve({ outputActive: true }))
    const rec = recorder()
    const stopped = rec.stop()
    await vi.advanceTimersByTimeAsync(6000)
    expect(await stopped).toBeNull()
    expect(rec.isRecording()).toBe(true)
    expect(rec.getLastError()).toMatch(/timed out/)
  })
})

describe('mid-match progress watchdog', () => {
  function watch(rec: OBSRecorder) {
    (rec as unknown as { _startProgressWatch(): void })._startProgressWatch()
  }

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
  it('allows a fresh startup after shared setup fails', async () => {
    let active = false
    let bytes = 0
    mock.call.mockImplementation(async (method) => {
      if (method === 'StartRecord') active = true
      return { outputActive: active, outputBytes: active ? bytes += 100 : 0 }
    })
    const rec = recorder()
    Object.assign(rec, { _matchOwnedRecording: false, _recording: false, _startedAt: null })
    vi.spyOn(rec, 'isCurrentProgramSceneGameplay').mockResolvedValueOnce(false).mockResolvedValue(true)
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
    const check = expect(rec.start('valorant')).rejects.toThrow('not producing')
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


describe('CS2 recording startup failure', () => {
  it('labels a failed start as startup, not a lost mid-match recording', async () => {
    mock.call.mockResolvedValue({ outputActive: false, outputBytes: 0 })
    const rec = recorder()
    Object.assign(rec, { _matchOwnedRecording: false, _recording: false, _startedAt: null })
    vi.spyOn(rec, 'isCurrentProgramSceneGameplay').mockResolvedValue(true)
    Object.assign(rec, { _obsStudioVersion: '32.2.1', _obsVersion: '5.6.3' })
    const check = expect(rec.start('cs2')).rejects.toThrow('did not start recording in time')
    await vi.advanceTimersByTimeAsync(10_000)
    await check
    expect(rec.onStatusChange).toHaveBeenCalledWith(false, expect.stringContaining('did not start recording in time'), 'start')
    expect(rec.onStatusChange).not.toHaveBeenCalledWith(false, expect.any(String))
    expect(rec.getRecordingDiagnostics()).toMatchObject({ game: 'cs2', obs_studio_version: '32.2.1', stage: 'wait_output_active', output_active: false, output_bytes: 0 })
    rec.resetRecordingDiagnostics('valorant')
    expect(rec.getRecordingDiagnostics()).toMatchObject({ game: 'valorant', stage: 'preflight', output_active: null, output_bytes: null })
  })
})
