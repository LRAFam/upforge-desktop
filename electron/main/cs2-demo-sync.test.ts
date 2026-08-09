import { describe, expect, it } from 'vitest'
import { getAnalysisReadiness } from './analysis-readiness'
import {
  shouldDeferPostGameForDemoSync,
  demoAttachHint,
  demoSyncMaxMsForGame,
  CS2_DEMO_SYNC_MAX_MS,
} from './match-data-quality'
import type { PendingRecording } from './recordings-store'
import type { MatchData } from './riot-types'

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

function richDemoTimeline(game: 'cs2' | 'deadlock'): MatchData {
  return {
    game,
    matchId: '1',
    puuid: null,
    region: null,
    queueId: null,
    map: game === 'cs2' ? 'de_dust2' : 'Avenue',
    agent: null,
    gameMode: null,
    playerName: 'Player',
    playerTag: null,
    matchStartTime: 1,
    gameplayStartTime: 2,
    recordingStartTime: 3,
    roundScores: [],
    events: [],
    killEvents: [{ EventID: 1 } as MatchData['killEvents'][number]],
    playerKills: [{ EventID: 1 } as MatchData['playerKills'][number]],
    playerDeaths: [{ EventID: 2 } as MatchData['playerDeaths'][number]],
    spikePlants: [],
    spikeDefuses: [],
    spikeDetonations: [],
    firstBloods: [],
    roundSummaries: [],
    finalStats: { kills: 5, deaths: 3, assists: 1 } as MatchData['finalStats'],
    teamSnapshot: [],
    matchDetails: null,
    startTime: 1,
    endTime: 2,
    videoSyncOffsetMs: 0,
  }
}

describe('shouldDeferPostGameForDemoSync', () => {
  it('never defers post-game for demo sync', () => {
    expect(shouldDeferPostGameForDemoSync('cs2', null)).toBe(false)
    expect(shouldDeferPostGameForDemoSync('deadlock', null)).toBe(false)
    expect(shouldDeferPostGameForDemoSync('valorant', null)).toBe(false)
  })
})

describe('demoAttachHint', () => {
  it('mentions attach and Analyse lock for CS2', () => {
    expect(demoAttachHint('cs2')).toMatch(/attach/i)
    expect(demoAttachHint('cs2')).toMatch(/Analyse/i)
  })
})

describe('demoSyncMaxMsForGame', () => {
  it('gives Deadlock the same Valve demo window as CS2', () => {
    expect(demoSyncMaxMsForGame('cs2')).toBe(CS2_DEMO_SYNC_MAX_MS)
    expect(demoSyncMaxMsForGame('deadlock')).toBe(CS2_DEMO_SYNC_MAX_MS)
  })
})

describe('getAnalysisReadiness cs2/deadlock without demo', () => {
  it('locks Analyse while CS2 demo is still syncing', () => {
    const readiness = getAnalysisReadiness(cs2Recording())
    expect(readiness.ready).toBe(false)
    expect(readiness.state).toBe('syncing')
    expect(readiness.message).toMatch(/Steam demo|GOTV|Waiting/i)
  })

  it('keeps Analyse locked after the sync window until a demo is attached', () => {
    const readiness = getAnalysisReadiness(cs2Recording({
      recordedAt: Date.now() - 40 * 60 * 1000,
    }))
    expect(readiness.ready).toBe(false)
    expect(readiness.state).toBe('waiting_match_data')
    expect(readiness.message).toMatch(/Attach the CS2/i)
  })

  it('locks Deadlock Analyse until the replay is linked', () => {
    const readiness = getAnalysisReadiness(cs2Recording({
      game: 'deadlock',
      map: 'Avenue',
      recordedAt: Date.now() - 2 * 60 * 1000,
    }))
    expect(readiness.ready).toBe(false)
    expect(readiness.state).toBe('syncing')
    expect(readiness.message).toMatch(/Deadlock replay/i)
  })

  it('unlocks Analyse once demo stats are rich', () => {
    const readiness = getAnalysisReadiness(cs2Recording({
      timeline: richDemoTimeline('cs2'),
    }))
    expect(readiness.ready).toBe(true)
    expect(readiness.state).toBe('ready')
  })

  it('unlocks Deadlock Analyse once replay stats are rich', () => {
    const readiness = getAnalysisReadiness(cs2Recording({
      game: 'deadlock',
      timeline: richDemoTimeline('deadlock'),
    }))
    expect(readiness.ready).toBe(true)
    expect(readiness.state).toBe('ready')
  })
})
