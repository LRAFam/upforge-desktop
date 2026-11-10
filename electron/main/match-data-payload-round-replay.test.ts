import { describe, expect, it, vi } from 'vitest'

vi.mock('./spatial/map-transforms', () => ({
  worldToNorm: () => ({ x: 0.5, y: 0.5 }),
}))

vi.mock('./riot-local-api', () => ({
  totalRecordingOffsetMs: () => 0,
  recomputeTimelineVideoOffsets: () => {},
  effectiveVideoSyncOffsetMs: () => 0,
}))

vi.mock('./match-plant-telemetry', () => ({
  logPlantCoordStats: () => {},
}))

import { prepareMatchDataForUpload, submissionContextFromTimeline } from './match-data-payload'
import { buildCoachingSubmissionExtras } from './match-coaching-context'
import { buildClipUploadPayload } from './clip-coaching-context'
import type { ClipRecord } from './clip-store'
import type { MatchData } from './riot-types'

function timelineWithKills(): MatchData {
  const timeline: MatchData = {
    game: 'valorant',
    matchId: 'match-1',
    region: 'eu',
    queueId: 'competitive',
    map: 'Haven',
    agent: 'Jett',
    gameMode: 'COMPETITIVE',
    playerName: 'You',
    playerTag: 'NA1',
    puuid: 'own-puuid',
    matchStartTime: 1_000_000,
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
    finalStats: { kills: 1, deaths: 0, assists: 0, score: 200, summonerName: 'You', agent: 'Jett',
      team: 'Blue', level: 100, accountLevel: 100, headshotPct: null, adr: null },
    teamSnapshot: [
      {
        summonerName: 'You',
        agent: 'Jett',
        team: 'Blue',
        kills: 1,
        deaths: 0,
        assists: 0,
        score: 200,
        level: 100,
        puuid: 'own-puuid',
        competitiveTier: 12,
        competitiveTierName: 'Gold 1',
        abilityCasts: null,
      },
    ],
    startTime: Date.now(),
    endTime: Date.now(),
    recordingStartTime: 1_000_000,
    gameplayStartTime: 1_000_000,
    matchDetails: {
      kills: [
        {
          round: 0,
          gameTime: 45_000,
          roundTime: 12_000,
          timeSinceGameStartMillis: 45_000,
          killer: 'own-puuid',
          victim: 'enemy-puuid',
          victimLocation: { x: 100, y: 200 },
          playerLocations: [
            { subject: 'own-puuid', location: { x: 90, y: 190 } },
            { subject: 'enemy-puuid', location: { x: 100, y: 200 } },
          ],
          finishingDamage: { damageType: 'Weapon', damageItem: 'Vandal' },
        },
      ],
      roundResults: [{ roundNum: 0, winningTeam: 'Blue' }],
      players: [
        { subject: 'own-puuid', gameName: 'You', characterId: 'add6443a-41bd-e414-f6ad-e58d267f4e95', teamId: 'Blue', stats: { kills: 1, deaths: 0, assists: 0, score: 200, roundsPlayed: 1 } },
        { subject: 'enemy-puuid', gameName: 'Enemy', characterId: '569fdd95-4d10-43ab-ca70-79becc718b46', teamId: 'Red' },
      ],
    },
  }
  const event = { EventID: 1, EventName: 'ChampionKill' as const, EventTime: 45, timeSinceGameStartMillis: 45000,
    killerPuuid: 'own-puuid', victimPuuid: 'enemy-puuid', killerName: 'You', victimName: 'Enemy', assistants: [], round: 0 }
  timeline.killEvents = [event]
  timeline.playerKills = [event]
  return timeline
}

describe('prepareMatchDataForUpload roundReplay', () => {
  it('includes roundReplay on upload payload', () => {
    const upload = prepareMatchDataForUpload(timelineWithKills())
    expect(upload?.roundReplay?.rounds.length).toBeGreaterThan(0)
    expect(upload?.matchDetails).toBeUndefined()
  })
})

