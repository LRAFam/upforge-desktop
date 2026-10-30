import { describe, expect, it } from 'vitest'
import { cs2ReportView, deadlockReportView, lolReportView, ordinal } from './match-report-games'

describe('lolReportView', () => {
  const res = {
    match_id: 'EUW1_1',
    account: { is_main: true },
    facts: {
      champion: 'Ahri', role: 'MIDDLE', won: true, duration_sec: 1864, team_kills: 16, enemy_kills: 5,
      kda: { kills: 6, deaths: 3, assists: 2 }, cs: 160, cs_per_min: 5.3, vision_score: 20, damage_share: 0.245,
      challenges: { kill_participation: 0.5, control_wards: 0, solo_kills: 2 },
      lane: { opponent_champion: 'Zed', at: { '10': { cs: 70, opponent_cs: 78 }, '15': { cs: 110, opponent_cs: 118, gold_diff: -600 } } },
      early_deaths: 3,
    },
    focus: { label: 'Deaths per game', progress: { status: 'active' } },
    focus_check: { hit: true },
  }

  it('leads with the biggest measured swing, in whole numbers', () => {
    const v = lolReportView(res)
    expect(v.game).toBe('lol')
    expect(v.result).toBe('win')
    expect(v.score).toBe('16–5')
    expect(v.metaLine).toBe('Ahri · Mid · 31:04')
    expect(v.headline).toBe('You were 600 gold behind Zed at 15:00.')
    expect(v.headlineLabel).toBe('The key number')
    expect(v.facts.find(r => r.label === 'CS at 10:00')?.value).toBe('70 vs Zed 78')
    expect(v.facts.find(r => r.label === 'Share of team damage')?.value).toBe('25%')
    expect(v.positive).toBe('You won 2 solo kills.')
    expect(v.focusCheck).toEqual({ label: 'Deaths per game', hit: true })
  })

  it('turns this match\'s own numbers into at most 3 next steps', () => {
    const steps = lolReportView(res).nextSteps.map(s => s.text)
    expect(steps).toEqual([
      'Aim for 2 or fewer deaths before 14:00 next game (this game: 3).',
      'You were 8 CS behind Zed at 10:00. Next game, put the first 10 minutes into last-hitting.',
      'You placed no control wards. Buy one on your next back.',
    ])
    for (const s of steps) expect(s).not.toMatch(/\d+\.\d/)
  })

  it('marks alt-account matches and never invents missing values', () => {
    const v = lolReportView({ match_id: 'EUW1_2', account: { is_main: false }, facts: { won: false, kda: { kills: 1, deaths: 2, assists: 3 } } })
    expect(v.isAlt).toBe(true)
    expect(v.score).toBeNull()
    expect(v.facts.map(r => r.label)).toEqual(['K / D / A'])
    expect(v.headline).toBe('You finished 1 / 2 / 3.')
    expect(v.nextSteps).toEqual([])
  })
})

describe('deadlockReportView', () => {
  const res = {
    match_id: '55',
    facts: {
      hero: 'Haze', won: true, duration_sec: 1500, kda: { kills: 4, deaths: 3, assists: 6 },
      souls: 30000, souls_rank: 3, lobby_size: 12,
      souls_at: { '10': { souls: 9000, lobby_avg: 10000, lane_opponents_avg: 12000 }, '20': { souls: 21000, lobby_avg: 20500 } },
      orbs_secured: 120, orbs_denied: 9, player_damage: 60000, damage_rank: 1, early_deaths: 2, time_dead_sec: 182,
    },
  }

  it('compares only with the same lobby and uses soul-orb wording', () => {
    const v = deadlockReportView(res)
    expect(v.headline).toBe("At 10:00 you had 3,000 fewer souls than your lane opponents' average.")
    expect(v.facts.find(r => r.label === 'Souls')?.value).toBe('30,000 (3rd of 12)')
    expect(v.facts.find(r => r.label === 'Soul orbs secured')?.value).toBe('120 · 9 denied')
    expect(v.facts.find(r => r.label === 'Time spent dead')?.value).toBe('3m 02s')
    expect(v.positive).toBe('Most hero damage in the lobby (1st of 12).')
    expect(v.nextSteps.map(s => s.text)).toEqual([
      'Aim for 1 or fewer deaths before 10:00 next game (this game: 2).',
      'Stay near your lane’s troopers and secure their soul orbs before trading.',
      'You spent 3m 02s dead. Pick fights you can leave before committing.',
    ])
    expect(JSON.stringify(v)).not.toMatch(/last.?hit/i)
  })
})

describe('cs2ReportView', () => {
  it('needs a parsed demo', () => {
    expect(cs2ReportView({ id: 'rec_1', map: 'de_mirage', match_stats: null })).toBeNull()
  })

  it('shows only measured stats and opening-duel steps', () => {
    const v = cs2ReportView({
      id: 'rec_1', map: 'de_mirage', finalStats: { won: false },
      match_stats: {
        schema_version: 1, rounds: 22, score: '9-13',
        player_stats: { kills: 14, deaths: 17, assists: 3, adr: 71.4, kast_pct: 64, headshot_pct: null, opening_kills: 2, opening_deaths: 6, clutches_won: 1, clutches_attempted: 3 },
        round_stats: { zero_impact_rounds: 2 }, utility_stats: { teammates_flashed: 4 }, economy_stats: {},
      },
    })!
    expect(v.game).toBe('cs2')
    expect(v.result).toBe('loss')
    expect(v.score).toBe('9-13')
    expect(v.headline).toBe('You lost 6 of 8 opening duels.')
    expect(v.facts.some(r => r.label === 'Headshot kills')).toBe(false)
    expect(v.nextSteps.map(s => s.text)).toEqual([
      'You lost 6 of 8 opening duels. Next game, take the first fight with a teammate ready to trade.',
      'You flashed teammates 4 times. Call your flashes before you throw them.',
    ])
    expect(v.positive).toBe('You won 1 clutch.')
  })
})

describe('ordinal', () => {
  it('handles teens', () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22].map(ordinal)).toEqual(['1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd'])
  })
})
