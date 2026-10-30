import { describe, expect, it } from 'vitest'
import type { DeadlockProfileStats, LolMatchSummary } from '../../../env.d.ts'
import {
  cs2MapRows, cs2Setup, cs2Stats, deadlockHeroRows, deadlockRank, deadlockRankSeries, deadlockSetup, deadlockStats,
  formatAge, formatCs2Map, formatSize, lolChampionRows, lolSetup, lolStats, lolSummary, rankSentence, stepLine,
  type Cs2Profile,
} from './game-data'

const profile = (over: Partial<Cs2Profile['valve_stats']> = {}, linked = true): Cs2Profile => ({
  identity: { steam_display_name: linked ? 'ace' : null, steam_id: null, linked },
  valve_stats: { matches_tracked: 0, avg_kd: null, premier_rating: null, map_breakdown: [], ...over },
})
const folder = (exists: boolean) => ({ files: [], dir: exists ? 'C:/demos' : null, exists })

describe('cs2Setup', () => {
  it('asks for the Steam name first when nothing is set up', () => {
    const s = cs2Setup(profile({}, false), folder(false))
    expect(s.ready).toBe(false)
    expect(s.action).toBe('cs2_steam_name')
    expect(s.missing).toMatch(/Steam name and the demo folder/)
    expect(s.steps.map(x => x.done)).toEqual([false, false, false])
  })
  it('asks to detect the folder once the name is set', () => {
    const s = cs2Setup(profile(), folder(false))
    expect(s.action).toBe('cs2_detect_folder')
    expect(s.actionLabel).toBe('Detect demo folder')
    expect(s.steps[0].done).toBe(true)
  })
  it('is ready with name and folder, and always carries the demo-unlock note', () => {
    const s = cs2Setup(profile(), folder(true))
    expect(s.ready).toBe(true)
    expect(s.action).toBeNull()
    expect(s.note).toMatch(/demo and the rich match stats/)
  })
  it('treats missing data as not set up', () => {
    expect(cs2Setup(null, null).ready).toBe(false)
  })
})

describe('deadlockSetup / lolSetup', () => {
  it('Deadlock is ready once linked, even without a replay folder', () => {
    expect(deadlockSetup(false, null)).toMatchObject({ ready: false, action: 'deadlock_link', actionLabel: 'Link Steam' })
    const s = deadlockSetup(true, folder(false))
    expect(s.ready).toBe(true)
    expect(s.steps[1].done).toBe(false)
    expect(s.note).toMatch(/replay and the rich match stats/)
  })
  it('League is ready once a Riot ID is linked, with no demo note', () => {
    expect(lolSetup(false)).toMatchObject({ ready: false, action: 'lol_link' })
    expect(lolSetup(true)).toMatchObject({ ready: true, action: null, note: '' })
  })
})

describe('Deadlock rank history', () => {
  it('decodes tier × 10 + subtier', () => {
    expect(deadlockRank(23)).toMatchObject({ name: 'Seeker', sub: 3, label: 'Seeker 3', score: 14 })
    expect(deadlockRank(110)).toMatchObject({ name: 'Eternus', sub: null, label: 'Eternus' })
    expect(deadlockRank(129)).toBeNull()
  })
  it('reverses newest-first history and drops unranked entries', () => {
    const s = deadlockRankSeries([{ rank: 31 }, { rank: null }, { rank: 26 }, { rank: 0 }, { rank: 25 }])
    expect(s.map(p => p.label)).toEqual(['Seeker 5', 'Seeker 6', 'Alchemist 1'])
    // Crossing a tier boundary is one step, not ten.
    expect(s[2].score - s[1].score).toBe(1)
    expect(deadlockRankSeries(undefined)).toEqual([])
  })
  it('writes a sentence only with 2+ points', () => {
    const s = deadlockRankSeries([{ rank: 31 }, { rank: 25 }])
    expect(rankSentence(s)).toBe('Your rank is up from Seeker 5 to Alchemist 1 over your last 2 rank updates.')
    expect(rankSentence(s.slice(0, 1))).toBe('')
    expect(rankSentence(deadlockRankSeries([{ rank: 25 }, { rank: 25 }]))).toMatch(/held at Seeker 5/)
  })
  it('stepLine maps scores into the box, higher score = higher on screen', () => {
    const pts = stepLine([0, 10], 100, 50, 0)
    expect(pts).toEqual([{ x: 0, y: 50 }, { x: 100, y: 0 }])
    expect(stepLine([5], 100, 50)).toEqual([])
    expect(stepLine([3, 3], 100, 50, 0).every(p => p.y === 25)).toBe(true)
  })
})

