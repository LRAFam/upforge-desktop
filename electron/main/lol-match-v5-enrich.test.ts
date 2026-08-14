import { describe, expect, it, vi } from 'vitest'
import type { MatchData } from './riot-types'
import {
  applyLolEnrichPatch,
  enrichLolTimelineForCoaching,
  type LolEnrichPatch,
} from './lol-match-v5-enrich'

function baseTimeline(): MatchData {
  return {
    game: 'lol',
    matchId: 'EUW1_123',
    puuid: null,
    region: 'europe',
    queueId: '420',
    map: 'Summoners Rift',
    agent: 'Ahri',
    gameMode: 'CLASSIC',
    playerName: null,
    playerTag: null,
    matchStartTime: null,
    gameplayStartTime: null,
    recordingStartTime: Date.now() - 1_800_000,
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
    finalStats: {
      kills: 9,
      deaths: 3,
      assists: 6,
      score: 0,
      summonerName: null,
      agent: 'Ahri',
      team: null,
      level: 18,
      headshotPct: null,
      adr: null,
      accountLevel: null,
    },
    teamSnapshot: [],
    matchDetails: null,
    startTime: Date.now() - 1_800_000,
    endTime: Date.now(),
  }
}

describe('applyLolEnrichPatch', () => {
  it('sets cs, vision, role, win, and lolEnrichStatus', () => {
    const timeline = baseTimeline()
    const patch: LolEnrichPatch = {
      matchId: 'EUW1_123',
      agent: 'Ahri',
      role: 'MIDDLE',
      teamPosition: 'MIDDLE',
      win: true,
      matchResult: 'win',
      cs: 201,
      cs_per_min: 6.7,
      vision_score: 22,
      finalStats: {
        creepScore: 201,
        cs: 201,
        cs_per_min: 6.7,
        visionScore: 22,
      },
    }

    applyLolEnrichPatch(timeline, patch, 'fetched')

    expect(timeline.lolEnrichStatus).toBe('fetched')
    expect(timeline.cs).toBe(201)
    expect(timeline.finalStats?.creepScore).toBe(201)
    expect(timeline.cs_per_min).toBe(6.7)
    expect(timeline.vision_score).toBe(22)
    expect(timeline.role).toBe('MIDDLE')
    expect(timeline.teamPosition).toBe('MIDDLE')
    expect(timeline.win).toBe(true)
    expect(timeline.agent).toBe('Ahri')
  })
})

describe('enrichLolTimelineForCoaching', () => {
  it('marks no_auth when API client missing', async () => {
    const timeline = baseTimeline()
    const ok = await enrichLolTimelineForCoaching(timeline, { api: null })
    expect(ok).toBe(false)
    expect(timeline.lolEnrichStatus).toBe('no_auth')
  })

  it('applies fetched patch from API', async () => {
    const timeline = baseTimeline()
    const api = {
      post: vi.fn().mockResolvedValue({
        data: {
          success: true,
          lolEnrichStatus: 'fetched',
          patch: {
            matchId: 'EUW1_123',
            cs: 150,
            vision_score: 18,
            role: 'TOP',
            teamPosition: 'TOP',
            win: false,
            matchResult: 'loss',
            finalStats: { creepScore: 150, visionScore: 18 },
          },
        },
      }),
    }

    const ok = await enrichLolTimelineForCoaching(timeline, {
      api: api as never,
      maxWaitMs: 5_000,
      authUser: { lol_puuid: 'puuid-1' },
    })

    expect(ok).toBe(true)
    expect(timeline.lolEnrichStatus).toBe('fetched')
    expect(timeline.cs).toBe(150)
    expect(timeline.puuid).toBe('puuid-1')
  })
})
