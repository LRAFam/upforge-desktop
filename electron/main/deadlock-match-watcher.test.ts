import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'

vi.mock('electron-log', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

vi.mock('./deadlock-steam-cache', () => ({
  logSteamCacheDiagnostics: vi.fn(),
  mergeSalts: vi.fn((prev, next) => ({ ...prev, ...next })),
  scanSteamHttpCache: vi.fn(async () => []),
}))

vi.mock('./deadlock-paths', () => ({
  getDeadlockReplayDirsSync: vi.fn(() => []),
  resolveDeadlockReplayDirs: vi.fn(async () => []),
}))

import {
  isDeadlockReadyToRecord,
  noteDeadlockWaitStarted,
  resetDeadlockLogSession,
  stopDeadlockLogWatcher,
  suppressDeadlockAutoRecordUntilNewMatch,
} from './deadlock-match-watcher'
import { scanSteamHttpCache } from './deadlock-steam-cache'

describe('deadlock match readiness', () => {
  beforeEach(() => {
    stopDeadlockLogWatcher()
    resetDeadlockLogSession()
    vi.mocked(scanSteamHttpCache).mockResolvedValue([])
  })

  afterEach(() => {
    stopDeadlockLogWatcher()
  })

  it('does not record immediately when the game opens', () => {
    noteDeadlockWaitStarted()
    expect(isDeadlockReadyToRecord()).toBe(false)
  })

  it('does not record after the old lobby fallback window', async () => {
    vi.useFakeTimers()
    noteDeadlockWaitStarted()
    vi.advanceTimersByTime(60_000)
    expect(isDeadlockReadyToRecord()).toBe(false)
    vi.useRealTimers()
  })

  it('suppresses auto-record after manual stop until a new match id appears', async () => {
    vi.useFakeTimers()
    noteDeadlockWaitStarted()

    vi.mocked(scanSteamHttpCache).mockResolvedValueOnce([{
      matchId: 101,
      clusterId: 1,
      metadataSalt: 42,
      replaySalt: null,
      sourcePath: '/cache/a',
      url: 'https://replay1.valve.net/1422450/101_42.meta.bz2',
    }])

    const { startDeadlockLogWatcher } = await import('./deadlock-match-watcher')
    startDeadlockLogWatcher()
    await vi.advanceTimersByTimeAsync(3_500)

    expect(isDeadlockReadyToRecord()).toBe(true)

    suppressDeadlockAutoRecordUntilNewMatch()
    expect(isDeadlockReadyToRecord()).toBe(false)

    vi.mocked(scanSteamHttpCache).mockResolvedValueOnce([{
      matchId: 101,
      clusterId: 1,
      metadataSalt: 42,
      replaySalt: null,
      sourcePath: '/cache/a',
      url: 'https://replay1.valve.net/1422450/101_42.meta.bz2',
    }])
    await vi.advanceTimersByTimeAsync(3_500)
    expect(isDeadlockReadyToRecord()).toBe(false)

    vi.mocked(scanSteamHttpCache).mockResolvedValueOnce([{
      matchId: 202,
      clusterId: 1,
      metadataSalt: 7,
      replaySalt: null,
      sourcePath: '/cache/b',
      url: 'https://replay1.valve.net/1422450/202_7.meta.bz2',
    }])
    await vi.advanceTimersByTimeAsync(3_500)

    expect(isDeadlockReadyToRecord()).toBe(true)
    stopDeadlockLogWatcher()
    vi.useRealTimers()
  })
})
