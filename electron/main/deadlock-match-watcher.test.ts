import fs from 'fs'
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'

vi.mock('electron-log', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

vi.mock('./deadlock-steam-cache', () => ({
  getResolvedSteamHttpCacheDir: vi.fn(() => null),
  logSteamCacheDiagnostics: vi.fn(),
  mergeSalts: vi.fn((prev, next) => ({ ...prev, ...next })),
  resolveSteamHttpCacheDir: vi.fn(async () => null),
  scanChangedSteamHttpCacheEntry: vi.fn(() => []),
  scanSteamHttpCache: vi.fn(async () => []),
}))

vi.mock('./deadlock-paths', () => ({
  getDeadlockReplayDirsSync: vi.fn(() => []),
  resolveDeadlockReplayDirs: vi.fn(async () => []),
}))

import {
  DEADLOCK_CACHE_POLL_MS,
  isDeadlockReadyToRecord,
  nextDeadlockCacheScanAt,
  noteDeadlockWaitStarted,
  resetDeadlockLogSession,
  startDeadlockLogWatcher,
  stopDeadlockLogWatcher,
  suppressDeadlockAutoRecordUntilNewMatch,
} from './deadlock-match-watcher'
import {
  resolveSteamHttpCacheDir,
  scanChangedSteamHttpCacheEntry,
  scanSteamHttpCache,
} from './deadlock-steam-cache'

describe('deadlock match readiness', () => {
  it('advances the cache watermark even when a scan has no hits', () => {
    expect(nextDeadlockCacheScanAt(100, 500)).toBe(500)
  })

  it('uses a low-overhead cache polling cadence', () => {
    expect(DEADLOCK_CACHE_POLL_MS).toBe(10_000)
  })

  beforeEach(() => {
    stopDeadlockLogWatcher()
    resetDeadlockLogSession()
    vi.mocked(resolveSteamHttpCacheDir).mockResolvedValue(null)
    vi.mocked(scanChangedSteamHttpCacheEntry).mockReturnValue([])
    vi.mocked(scanSteamHttpCache).mockResolvedValue([])
  })

  afterEach(() => {
    stopDeadlockLogWatcher()
    vi.restoreAllMocks()
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

    startDeadlockLogWatcher()
    await vi.advanceTimersByTimeAsync(DEADLOCK_CACHE_POLL_MS + 500)

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
    await vi.advanceTimersByTimeAsync(DEADLOCK_CACHE_POLL_MS + 500)
    expect(isDeadlockReadyToRecord()).toBe(false)

    vi.mocked(scanSteamHttpCache).mockResolvedValueOnce([{
      matchId: 202,
      clusterId: 1,
      metadataSalt: 7,
      replaySalt: null,
      sourcePath: '/cache/b',
      url: 'https://replay1.valve.net/1422450/202_7.meta.bz2',
    }])
    await vi.advanceTimersByTimeAsync(DEADLOCK_CACHE_POLL_MS + 500)

    expect(isDeadlockReadyToRecord()).toBe(true)
    stopDeadlockLogWatcher()
    vi.useRealTimers()
  })

  it('starts recording when a new metadata cache file change is reported', async () => {
    const changeEvent = { current: null as (() => void) | null }
    const watcher = {
      close: vi.fn(),
      on: vi.fn().mockReturnThis(),
    } as unknown as fs.FSWatcher
    vi.spyOn(fs, 'watch').mockImplementation(((...args: unknown[]) => {
      const listener = args[2] as ((eventType: 'rename' | 'change', filename: string) => void)
      changeEvent.current = () => listener('change', 'Cache\\f_1')
      return watcher
    }) as typeof fs.watch)
    vi.mocked(resolveSteamHttpCacheDir).mockResolvedValue('C:\\Steam\\appcache\\httpcache')
    vi.mocked(scanChangedSteamHttpCacheEntry).mockReturnValue([{
      matchId: 303,
      clusterId: 4,
      metadataSalt: 88,
      replaySalt: null,
      sourcePath: 'C:\\Steam\\appcache\\httpcache\\Cache\\f_1',
      url: 'http://replay4.valve.net/1422450/303_88.meta.bz2',
    }])

    startDeadlockLogWatcher()
    await vi.waitFor(() => expect(changeEvent.current).not.toBeNull())
    changeEvent.current?.()

    expect(isDeadlockReadyToRecord()).toBe(true)
    expect(scanChangedSteamHttpCacheEntry).toHaveBeenCalledWith(
      'C:\\Steam\\appcache\\httpcache',
      'Cache\\f_1',
    )
  })
})
