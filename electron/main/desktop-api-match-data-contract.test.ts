/**
 * Desktop ↔ API readiness contract.
 *
 * API MatchDataQualityService::isReadyForCs2Desktop requires rich match_data
 * (kills / finalStats) for CS2 and Deadlock. Desktop must never mark Analyse
 * ready without the same bar, or jobs fail with DEMO_NOT_READY /
 * missing_coaching_inputs after upload.
 *
 * Regression: v2.9.5–v2.10.64 allowed ready:true with "attach a demo" hint.
 */
import { describe, expect, it } from 'vitest'
import { getAnalysisReadiness } from './analysis-readiness'
import { hasRichMatchData } from './match-data-quality'
import type { PendingRecording } from './recordings-store'
import type { MatchData } from './riot-types'

function baseRec(game: 'cs2' | 'deadlock', overrides: Partial<PendingRecording> = {}): PendingRecording {
  return {
    id: 'contract-rec',
    path: '/tmp/match.mkv',
    riotName: 'Player',
    riotTag: 'NA',
    game,
    map: game === 'cs2' ? 'de_cache' : 'Avenue',
    agent: null,
    recordedAt: Date.now() - 60_000,
    timeline: null,
    clipsOnly: false,
    cloudArchived: true,
    archiveId: 'arch-1',
    ...overrides,
  } as PendingRecording
}

function sparseTimeline(game: 'cs2' | 'deadlock'): MatchData {
  return {
    game,
    matchId: null,
    puuid: null,
    region: null,
    queueId: null,
    map: game === 'cs2' ? 'de_cache' : 'Avenue',
    agent: null,
    gameMode: null,
    playerName: 'Player',
    playerTag: null,
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
    videoSyncOffsetMs: 0,
  }
}

function richTimeline(game: 'cs2' | 'deadlock'): MatchData {
  return {
    ...sparseTimeline(game),
    killEvents: [{ EventID: 1 } as MatchData['killEvents'][number]],
    playerKills: [{ EventID: 1 } as MatchData['playerKills'][number]],
    finalStats: { kills: 5, deaths: 3, assists: 1 } as MatchData['finalStats'],
  }
}

describe('desktop/API match-data readiness contract', () => {
  for (const game of ['cs2', 'deadlock'] as const) {
    it(`${game}: Analyse stays locked without rich demo stats (mirrors API isReadyForCs2Desktop)`, () => {
      const sparse = baseRec(game, { timeline: sparseTimeline(game) })
      expect(hasRichMatchData(sparse.timeline)).toBe(false)

      const readiness = getAnalysisReadiness(sparse)
      expect(readiness.ready).toBe(false)
      expect(['syncing', 'waiting_match_data']).toContain(readiness.state)
    })

    it(`${game}: Analyse unlocks only when demo stats are rich`, () => {
      const rich = baseRec(game, { timeline: richTimeline(game) })
      expect(hasRichMatchData(rich.timeline)).toBe(true)

      const readiness = getAnalysisReadiness(rich)
      expect(readiness.ready).toBe(true)
      expect(readiness.state).toBe('ready')
    })
  }
})
