import { describe, expect, it } from 'vitest'
import { lolEarlyDeaths, lolRankSentence, lolRankSeries, lolTrendSentence, lolTrends, type LolTrendMatch } from './lol-progress'

const m = (i: number, over: Partial<LolTrendMatch> = {}): LolTrendMatch => ({
  match_id: `M${i}`, queue_id: 420, champion: 'Ahri', role: 'MIDDLE', lane: 'MIDDLE', win: i % 2 === 0,
  kills: 5, deaths: 4, assists: 6, game_duration_seconds: 1800, game_creation: i,
  cs_per_min: 6, vision_per_min: 0.8, damage_share: 0.25, ...over,
})

describe('lolTrends', () => {
  it('needs six games before showing any trend', () => {
    expect(lolTrends([1, 2, 3, 4, 5].map(i => m(i)))).toEqual([])
  })

  it('compares the earlier half with the recent half (input newest first)', () => {
    // newest first: the 4 newest have 8 CS/min, the 4 oldest 6.
    const games = [8, 8, 8, 8, 6, 6, 6, 6].map((cs, i) => m(i, { cs_per_min: cs }))
    const cs = lolTrends(games).find(t => t.key === 'cs_per_min')!
    expect(cs.earlier).toBe(6)
    expect(cs.recent).toBe(8)
    expect(cs.direction).toBe('better')
    expect(lolTrendSentence(cs)).toBe('CS per minute: 6.0 → 8.0 across your last 8 games (earlier half vs recent half).')
  })

  it('treats fewer deaths as better and tiny changes as flat', () => {
    const games = [2, 2, 2, 6, 6, 6].map((d, i) => m(i, { deaths: d, vision_per_min: 0.8 + i * 0.001 }))
    const trends = lolTrends(games)
    expect(trends.find(t => t.key === 'deaths')!.direction).toBe('better')
    expect(trends.find(t => t.key === 'vision_per_min')!.direction).toBe('flat')
  })

  it('skips metrics an older API did not send', () => {
    const games = [1, 2, 3, 4, 5, 6].map(i => m(i, { cs_per_min: undefined, damage_share: null }))
    expect(lolTrends(games).map(t => t.key)).toEqual(['vision_per_min', 'deaths'])
  })
})

describe('lolRankSeries', () => {
  const snap = (label: string, value: number) => ({ captured_at: '2026-10-01T00:00:00Z', tier: 'GOLD', division: 'II', league_points: 0, label, value })
  it('needs two snapshots for a sentence', () => {
    expect(lolRankSentence(lolRankSeries({ rank: null, rank_history: [snap('Gold II · 0 LP', 1400)] }))).toBe('')
    expect(lolRankSeries(null)).toEqual([])
  })
  it('describes the direction from first to latest', () => {
    const s = lolRankSeries({ rank: null, rank_history: [snap('Gold II · 0 LP', 1400), snap('Gold I · 20 LP', 1520)] })
    expect(lolRankSentence(s)).toBe('Your rank is up from Gold II · 0 LP to Gold I · 20 LP since UpForge started tracking it.')
  })
})

describe('lolEarlyDeaths', () => {
  const a = (early: number | null | undefined, first: number | null = null) => ({ early_deaths: early, first_death_sec: first })
  it('needs three analysed games with a stored timeline', () => {
    expect(lolEarlyDeaths([a(1), a(2), a(null), a(undefined)])).toBeNull()
  })
  it('averages deaths before 14:00 and gives the typical first-death time', () => {
    const r = lolEarlyDeaths([a(2, 300), a(0, null), a(1, 600), a(3, 240)])!
    expect(r.games).toBe(4)
    expect(r.average).toBe(1.5)
    expect(r.sentence).toBe('You died before 14:00 in 3 of your last 4 coached games, 6 deaths in total. Your first death usually came at 5:00.')
  })
  it('leaves games played on a League alt out of the main account\'s early-game line', () => {
    const alt = { early_deaths: 9, first_death_sec: 60, is_alt: true }
    expect(lolEarlyDeaths([a(1), a(0), alt, alt])).toBeNull()
    expect(lolEarlyDeaths([a(1), a(0), a(0), alt])!.sentence).toBe('You died before 14:00 in 1 of your last 3 coached games, 1 death in total.')
  })
  it('uses the singular for one early death', () => {
    expect(lolEarlyDeaths([a(1), a(0), a(0)])!.sentence).toBe('You died before 14:00 in 1 of your last 3 coached games, 1 death in total.')
  })
  it('says so when there were no early deaths', () => {
    expect(lolEarlyDeaths([a(0), a(0), a(0)])!.sentence).toBe('In your last 3 coached games you never died before 14:00.')
  })
})

describe('lolTrends with Riot challenges', () => {
  it('adds CS at 10:00 and kill participation when Riot sent them, and skips them otherwise', () => {
    const base = { match_id: 'x', queue_id: 420, champion: 'Ahri', role: 'MIDDLE', lane: 'MIDDLE', win: true, kills: 1, deaths: 3, assists: 1, game_duration_seconds: 1800, game_creation: 1 }
    const withC = Array.from({ length: 8 }, (_, i) => ({ ...base, challenges: { cs_at_10: i < 4 ? 70 : 55, kill_participation: i < 4 ? 0.6 : 0.45 } }))
    const keys = lolTrends(withC).map(t => t.key)
    expect(keys).toContain('cs_at_10')
    expect(keys).toContain('kill_participation')
    const cs = lolTrends(withC).find(t => t.key === 'cs_at_10')!
    expect(cs.direction).toBe('better') // newest first input: 70s are the recent games
    expect(cs.format(cs.recent)).toBe('70')
    expect(lolTrends(withC.map(m => ({ ...m, challenges: null }))).map(t => t.key)).not.toContain('cs_at_10')
  })
})

