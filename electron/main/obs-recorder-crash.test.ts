import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { OBSRecorder } from './obs-recorder'

const mock = vi.hoisted(() => ({ call: vi.fn(), on: vi.fn(), root: '', running: false, file: '' }))
vi.mock('obs-websocket-js', () => ({ OBSWebSocket: class { call = mock.call; on = mock.on; connect = vi.fn(async () => { throw new Error('ECONNREFUSED') }); disconnect = vi.fn() } }))
vi.mock('electron', () => ({ app: { getPath: () => mock.root, getAppPath: () => mock.root }, nativeImage: {} }))
vi.mock('electron-log', () => ({ default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))
vi.mock('./obs-process', async (original) => ({
  ...await original<typeof import('./obs-process')>(),
  isObsProcessRunning: vi.fn(async () => mock.running),
}))

function crashedRecorder() {
  const rec = new OBSRecorder(() => ({ host: 'localhost', port: 4455, password: '', replayBufferSeconds: 30, obsPreserveActiveScene: false }))
  // OBS died mid-match: socket gone, process gone, ownership still held.
  Object.assign(rec, {
    _connected: false, _recording: false, _matchOwnedRecording: true, _disconnectedDuringRecording: true,
    _obsProcessDiedDuringMatch: true, _outputPath: mock.file, _startedAt: Date.now(),
  })
  vi.spyOn(rec, 'connect').mockResolvedValue({ ok: false } as Awaited<ReturnType<OBSRecorder['connect']>>)
  rec.onStatusChange = vi.fn()
  return rec
}

beforeEach(() => {
  vi.useFakeTimers(); vi.clearAllMocks(); mock.running = false
  mock.root = fs.mkdtempSync(path.join(os.tmpdir(), 'upforge-crash-test-'))
  mock.file = path.join(mock.root, 'match.mkv')
})
afterEach(() => {
  vi.clearAllTimers(); vi.useRealTimers()
  fs.rmSync(mock.root, { recursive: true, force: true })
})

describe('OBS crash mid-match', () => {
  it('returns the surviving MKV instead of failing the match', async () => {
    fs.writeFileSync(mock.file, Buffer.alloc(4096))
    const rec = crashedRecorder()
    const stopped = rec.stop()
    await vi.advanceTimersByTimeAsync(5_000)
    expect(await stopped).toBe(mock.file)
    expect(rec.hasRecordingFailure()).toBe(false)
    expect(rec.isRecording()).toBe(false)
  })

  it('a crash that left no file still ends cleanly so the match-end path scan can look', async () => {
    const rec = crashedRecorder()
    const stopped = rec.stop()
    await vi.advanceTimersByTimeAsync(5_000)
    expect(await stopped).toBe(mock.file)
    expect(rec.hasRecordingFailure()).toBe(false)
  })

  it('OBS still running but unreachable keeps the old failure (file may still be growing)', async () => {
    mock.running = true
    fs.writeFileSync(mock.file, Buffer.alloc(4096))
    const rec = crashedRecorder()
    const stopped = rec.stop()
    await vi.advanceTimersByTimeAsync(200_000)
    expect(await stopped).toBeNull()
    expect(rec.hasRecordingFailure()).toBe(true)
  })
})
