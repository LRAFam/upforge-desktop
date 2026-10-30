import { describe, expect, it } from 'vitest'
import { damageLine, lolDeepTabs } from './lol-deep-tabs'

const matchData = {
  game_duration_seconds: 1800,
  participant: { participant_id: 3, vision_score: 30, wards_placed: 9, wards_killed: 1, challenges: { max_cs_lead: 18, turret_plates: 2, solo_kills: 1, control_wards: 3 } },
  roster: [
    { participant_id: 3, champion_name: 'Ahri', team_id: 100 },
    { participant_id: 8, champion_name: 'Syndra', team_id: 200 },
    { participant_id: 7, champion_name: 'Lee Sin', team_id: 200 },
  ],
  lane_metrics: { opponent_champion: 'Syndra', at: { 10: { cs: 78, opponent_cs: 70, gold_diff: 250, xp_diff: -40 } } },
  timeline_events: {
    deaths: [
      { timestamp_sec: 250, killerId: 8, assistingParticipantIds: [7], damage_received: { physical: 900, magic: 100, true: 0, total: 1000, sources: [{ name: 'Syndra', damage: 900 }] } },
      { timestamp_sec: 900, killerId: 0 },
    ],
    objectives: [
      { type: 'ELITE_MONSTER_KILL', timestamp_sec: 600, monsterType: 'DRAGON', monsterSubType: 'FIRE_DRAGON', killerTeamId: 100 },
      { type: 'BUILDING_KILL', timestamp_sec: 840, buildingType: 'TOWER_BUILDING', laneType: 'MID_LANE', teamId: 100 },
    ],
  },
}

describe('lolDeepTabs', () => {
  it('builds lane rows from lane metrics and Riot challenges only', () => {
    const t = lolDeepTabs(matchData)!
    expect(t.lane[0]).toEqual({ k: '10:00', text: 'CS 78 vs 70 (Syndra)', sub: 'Gold +250 · XP -40' })
    expect(t.lane.map(r => r.text)).toContain('2 turret plates taken')
    expect(t.lane.map(r => r.text)).toContain('1 solo kill')
  })

  it('names killers, keeps whole numbers and only says "mostly" at 60%+', () => {
    const t = lolDeepTabs(matchData)!
    expect(t.deaths[0]).toEqual({ k: '4:10', text: 'Killed by Syndra (with Lee Sin)', sub: 'Took 1,000 damage: 90% physical, 10% magic (mostly physical) · From Syndra 900' })
    expect(t.deaths[1].text).toBe('Executed (no champion credited)')
    expect(t.deaths[1].sub).toBeUndefined()
    expect(damageLine({ physical: 500, magic: 500, true: 0, total: 1000 })).toBe('Took 1,000 damage: 50% physical, 50% magic')
  })

  it('says which team took each objective', () => {
    const t = lolDeepTabs(matchData)!
    expect(t.objectives).toEqual([
      { k: '10:00', text: 'Your team took Fire Dragon' },
      { k: '14:00', text: 'Enemy took mid tower' },
    ])
  })

  it('vision rows with singular/plural and per-minute rate', () => {
    const t = lolDeepTabs(matchData)!
    expect(t.vision.map(r => r.text)).toEqual(['30 (1.0 per minute)', '9 wards', '1 enemy ward', '3 control wards placed'])
  })

  it('leaves out what Riot did not send', () => {
    const t = lolDeepTabs({ participant: { participant_id: 1 } })!
    expect(t).toEqual({ lane: [], deaths: [], objectives: [], vision: [] })
    expect(lolDeepTabs(null)).toBeNull()
  })
})
