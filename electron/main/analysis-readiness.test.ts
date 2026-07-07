import { describe, expect, it } from 'vitest'
import { getAnalysisReadiness, getVodFileReadiness, waitUntilVodFileReady } from './analysis-readiness'
import { MATCH_DETAILS_ENRICH_MAX_MS } from './match-data-quality'
import type { PendingRecording } from './recordings-store'
import type { MatchData } from './riot-types'

function sparseTimeline(matchId: string | null = 'match-1'): MatchData {
  return {
    game: 'valorant',
    matchId,
    puuid: 'x',
    region: 'eu',
    queueId: 'competitive',
    map: 'Haven',
    agent: 'Jett',
    gameMode: 'COMPETITIVE',
    playerName: 'test',
    playerTag: 'NA1',
    matchStartTime: 1,
    gameplayStartTime: 2,
    recordingStartTime: 3,
    roundScores: [],
    events: [],
    killEvents: [],
    playerKills: [],
    playerDeaths: [],
    spikePlants: [],
    spikeDefuses: [],
    spikeDetonations: [],
    firstBloods: [],
    roundSummaries: [],
    finalStats: null,
    teamSnapshot: [],
    matchDetails: null,
    startTime: 1,
    endTime: 2,
    videoSyncOffsetMs: -8000,
  }
}

function baseRecording(overrides: Partial<PendingRecording> = {}): PendingRecording {
  return {
    id: 'rec-1',
    path: '/tmp/match.mkv',
    recordedAt: Date.now(),
    game: 'valorant',
    riotName: 'test',
    riotTag: 'NA1',
    map: 'Ascent',
    agent: 'Jett',
    gameMode: 'COMPETITIVE',
    timeline: null,
    clipsOnly: false,
    cloudArchived: true,
    archiveId: 'archive-1',
    analysed: false,
    pipelineStatus: null,
    ...overrides,
  } as PendingRecording
}

describe('getAnalysisReadiness', () => {
  it('syncs fresh recordings while Riot stats are still loading', () => {
    const rec = baseRecording({
      recordedAt: Date.now() - 30_000,
      timeline: sparseTimeline(),
    })
    const readiness = getAnalysisReadiness(rec)
    expect(readiness.ready).toBe(false)
    expect(readiness.state).toBe('syncing')
  })

  it('allows analyse when match id exists but Riot stats are still sparse', () => {
    const rec = baseRecording({
      recordedAt: Date.now() - MATCH_DETAILS_ENRICH_MAX_MS - 60_000,
      timeline: sparseTimeline(),
    })
    const readiness = getAnalysisReadiness(rec)
    expect(readiness.ready).toBe(true)
    expect(readiness.state).toBe('ready')
  })

  it('blocks when no match id can be linked', () => {
    const rec = baseRecording({
      recordedAt: Date.now() - MATCH_DETAILS_ENRICH_MAX_MS - 60_000,
      timeline: sparseTimeline(null),
    })
    const readiness = getAnalysisReadiness(rec)
    expect(readiness.ready).toBe(false)
    expect(readiness.state).toBe('unavailable')
    expect(readiness.message).toContain('Could not link')
  })
})

describe('getVodFileReadiness', () => {
  it('returns not_required for clips-only sessions', () => {
    expect(getVodFileReadiness(baseRecording({ clipsOnly: true, path: undefined }))).toBe('not_required')
  })
})

describe('waitUntilVodFileReady', () => {
  it('returns unavailable when the recording is missing', async () => {
    const result = await waitUntilVodFileReady(() => undefined, 'gone', async () => {})
    expect(result.ok).toBe(false)
    expect(result.readiness.state).toBe('unavailable')
  })

  it('resolves immediately for clips-only sessions', async () => {
    const rec = baseRecording({ clipsOnly: true, path: undefined })
    const result = await waitUntilVodFileReady(() => rec, rec.id, async () => {})
    expect(result.ok).toBe(true)
  })
})