describe('tables', () => {
  it('CS2 maps: share of tracked matches, sorted, neutral tone', () => {
    const rows = cs2MapRows([{ map: 'de_mirage', matches: 1 }, { map: 'de_inferno', matches: 3 }, { map: 'de_nuke', matches: 0 }])
    expect(rows.map(r => [r.name, r.games, r.pct, r.tone])).toEqual([['Inferno', 3, 75, 'none'], ['Mirage', 1, 25, 'none']])
    expect(cs2MapRows([])).toEqual([])
    expect(formatCs2Map('cs_office')).toBe('Office')
  })
  it('Deadlock heroes: win rate with the meta delta when sent', () => {
    const stats = {
      hero_stats: [
        { hero_id: 1, hero_name: 'Haze', hero_icon: null, hero_color: [], matches_played: 4, win_rate: 62.4 },
        { hero_id: 2, hero_name: 'Abrams', hero_icon: null, hero_color: [], matches_played: 9, win_rate: 44 },
      ],
      meta_insights: [{ hero_id: 2, hero_name: 'Abrams', hero_icon: null, player_win_rate: 44, meta_win_rate: 50, delta_vs_meta: -6, matches_played: 9, signal: 'underperforming' }],
    } as unknown as DeadlockProfileStats
    const rows = deadlockHeroRows(stats)
    expect(rows.map(r => [r.name, r.pct, r.tone, r.extra])).toEqual([['Abrams', 44, 'loss', '-6% vs meta'], ['Haze', 62, 'win', '']])
  })
  it('League champions grouped from recent matches', () => {
    const m = (champion: string, win: boolean, k = 5, d = 2, a = 3) => ({ champion, win, kills: k, deaths: d, assists: a } as LolMatchSummary)
    const rows = lolChampionRows([m('Ahri', true), m('Ahri', false), m('Jinx', true)])
    expect(rows.map(r => [r.name, r.games, r.pct])).toEqual([['Ahri', 2, 50], ['Jinx', 1, 100]])
    expect(lolSummary([m('Ahri', true, 3, 0, 1)])).toMatchObject({ wins: 1, losses: 0, winRate: 100, kda: '4.0' })
    expect(lolSummary([])).toBeNull()
  })
})

describe('hero numbers', () => {
  it('CS2 shows only what was sent', () => {
    expect(cs2Stats(profile(), null)).toEqual([])
    const items = cs2Stats(profile({ matches_tracked: 12, avg_kd: 1.234 }), { connected: true, elo: 1650, level: 7 })
    expect(items.map(i => [i.value, i.caption])).toEqual([['12', 'Matches tracked'], ['1.23', 'Average K/D'], ['1650', 'FACEIT Elo']])
    expect(cs2Stats(profile({ premier_rating: 15400 }), { connected: false, elo: 2000 }).map(i => i.caption)).toEqual(['Premier rating'])
  })
  it('Deadlock and League summaries', () => {
    expect(deadlockStats(null)).toEqual([])
    const d = deadlockStats({ summary: { wins: 6, losses: 4, win_rate: 60, avg_kda: '3.1' } } as DeadlockProfileStats)
    expect(d.map(i => i.value)).toEqual(['6–4', '60%', '3.1'])
    expect(d[1].tone).toBe('win')
    expect(lolStats(null)).toEqual([])
    expect(lolStats({ games: 4, wins: 1, losses: 3, winRate: 25, kda: '2.00' })[1]).toMatchObject({ value: '25%', tone: 'loss' })
  })
})

describe('files', () => {
  it('formats sizes and ages', () => {
    expect(formatSize(512 * 1024)).toBe('512 KB')
    expect(formatSize(5 * 1024 * 1024)).toBe('5.0 MB')
    const now = 10 * 86_400_000
    expect(formatAge(now - 5 * 60_000, now)).toBe('5m ago')
    expect(formatAge(now - 3 * 3_600_000, now)).toBe('3h ago')
    expect(formatAge(now - 2 * 86_400_000, now)).toBe('2d ago')
  })
})
