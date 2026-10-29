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

import { hasLolLocalReview, type LolLocalReview } from './lol-local-review'
import { lolModule } from './analyse-modules/lol'
import { prepareMatchDataForUpload } from './match-data-payload'
import type { MatchData } from './riot-types'

const snapshot: LolLocalReview = { source: 'live_client', version: 1, champion: 'Kindred', map: "Summoner's Rift", duration_seconds: 1200, kills: 0, deaths: 0, assists: 0, cs: null }
describe('local League coaching contract', () => {
  it('accepts captured zero-KDA snapshots without a verified Riot identity', () => {
    const timeline = { game: 'lol', lolLocalReview: snapshot, lolEnrichStatus: 'no_auth' } as MatchData
    expect(hasLolLocalReview(timeline)).toBe(true)
    expect(lolModule.isReady({ game: 'lol', timeline } as Parameters<typeof lolModule.isReady>[0]).ready).toBe(true)
  })
  it('rejects wrong-game, incomplete and mixed-game snapshots', () => {
    expect(hasLolLocalReview({ game: 'valorant', lolLocalReview: snapshot })).toBe(false)
    expect(hasLolLocalReview({ game: 'lol', lolLocalReview: { ...snapshot, map: 'Split' } })).toBe(false)
    expect(hasLolLocalReview({ game: 'lol', lolLocalReview: { ...snapshot, kills: NaN } })).toBe(false)
    expect(hasLolLocalReview({ game: 'lol', lolLocalReview: { ...snapshot, duration_seconds: 0 } })).toBe(false)
  })
  it('preserves snapshot provenance when the upload drops raw client data', () => {
    const timeline = { game: 'lol', lolLocalReview: snapshot, events: [], killEvents: [], playerKills: [], playerDeaths: [], roundSummaries: [], roundScores: [], spikePlants: [], spikeDefuses: [], spikeDetonations: [], firstBloods: [], finalStats: { kills: 0, deaths: 0, assists: 0 }, teamSnapshot: [] } as unknown as MatchData
    expect(prepareMatchDataForUpload(timeline)?.lolLocalReview).toEqual(snapshot)
  })
  it('sends objective timings and verified League facts through the upload', () => {
    const leagueFacts = {
      lolAccount: { gameName: 'Player', tagLine: 'EUW', platform: 'EUW1' },
      lolEnrichStatus: 'fetched', champion: 'Kindred', role: 'JUNGLE', teamPosition: 'JUNGLE', lane: 'JUNGLE',
      win: false, matchResult: 'loss', cs: 0, cs_per_min: 0, vision_score: 0,
      objectiveEvents: [{ EventID: 1, EventName: 'DragonKill', kind: 'dragon', EventTime: 300, videoOffsetMs: 330_000 }],
    }
    const timeline = { game: 'lol', lolLocalReview: snapshot, ...leagueFacts,
      events: [], killEvents: [], playerKills: [], playerDeaths: [], roundSummaries: [], roundScores: [],
      spikePlants: [], spikeDefuses: [], spikeDetonations: [], firstBloods: [], teamSnapshot: [] } as unknown as MatchData
    expect(prepareMatchDataForUpload(timeline)).toMatchObject(leagueFacts)
  })
  it('describes the partial video review when a local snapshot unlocks analysis', () => {
    const timeline = { game: 'lol', lolLocalReview: snapshot } as MatchData
    const readiness = lolModule.isReady({ game: 'lol', timeline } as Parameters<typeof lolModule.isReady>[0])
    expect(readiness.message).toContain('selected gameplay clips')
    expect(readiness.message).not.toContain('Video, rank and vision are not reviewed')
  })
})
