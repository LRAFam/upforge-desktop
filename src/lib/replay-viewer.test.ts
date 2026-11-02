import { describe, expect, it } from 'vitest'
import {
  playerAt, recordingToReplayOffset, roundAt, roundClock, spikeAt, toUv, utilityAt, utilityVisible, yawToUv,
  type CompactReplay, type ReplayRound,
} from './replay-viewer'

const round: ReplayRound = { n: 1, start_ms: 0, buy_end_ms: 45_000, end_ms: 83_000, attacker: 'Red', winner: 'Red',
  result: 'elimination', plant_ms: 64_000, defuse_ms: null, plant_x: 8350, plant_y: 600 }
const c: CompactReplay = {
  schema: 1, match_id: 'm', map: 'Summit', map_url: '/Game/Maps/Plummet/Plummet',
  minimap: { xMultiplier: 7.5e-5, yMultiplier: -7.5e-5, xScalarToAdd: 0.047401, yScalarToAdd: 0.978891 },
  players: [{ puuid: 'a', agent_id: 'x', agent: 'Jett', team: 'Red' }, { puuid: 'b', agent_id: 'y', agent: 'Sage', team: 'Red' }],
  rounds: [round],
  kills: [{ t: 50_000, killer: 'z', victim: 'b', weapon: 'Ghost', headshot: true }, { t: 60_000, killer: 'a', victim: 'z', weapon: null, headshot: false },
    { t: 70_000, killer: 'a', victim: 'y', weapon: null, headshot: false }],
  tracks: { a: [[45_000, 0, 0, 90, 600], [45_125, 100, 0, 180, 600]], b: [[45_000, 50, 50, 0, 0]] },
  utility: [{ t0: 50_000, t1: 60_000, agent: 'Jett', slot: 'Grenade', ability: 'Cloudburst', kind: 'smoke', x: 10, y: 20, track: null },
    { t0: 50_000, t1: 51_000, agent: 'Jett', slot: 'Grenade', ability: 'Cloudburst', kind: 'projectile', x: null, y: null, track: [[50_000, 1, 1], [50_500, 5, 5]] }],
  effects: [],
  spike: [{ round: 1, from_ms: 0, to_ms: 52_000, carrier: 'b' }, { round: 1, from_ms: 52_000, to_ms: 53_000, carrier: null },
    { round: 1, from_ms: 53_000, to_ms: 64_000, carrier: 'a' }],
}

describe('replay viewer helpers', () => {
  it('interpolates positions between samples', () => {
    expect(playerAt(c, 'a', 45_050)).toMatchObject({ x: 40, y: 0, yaw: 90 })
    expect(playerAt(c, 'a', 99_000)).toMatchObject({ x: 100, yaw: 180 })
    expect(playerAt(c, 'nobody', 1)).toBeNull()
  })

  it('projects to the minimap with the crossed axes', () => {
    const p = toUv(c, 8350, 600)
    expect(p.u).toBeCloseTo(600 * 7.5e-5 + 0.047401)
    expect(p.v).toBeCloseTo(8350 * -7.5e-5 + 0.978891)
    expect(yawToUv(c, 90).du).toBeCloseTo(1)
  })

  it('finds the round and shows the round clock, then the spike timer', () => {
    expect(roundAt(c, 50_000)?.n).toBe(1)
    expect(roundAt(c, 200_000)).toBeNull()
    expect(roundClock(round, 50_000)).toEqual({ text: '1:35', spike: false, defused: false })
    expect(roundClock(round, 70_000)).toMatchObject({ text: '0:39', spike: true })
  })

  it('tracks the spike: carried, dropped where the carrier was, planted', () => {
    expect(spikeAt(c, round, 51_000)).toEqual({ state: 'carried', carrier: 'b' })
    expect(spikeAt(c, round, 52_500)).toEqual({ state: 'loose', x: 50, y: 50 })
    expect(spikeAt(c, round, 65_000)).toEqual({ state: 'planted', x: 8350, y: 600 })
  })

  it('moves projectiles along their track and keeps smokes for their lifetime', () => {
    expect(utilityAt(c.utility[1], 50_600)).toEqual({ x: 5, y: 5 })
    expect(utilityAt(c.utility[1], 49_000)).toBeNull()
    expect(utilityVisible(c.utility[0], 59_000)).toBe(true)
    expect(utilityVisible(c.utility[0], 61_000)).toBe(false)
  })

  it('lines the recording up with the replay from shared kills', () => {
    const riot = [{ killerPuuid: 'z', victimPuuid: 'b', videoOffsetMs: 40_000 }, { killerPuuid: 'a', victimPuuid: 'z', videoOffsetMs: 50_500 },
      { killerPuuid: 'a', victimPuuid: 'y', videoOffsetMs: 60_000 }]
    expect(recordingToReplayOffset(riot, c)).toBe(10_000)
    expect(recordingToReplayOffset(riot.slice(0, 2), c)).toBeNull()
  })
})
