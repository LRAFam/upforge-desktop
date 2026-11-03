import { describe, expect, it } from 'vitest'
import { Cs2GsiTracker, cs2LiveDeathsForVod, cs2LiveKillsForVod, cs2LiveRoundSummariesForVod, type Cs2GsiPayload } from './cs2-gsi-timeline'
import { hasRichMatchData } from './match-data-quality'
import { emptyMatchData, timelineDeathsForVod, timelineKillsForVod } from './recording-sync'

const ME = '76561190000000001'
function p(round: number, extra: Partial<Cs2GsiPayload['player']> & { steamid?: string } = {}, roundPhase = 'live', map: Partial<NonNullable<Cs2GsiPayload['map']>> = {}): Cs2GsiPayload {
  return {
    provider: { steamid: ME },
    map: { name: 'de_nuke', mode: 'scrimcomp2v2', phase: 'live', round, team_ct: { score: 0 }, team_t: { score: 0 }, ...map },
    round: { phase: roundPhase },
    player: { steamid: ME, team: 'CT', state: { health: 100 }, match_stats: { kills: 0, deaths: 0, assists: 0 }, ...extra },
  }
}

describe('CS2 GSI live timeline', () => {
  it('records your kills, a death when you start spectating, round results and the score', () => {
    const t = new Cs2GsiTracker()
    t.start(1_000)
    t.ingest(p(0), 2_000)
    t.ingest(p(0, { match_stats: { kills: 1, deaths: 0, assists: 0 } }), 11_000)
    // died: GSI now describes the teammate we spectate
    t.ingest(p(0, { steamid: '76561190000000002' }), 21_000)
    t.ingest(p(1, { match_stats: { kills: 1, deaths: 1, assists: 0 } }, 'freezetime', { round_wins: { 1: 't_win_elimination' }, team_t: { score: 1 } }), 40_000)
    const s = t.summary()!
    expect(s.events).toEqual([
      { type: 'kill', round: 0, videoOffsetMs: 10_000 },
      { type: 'death', round: 0, videoOffsetMs: 20_000 },
    ])
    expect(s.rounds).toEqual([{ roundNumber: 0, won: false, reason: 't_win_elimination' }])
    expect(s.stats).toEqual({ kills: 1, deaths: 1, assists: 0 })
    expect([s.allyScore, s.enemyScore]).toEqual([0, 1])
    expect(cs2LiveKillsForVod(s)[0]).toMatchObject({ killerName: 'You', videoOffsetMs: 10_000, round: 0 })
    expect(cs2LiveDeathsForVod(s)).toHaveLength(1)
    expect(cs2LiveRoundSummariesForVod(s)[0].winningTeam).toBe('ENEMY')
  })

  it('ignores warmup and payloads before a capture starts', () => {
    const t = new Cs2GsiTracker()
    t.ingest(p(0, { match_stats: { kills: 3, deaths: 0, assists: 0 } }), 1)
    t.start(0)
    t.ingest(p(0, {}, 'live', { phase: 'warmup' }), 5)
    expect(t.summary()).toBeNull()
  })

  it('feeds the VOD event list but never counts as rich demo data (Analyse stays locked)', () => {
    const t = new Cs2GsiTracker()
    t.start(0)
    t.ingest(p(0), 1)
    t.ingest(p(0, { match_stats: { kills: 2, deaths: 0, assists: 0 } }), 5_000)
    const tl = emptyMatchData('cs2', 0)
    tl.cs2Live = t.summary()
    expect(hasRichMatchData(tl)).toBe(false)
    expect(timelineKillsForVod(tl)).toHaveLength(2)
    expect(timelineDeathsForVod(tl)).toHaveLength(0)
  })
})
