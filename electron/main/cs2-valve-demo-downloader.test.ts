import { EventEmitter } from 'node:events'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  exec: vi.fn(), spawn: vi.fn(), exists: vi.fn(), unlink: vi.fn(), decode: vi.fn(),
}))
vi.mock('child_process', () => ({
  exec: Object.assign(vi.fn(), { [Symbol.for('nodejs.util.promisify.custom')]: mocks.exec }),
  spawn: mocks.spawn,
}))
vi.mock('electron', () => ({ app: { isPackaged: false, getAppPath: () => '/app', getPath: () => '/tmp' } }))
vi.mock('electron-log', () => ({ default: { info: vi.fn(), warn: vi.fn() } }))
vi.mock('fs', () => ({ default: { existsSync: mocks.exists, unlink: mocks.unlink, readFileSync: () => new Uint8Array() } }))
vi.mock('csgo-protobuf', () => ({ CMsgGCCStrike15_v2_MatchListSchema: {}, fromBinary: mocks.decode }))
vi.mock('./valve-demo-download', () => ({ downloadValveDemoArchive: vi.fn() }))
vi.mock('./cs2-demo-dirs', () => ({ getCs2ValveDemoDownloadDir: vi.fn() }))

beforeEach(() => {
  vi.resetModules()
  vi.resetAllMocks()
  vi.useFakeTimers()
  vi.spyOn(process, 'platform', 'get').mockReturnValue('win32')
  mocks.exec.mockResolvedValue({ stdout: 'No tasks are running' })
  mocks.exists.mockReturnValue(true)
  mocks.decode.mockReturnValue({ matches: [] })
})
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks() })

function child() {
  return Object.assign(new EventEmitter(), {
    stdout: new EventEmitter(), stderr: new EventEmitter(), kill: vi.fn(),
  })
}

describe('Steam demo lookup', () => {
  it('does not launch the helper or terminate CS2 while the game is open', async () => {
    mocks.exec.mockResolvedValue({ stdout: '"cs2.exe","123"' })
    const { listRecentValveMatches } = await import('./cs2-valve-demo-downloader')
    await expect(listRecentValveMatches()).rejects.toThrow('Close CS2')
    expect(mocks.spawn).not.toHaveBeenCalled()
    expect(mocks.exec).toHaveBeenCalledTimes(1)
    expect(mocks.exec.mock.calls[0][0]).toContain('tasklist')
  })

  it('terminates a stuck lookup after 30 seconds', async () => {
    const proc = child()
    mocks.spawn.mockReturnValue(proc)
    const { listRecentValveMatches } = await import('./cs2-valve-demo-downloader')
    const result = expect(listRecentValveMatches()).rejects.toThrow('timed out')
    await vi.advanceTimersByTimeAsync(30_000)
    await result
    expect(proc.kill).toHaveBeenCalledTimes(1)
  })

  it('clears the timeout after success', async () => {
    const proc = child()
    mocks.spawn.mockReturnValue(proc)
    const { listRecentValveMatches } = await import('./cs2-valve-demo-downloader')
    const result = listRecentValveMatches()
    await vi.advanceTimersByTimeAsync(0)
    proc.emit('exit', 0)
    await expect(result).resolves.toEqual([])
    await vi.advanceTimersByTimeAsync(30_000)
    expect(proc.kill).not.toHaveBeenCalled()
    expect(mocks.unlink).toHaveBeenCalled()
  })

  it('clears the timeout on spawn failure', async () => {
    const proc = child()
    mocks.spawn.mockReturnValue(proc)
    const { listRecentValveMatches } = await import('./cs2-valve-demo-downloader')
    const result = expect(listRecentValveMatches()).rejects.toThrow('spawn failed')
    await vi.advanceTimersByTimeAsync(0)
    proc.emit('error', new Error('spawn failed'))
    await result
    await vi.advanceTimersByTimeAsync(30_000)
    expect(proc.kill).not.toHaveBeenCalled()
  })
})
