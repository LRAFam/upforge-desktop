import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { OBSRecorder } from './obs-recorder'

const mock = vi.hoisted(() => ({ call: vi.fn(), on: vi.fn() }))
vi.mock('obs-websocket-js', () => ({ OBSWebSocket: class { call = mock.call; on = mock.on } }))
vi.mock('electron', () => ({ app: { getPath: () => '/tmp', getAppPath: () => '/tmp' }, nativeImage: {} }))
vi.mock('electron-log', () => ({ default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))
vi.mock('./obs-process', () => ({ isObsProcessRunning: vi.fn(async () => true) }))

function ownedRecording(): OBSRecorder {
  const rec = new OBSRecorder(() => ({ host: 'localhost', port: 4455, password: '', replayBufferSeconds: 30, obsPreserveActiveScene: false }))
  Object.assign(rec, { _connected: true, _recording: true, _matchOwnedRecording: true, _outputPath: '/tmp/match.mp4', _startedAt: Date.now() })
  rec.resetRecordingDiagnostics('valorant')
  // Reconnect needs a real OBS; these tests only cover what the disconnect report carries.
  vi.spyOn(rec as unknown as { _startReconnectLoop(): void }, '_startReconnectLoop').mockImplementation(() => {})
  return rec
}

function connectionClosed(): (err?: unknown) => void {
  return mock.on.mock.calls.find(([event]) => event === 'ConnectionClosed')![1]
}

beforeEach(() => { vi.useFakeTimers(); vi.clearAllMocks() })
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers() })

describe('OBS disconnect during a match recording — diagnostics', () => {
  it('keeps the last good output sample when the status call fails as the socket drops', async () => {
    let healthy = true
    mock.call.mockImplementation(async () => {
      if (!healthy) throw new Error('Not connected')
      return { outputActive: true, outputPaused: false, outputBytes: 5_000_000 }
    })
    const rec = ownedRecording()
    let report: Record<string, unknown> | undefined
    rec.onStatusChange = (_active, error) => { if (error) report = rec.getRecordingDiagnostics() }
    ;(rec as unknown as { _startProgressWatch(): void })._startProgressWatch()
    await vi.advanceTimersByTimeAsync(10_000)
    healthy = false
    await vi.advanceTimersByTimeAsync(10_000)
    connectionClosed()({ code: 1006, message: '' })

    expect(report).toMatchObject({
      stage: 'recording',
      obs_connected: false,
      output_active: true,
      output_bytes: 5_000_000,
      output_sample_failed: true,
    })
    expect(report!.output_sample_age_ms).toBe(10_000)
  })

  it('records the WebSocket close code and reason so socket loss and OBS shutdown can be told apart', () => {
    const rec = ownedRecording()
    let report: Record<string, unknown> | undefined
    rec.onStatusChange = (_active, error) => { if (error) report = rec.getRecordingDiagnostics() }
    connectionClosed()({ code: 1001, message: 'Server stopping' })

    expect(report).toMatchObject({ obs_close_code: 1001, obs_close_reason: 'Server stopping' })
  })

  it('reports null close details when OBS gives none, and clears them for the next match', () => {
    const rec = ownedRecording()
    let report: Record<string, unknown> | undefined
    rec.onStatusChange = (_active, error) => { if (error) report = rec.getRecordingDiagnostics() }
    connectionClosed()(undefined)
    expect(report).toMatchObject({ obs_close_code: null, obs_close_reason: null })

    connectionClosed()({ code: 1006, message: 'x'.repeat(500) })
    expect(String(rec.getRecordingDiagnostics().obs_close_reason).length).toBeLessThanOrEqual(120)

    rec.resetRecordingDiagnostics('valorant')
    expect(rec.getRecordingDiagnostics()).toMatchObject({
      obs_close_code: null, obs_close_reason: null, output_sample_age_ms: null, output_sample_failed: null,
    })
  })
})
