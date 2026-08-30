import fs from 'fs'
import os from 'os'
import path from 'path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  buildDeadlockReplayUrl,
  mergeSalts,
  parseDeadlockValveUrl,
  scanChangedSteamHttpCacheEntry,
} from './deadlock-steam-cache'

const tempDirs: string[] = []

afterEach(() => {
  for (const dir of tempDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true })
})

describe('parseDeadlockValveUrl', () => {
  it('parses metadata URLs', () => {
    const salts = parseDeadlockValveUrl(
      'http://replay404.valve.net/1422450/37959196_937530290.meta.bz2',
    )
    expect(salts).toEqual({
      matchId: 37959196,
      clusterId: 404,
      metadataSalt: 937530290,
      replaySalt: null,
    })
  })

  it('parses replay URLs', () => {
    const salts = parseDeadlockValveUrl(
      'http://replay183.valve.net/1422450/42476710_428480166.dem.bz2?v=2',
    )
    expect(salts).toEqual({
      matchId: 42476710,
      clusterId: 183,
      metadataSalt: null,
      replaySalt: 428480166,
    })
  })

  it('rejects non-deadlock URLs', () => {
    expect(parseDeadlockValveUrl('http://replay1.valve.net/730/1_2.dem.bz2')).toBeNull()
  })
})

describe('mergeSalts', () => {
  it('merges metadata and replay salts for the same match', () => {
    const merged = mergeSalts(
      { matchId: 1, clusterId: 10, metadataSalt: 99, replaySalt: null },
      { matchId: 1, clusterId: 10, metadataSalt: null, replaySalt: 55 },
    )
    expect(merged.metadataSalt).toBe(99)
    expect(merged.replaySalt).toBe(55)
  })
})

describe('buildDeadlockReplayUrl', () => {
  it('builds dem.bz2 CDN URL', () => {
    const url = buildDeadlockReplayUrl({
      matchId: 42476710,
      clusterId: 183,
      metadataSalt: null,
      replaySalt: 428480166,
    })
    expect(url).toBe('http://replay183.valve.net/1422450/42476710_428480166.dem.bz2')
  })
})

describe('scanChangedSteamHttpCacheEntry', () => {
  it('parses the exact cache file reported by a filesystem change event', () => {
    const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'upforge-deadlock-cache-'))
    tempDirs.push(cacheDir)
    const nestedDir = path.join(cacheDir, 'Cache')
    fs.mkdirSync(nestedDir)
    const cacheFile = path.join(nestedDir, 'f_000123')
    fs.writeFileSync(
      cacheFile,
      Buffer.from('\0replay404.valve.net/1422450/37959196_937530290.meta.bz2\0'),
    )

    expect(scanChangedSteamHttpCacheEntry(cacheDir, path.join('Cache', 'f_000123'))).toEqual([
      expect.objectContaining({
        matchId: 37959196,
        clusterId: 404,
        metadataSalt: 937530290,
      }),
    ])
  })

  it('rejects change paths outside the watched cache directory', () => {
    const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'upforge-deadlock-cache-'))
    tempDirs.push(cacheDir)

    expect(scanChangedSteamHttpCacheEntry(cacheDir, path.join('..', 'outside'))).toEqual([])
  })
})
