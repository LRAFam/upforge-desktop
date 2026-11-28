/**
 * Desktop ↔ API readiness contract.
 *
 * API MatchDataQualityService::isReadyForCs2Desktop requires at least one kill row
 * (killEvents OR playerKills) for CS2 and Deadlock — K/D/A totals alone stay locked.
 * Desktop is stricter on Deadlock: it never offers video Analyse at all (Review replay is its one
 * analysis path, card #600), and live console-log kill rows never count as reviewed. LoL uses isReadyForLolDesktop
 * (Match-V5 enrich + combat stats). Desktop must never mark Analyse ready
 * without the same bar, or jobs fail after upload.
 *
 * Regression: v2.9.5–v2.10.64 allowed ready:true with "attach a demo" hint.
 */
import { describe, expect, it } from 'vitest'
import contract from './__fixtures__/desktop-api-readiness-contract.json'
import { getAnalysisReadiness } from './analysis-readiness'
import { lolModule } from './analyse-modules/lol'
import { hasDemoKillRows, hasRichMatchData, hasRichMatchDataForGame } from './match-data-quality'
import type { PendingRecording } from './recordings-store'
import type { MatchData } from './riot-types'

function baseRec(
  game: 'cs2' | 'deadlock' | 'lol',
  overrides: Partial<PendingRecording> = {},
): PendingRecording {
  return {
    id: 'contract-rec',
    path: '/tmp/match.mkv',
    riotName: 'Player',
    riotTag: 'NA',
    game,
    map: game === 'cs2' ? 'de_cache' : game === 'lol' ? "Summoner's Rift" : 'Avenue',
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

function lolSparseLiveClientTimeline(): MatchData {
  return {
    game: 'lol',
    matchId: 'EUW1_7123456789',
    puuid: 'puuid-1',
    region: 'europe',
    queueId: '420',
    map: "Summoner's Rift",
    agent: 'Kindred',
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
    finalStats: { kills: 5, deaths: 3, assists: 1 } as MatchData['finalStats'],
    teamSnapshot: [],
    matchDetails: null,
    startTime: 1,
    endTime: 2,
    videoSyncOffsetMs: 0,
  }
}

function lolEnrichedTimeline(): MatchData {
  return {
    ...lolSparseLiveClientTimeline(),
    lolEnrichStatus: 'fetched',
    cs: 120,
    vision_score: 15,
    role: 'JUNGLE',
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

    it(`${game}: K/D/A totals without kill rows stay locked (mirrors API #607)`, () => {
      const tl: MatchData = {
        ...sparseTimeline(game),
        finalStats: { kills: 5, deaths: 3, assists: 1 } as MatchData['finalStats'],
      }
      expect(hasDemoKillRows(tl)).toBe(false)
      const readiness = getAnalysisReadiness(baseRec(game, { timeline: tl }))
      expect(readiness.ready).toBe(false)
      expect(['syncing', 'waiting_match_data']).toContain(readiness.state)
    })

    it(`${game}: empty killEvents do not hide real playerKills`, () => {
      const tl: MatchData = {
        ...sparseTimeline(game),
        killEvents: [],
        playerKills: [{ EventID: 1 } as MatchData['playerKills'][number]],
      }
      expect(hasDemoKillRows(tl)).toBe(true)
      // Deadlock never unlocks video Analyse; its replay review is the coaching (card #600).
      expect(getAnalysisReadiness(baseRec(game, { timeline: tl })).ready).toBe(game === 'cs2')
    })
  }

  it('cs2: Analyse unlocks only when demo stats are rich', () => {
    const rich = baseRec('cs2', { timeline: richTimeline('cs2') })
    expect(hasRichMatchData(rich.timeline)).toBe(true)

    const readiness = getAnalysisReadiness(rich)
    expect(readiness.ready).toBe(true)
    expect(readiness.state).toBe('ready')
  })

  it('deadlock: one analysis path — rich replay stats mark it reviewed, never Analyse-ready', () => {
    const rich = baseRec('deadlock', { timeline: richTimeline('deadlock') })
    expect(hasRichMatchData(rich.timeline)).toBe(true)

    const readiness = getAnalysisReadiness(rich)
    expect(readiness.ready).toBe(false)
    expect(readiness.state).toBe('mode_unsupported')
    expect(readiness.message).toMatch(/Review replay/)
  })

  it('deadlock: live console-log kill rows alone do not unlock a demo review', () => {
    const tl: MatchData = { ...richTimeline('deadlock'), killRowsSource: 'live_log' }
    expect(hasDemoKillRows(tl)).toBe(false)
    const readiness = getAnalysisReadiness(baseRec('deadlock', { timeline: tl }))
    expect(readiness.ready).toBe(false)
    expect(['syncing', 'waiting_match_data']).toContain(readiness.state)
  })

  it('lol: Analyse stays locked with Live Client stats only (mirrors API isReadyForLolDesktop)', () => {
    const sparse = baseRec('lol', { timeline: lolSparseLiveClientTimeline() })
    expect(hasRichMatchData(sparse.timeline)).toBe(true)

    const readiness = getAnalysisReadiness(sparse)
    expect(readiness.ready).toBe(false)
    expect(['waiting_match_data', 'unavailable']).toContain(readiness.state)
  })

  it('lol: keeps waiting past Valorant 3m window while Match-V5 enrich is pending', () => {
    const sparse = baseRec('lol', {
      recordedAt: Date.now() - 4 * 60_000,
      timeline: lolSparseLiveClientTimeline(),
    })
    const readiness = getAnalysisReadiness(sparse)
    expect(readiness.ready).toBe(false)
    expect(readiness.state).toBe('waiting_match_data')
  })

  it('lol: times out after API-aligned 12m window without enrich', () => {
    const sparse = baseRec('lol', {
      recordedAt: Date.now() - 13 * 60_000,
      timeline: lolSparseLiveClientTimeline(),
    })
    const readiness = getAnalysisReadiness(sparse)
    expect(readiness.ready).toBe(false)
    expect(readiness.state).toBe('unavailable')
    expect(readiness.message).toMatch(/not available in time|Retry sync/i)
  })

  it('lol: Analyse unlocks only when Match-V5 enrich is fetched', () => {
    const enriched = baseRec('lol', { timeline: lolEnrichedTimeline() })
    expect(hasRichMatchData(enriched.timeline)).toBe(true)

    const readiness = getAnalysisReadiness(enriched)
    expect(readiness.ready).toBe(true)
    expect(readiness.state).toBe('ready')
  })
})

/**
 * Shared cases: the API runs the same JSON (tests/fixtures/desktop-api-readiness-contract.json in
 * upforge-api) against MatchDataQualityService, and its CI fails when the two copies differ.
 */
describe('shared desktop/API readiness contract', () => {
  type Case = { name: string; game: 'cs2' | 'deadlock' | 'valorant' | 'lol'; matchData: Partial<MatchData>; expect: { api: boolean; desktop: boolean }; known_drift?: string }
  const cases = contract.cases as Case[]

  it('covers every desktop game', () => {
    expect([...new Set(cases.map(c => c.game))].sort()).toEqual(['cs2', 'deadlock', 'lol', 'valorant'])
  })

  for (const c of cases) {
    it(c.name, () => {
      const timeline = c.matchData as MatchData
      const ready = c.game === 'lol'
        ? lolModule.isReady({ ...baseRec('lol'), timeline }).ready
        : hasRichMatchDataForGame(c.game, timeline)
      expect(ready).toBe(c.expect.desktop)
      if (c.expect.desktop !== c.expect.api) expect(c.known_drift).toBeTruthy()
    })
  }
})
