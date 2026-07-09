import { describe, expect, it } from 'vitest'
import { getAnalysisReadiness } from './analysis-readiness'
import { shouldDeferPostGameForDemoSync, demoAttachHint } from './match-data-quality'
import type { PendingRecording } from './recordings-store'

function cs2Recording(overrides: Partial<PendingRecording> = {}): PendingRecording {
  return {
    id: 'rec-1',
    path: '/tmp/match.mkv',
    riotName: 'Player',
    riotTag: 'NA',
    game: 'cs2',
    map: 'de_dust2',
    agent: null,
    recordedAt: Date.now() - 8 * 60 * 1000,
    timeline: null,
    clipsOnly: false,
    cloudArchived: true,
    archiveId: 'arch-1',
    ...overrides,
  } as PendingRecording
}

describe('shouldDeferPostGameForDemoSync', () => {
  it('never defers post-game for demo sync', () => {
    expect(shouldDeferPostGameForDemoSync('cs2', null)).toBe(false)
    expect(shouldDeferPostGameForDemoSync('deadlock', null)).toBe(false)
    expect(shouldDeferPostGameForDemoSync('valorant', null)).toBe(false)
  })
})

describe('demoAttachHint', () => {
  it('mentions attach for CS2', () => {
    expect(demoAttachHint('cs2')).toMatch(/attach/i)
  })
})

describe('getAnalysisReadiness cs2 without demo', () => {
  it('is ready for VOD analysis without a demo', () => {
    const readiness = getAnalysisReadiness(cs2Recording())
    expect(readiness.state).toBe('ready')
    expect(readiness.ready).toBe(true)
    expect(readiness.message).toMatch(/attach/i)
  })

  it('stays ready after long elapsed time', () => {
    const readiness = getAnalysisReadiness(cs2Recording({
      recordedAt: Date.now() - 40 * 60 * 1000,
    }))
    expect(readiness.state).toBe('ready')
    expect(readiness.ready).toBe(true)
  })
})
