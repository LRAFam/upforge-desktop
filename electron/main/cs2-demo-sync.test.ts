import { describe, expect, it } from 'vitest'
import { getAnalysisReadiness } from './analysis-readiness'
import { CS2_DEMO_SYNC_MAX_MS, cs2DemoSyncMessage, cs2DemoSyncPollIntervalMs, shouldDeferPostGameForDemoSync } from './match-data-quality'
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
    path: '',
    ...overrides,
  } as PendingRecording
}

describe('cs2DemoSyncMessage', () => {
  it('mentions 5–15 minute window early on', () => {
    expect(cs2DemoSyncMessage(60_000)).toContain('5–15')
  })

  it('mentions Steam timing', () => {
    expect(cs2DemoSyncMessage(60_000)).toMatch(/steam/i)
  })

  it('warns about peak times after 15 minutes', () => {
    expect(cs2DemoSyncMessage(20 * 60_000)).toContain('30 min')
  })
})

describe('cs2DemoSyncPollIntervalMs', () => {
  it('slows polling while another match is recording', () => {
    expect(cs2DemoSyncPollIntervalMs(60_000, true)).toBe(30_000)
  })

  it('backs off as demo wait lengthens', () => {
    expect(cs2DemoSyncPollIntervalMs(2 * 60_000)).toBe(5_000)
    expect(cs2DemoSyncPollIntervalMs(10 * 60_000)).toBe(10_000)
    expect(cs2DemoSyncPollIntervalMs(20 * 60_000)).toBe(20_000)
    expect(cs2DemoSyncPollIntervalMs(32 * 60_000)).toBe(30_000)
  })
})

describe('shouldDeferPostGameForDemoSync', () => {
  it('defers CS2 when demo stats are missing', () => {
    expect(shouldDeferPostGameForDemoSync('cs2', null)).toBe(true)
  })

  it('does not defer Valorant', () => {
    expect(shouldDeferPostGameForDemoSync('valorant', null)).toBe(false)
  })
})

describe('getAnalysisReadiness cs2 demo window', () => {
  it('stays syncing at 8 minutes', () => {
    const readiness = getAnalysisReadiness(cs2Recording())
    expect(readiness.state).toBe('syncing')
    expect(readiness.message).toContain('5–15')
  })

  it('becomes unavailable after 35 minutes', () => {
    const readiness = getAnalysisReadiness(cs2Recording({
      recordedAt: Date.now() - CS2_DEMO_SYNC_MAX_MS - 60_000,
    }))
    expect(readiness.state).toBe('unavailable')
  })
})
