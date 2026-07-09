import { describe, expect, it } from 'vitest'
import {
  buildDeadlockReplayUrl,
  mergeSalts,
  parseDeadlockValveUrl,
} from './deadlock-steam-cache'

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
