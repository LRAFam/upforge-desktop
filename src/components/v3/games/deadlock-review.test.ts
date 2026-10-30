import { describe, expect, it } from 'vitest'
import { abilityRows, clock, deathRows, fightFacts, itemRows, lobbyLines, midBossRows, soulsCurve, type DeadlockReviewDetail } from './deadlock-review'

const detail: DeadlockReviewDetail = {
  match_stats: {
    economy: {
      souls_timeline: [{ minute: 0, souls: 500 }, { minute: 10, souls: 9800 }, { minute: 20, souls: 18900 }],
      items_bought: [{ name: 'Headshot Booster', cost: 500, time_seconds: 152, change: 'purchased' }, { name: 'Mystic Burst', cost: null, time_seconds: 905, change: 'upgraded' }],
    },
    abilities: [{ ability: 'Fixation', level: 1, time_seconds: 61 }],
    mid_boss: [{ time_seconds: 1240, team: 3 }, { time_seconds: 2100, team: 2 }],
    player_team: 3,
    lobby: {
      checkpoints: [{ minute: 10, player: 9800, team_avg: 10100, enemy_avg: 10600, lobby_avg: 10350, lane_opponents_avg: 11200, player_rank_in_lobby: 9, lobby_size: 12 }],
      final: { player: 32100, enemy_avg: 30000, lobby_avg: 32100, player_rank_in_lobby: 2, lobby_size: 12 },
    },
    kill_events: [{ type: 'kill', time_seconds: 300, attacker_hero: 'Haze', victim_hero: 'Abrams' }, { type: 'death', time_seconds: 640, attacker_hero: 'Abrams', victim_hero: 'Haze' }],
  },
}

describe('deadlock review shaping', () => {
  it('formats the match clock', () => {
    expect(clock(905)).toBe('15:05')
    expect(clock(null)).toBe('--:--')
  })

  it('compares to lane, enemy team and lobby with signed differences', () => {
    const [at10, end] = lobbyLines(detail)
    expect(at10.label).toBe('At 10 min')
    expect(at10.versus[0]).toEqual({ label: 'Lane opponents', value: '11.2k', diff: '−1.4k', tone: 'loss' })
    expect(at10.rank).toBe('9th of 12')
    expect(end.versus.find(v => v.label === 'Enemy team')?.tone).toBe('win')
    expect(end.versus.find(v => v.label === 'Lobby')?.diff).toBe('even')
    expect(end.versus.some(v => v.label === 'Lane opponents')).toBe(false)
    expect(lobbyLines({ match_stats: {} })).toEqual([])
  })

  it('draws the souls curve with the lobby average on the same scale', () => {
    const c = soulsCurve(detail, 200, 100)!
    expect(c.points).toHaveLength(3)
    expect(c.lobby[0].label).toBe('Lobby avg 10.4k at 10 min')
    expect(c.end).toBe('18.9k')
    expect(soulsCurve({ match_stats: { economy: { souls_timeline: [{ minute: 0, souls: 1 }] } } }, 10, 10)).toBeNull()
  })

  it('lists items with costs only when known, abilities, Mid Boss owner and deaths', () => {
    expect(itemRows(detail)).toEqual([
      { at: '2:32', name: 'Headshot Booster', cost: '500 souls', upgrade: false },
      { at: '15:05', name: 'Mystic Burst', cost: '', upgrade: true },
    ])
    expect(abilityRows(detail)).toEqual([{ at: '1:01', name: 'Fixation', level: 1 }])
    expect(midBossRows(detail).map(m => m.who)).toEqual(['Your team', 'Enemy team'])
    expect(midBossRows({ match_stats: { mid_boss: [{ time_seconds: 1, team: 2 }] } })[0].who).toBe('Taken')
    expect(deathRows(detail)).toEqual([{ at: '10:40', by: 'Abrams', context: '', alone: false }])
  })
})

describe('fight context', () => {
  const detail = {
    match_stats: {
      kill_events: [{ type: 'death' as const, time_seconds: 500, attacker_hero: 'Haze' }],
      fight: {
        deaths_total: 2, deaths_alone: 1, deaths_outnumbered: 0, deaths_enemy_side: 1, deaths_traded: 1,
        team_kills: 25, kills_and_assists: 12, kill_participation_pct: 48,
        deaths: [
          { time_seconds: 500, killer: 'Haze', allies_nearby: 0, enemies_nearby: 1, alone: true, side: 'enemy' as const, traded: true },
          { time_seconds: 1200, killer: 'non-hero', allies_nearby: 1, enemies_nearby: 2, alone: false, side: 'middle' as const, traded: false },
        ],
      },
    },
  }

  it('describes each death with who was nearby, map side and trade', () => {
    const rows = deathRows(detail)
    expect(rows[0]).toEqual({ at: '8:20', by: 'Haze', context: '0 teammates · 1 enemy nearby · enemy side · traded', alone: true })
    expect(rows[1].by).toBe('')
    expect(rows[1].context).toBe('1 teammate · 2 enemies nearby · middle of the map')
  })

  it('lists participation and death counts only when measured', () => {
    expect(fightFacts(detail)[0]).toEqual({ label: 'Kill participation', value: '48% (12 of 25)' })
    expect(fightFacts(detail).map(f => f.label)).toContain('Traded within 10 s')
    expect(fightFacts({ match_stats: { kill_events: [] } })).toEqual([])
  })

  it('adds abilities used before each death only when measured', () => {
    const measured = {
      match_stats: {
        fight: {
          ...detail.match_stats.fight, abilities_measured: true, ability_window_seconds: 8, deaths_no_ability: 1,
          deaths: [
            { ...detail.match_stats.fight.deaths[0], abilities_used: ['Sleep Dagger', 'Smoke Bomb'] },
            { ...detail.match_stats.fight.deaths[1], abilities_used: [] },
          ],
        },
      },
    }
    const rows = deathRows(measured)
    expect(rows[0].context).toBe('0 teammates · 1 enemy nearby · enemy side · traded · used Sleep Dagger, Smoke Bomb')
    expect(rows[1].context).toBe('1 teammate · 2 enemies nearby · middle of the map · no ability in the 8 s before')
    expect(fightFacts(measured)).toContainEqual({ label: 'No ability in the 8 s before', value: '1 of 2 deaths' })
    expect(fightFacts(detail).map(f => f.label)).not.toContain('No ability in the 8 s before')
  })

  it('falls back to time and killer without positions', () => {
    const rows = deathRows({ match_stats: { kill_events: detail.match_stats.kill_events } })
    expect(rows).toEqual([{ at: '8:20', by: 'Haze', context: '', alone: false }])
  })
})