function completeTimeline(): MatchData {
  const timeline = timelineWithKills()
  const ids = ['own-puuid', 'enemy-puuid', ...Array.from({ length: 8 }, (_, i) => `other-${i}`)]
  timeline.finalScore = { allyScore: 1, enemyScore: 0 }
  timeline.teamSnapshot = ids.map((puuid, i) => ({ ...timeline.teamSnapshot[0], puuid,
    team: i < 5 ? 'Blue' : 'Red', kills: i === 0 ? 1 : 0, deaths: i === 1 ? 1 : 0 }))
  timeline.matchDetails!.players = timeline.teamSnapshot.map(p => ({ subject: p.puuid, teamId: p.team,
    stats: { kills: p.kills, deaths: p.deaths, assists: 0, score: 200, roundsPlayed: 1 } }))
  timeline.matchDetails!.roundResults = [{ roundNum: 0, winningTeam: 'Blue', playerStats: ids.map(subject => ({
    subject, kills: subject === 'own-puuid' ? timeline.matchDetails!.kills : [],
  })) }]
  return timeline
}

describe('upload kill completeness proof', () => {
  it('marks only the verified outgoing complete event set', () => {
    const upload = prepareMatchDataForUpload(completeTimeline())
    expect(upload?.dataQuality?.status).toBe('verified_fields_only')
    expect(upload?.killEventsComplete).toBe(true)
    expect(upload?.killEvents).toHaveLength(1)
  })

  it('does not trust a saved completeness flag when provider rows are missing', () => {
    const timeline = completeTimeline()
    timeline.killEventsComplete = true
    timeline.matchDetails!.roundResults = []
    expect(prepareMatchDataForUpload(timeline)?.killEventsComplete).toBe(false)
  })

  it('does not mark facts that the quality boundary removed as complete', () => {
    const timeline = completeTimeline()
    timeline.finalStats!.kills = 2
    const upload = prepareMatchDataForUpload(timeline)
    expect(upload?.dataQuality?.status).toBe('blocked')
    expect(upload?.killEvents).toEqual([])
    expect(upload?.killEventsComplete).toBe(false)
  })
})

it('carries versioned CS2 metrics through the upload without replacing null or zero', () => {
  const timeline = timelineWithKills()
  timeline.game = 'cs2'
  timeline.match_stats = { schema_version: 1, rounds: 2, score: '1-1', player_stats: { adr: 75, kills: 0, headshot_pct: null }, round_stats: { ct_kd: 0 }, utility_stats: { enemies_flashed: null }, economy_stats: { avg_eq_t: 4200 } }
  expect(prepareMatchDataForUpload(timeline)?.match_stats).toEqual(timeline.match_stats)
})

it('keeps the local skill profile out of match, clip and top-level submission payloads', () => {
  const timeline = completeTimeline()
  const skillProfile = { skills: { game_sense: 50, crosshair: 50, movement: 50, trading: 50, utility: 50, communication: 50 },
    gamesAnalysed: 1, updatedAt: '2026-11-10T00:00:00Z', issueCounts: { aim: 1 } }
  const settings = { skillProfile }
  const extras = buildCoachingSubmissionExtras(timeline, settings)
  expect(extras).not.toHaveProperty('skillProfile')
  expect(settings.skillProfile).toBe(skillProfile)
  // Old cached callers may still supply the retired key. No transport should copy it.
  const legacyExtras = { ...extras, skillProfile }
  const match = prepareMatchDataForUpload(timeline, legacyExtras)
  const submission = submissionContextFromTimeline(timeline, legacyExtras)
  const clip = buildClipUploadPayload({ round: 0 } as ClipRecord, timeline, legacyExtras)
  expect(JSON.stringify({ match, submission, clip })).not.toMatch(/skill_?[Pp]rofile/)
})
