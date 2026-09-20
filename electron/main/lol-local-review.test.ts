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
})
