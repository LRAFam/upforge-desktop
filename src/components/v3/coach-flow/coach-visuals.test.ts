import { describe, expect, it } from 'vitest'
import { focusStepIndex, momentSnapshot, mmss, numbersView, ofN, roundCells, roundReplaySteps, roundTimeline, storyLines } from './coach-visuals'

const ME = 'me'
const players = [
  { puuid: ME, team: 'Red', agent: 'Fade' },
  { puuid: 'a1', team: 'Red', agent: 'Omen' },
  { puuid: 'e1', team: 'Blue', agent: 'Chamber' },
  { puuid: 'e2', team: 'Blue', agent: 'Jett' },
]
const md = {
  puuid: ME,
  gameMode: 'competitive',
  finalStats: { team: 'Red', kills: 20, deaths: 15, assists: 4, adr: 151.6, headshotPct: 31.2 },
  roundSummaries: [
    { roundNumber: 0, winningTeam: 'Blue', playerWasFirstBlood: true, playerLoadoutValue: 800, playerStats: { kills: 0, deaths: 1 } },
    { roundNumber: 1, winningTeam: 'Red', playerGotFirstBlood: true, playerLoadoutValue: 4500, spikePlanted: true, spikeSite: 'B', playerStats: { kills: 2, deaths: 0 } },
  ],
  killEvents: [
    { round: 1, killerPuuid: ME, victimPuuid: 'e1', killerAgent: 'Fade', victimAgent: 'Chamber', weapon: 'Vandal', videoOffsetMs: 100_000, spatial: { norm: { x: 0.4, y: 0.5 }, callout: 'B Main' } },
    { round: 1, killerPuuid: 'e2', victimPuuid: 'a1', killerAgent: 'Jett', victimAgent: 'Omen', videoOffsetMs: 104_000, spatial: { norm: { x: 0.3, y: 0.6 }, callout: 'B Site' } },
  ],
  roundReplay: {
    map: 'Ascent',
    players,
    ownPlayerIndex: 0,
    rounds: [
      { r: 1, endMs: 60_000, frames: [
        { k: 'kill', v: 100_000, rt: 12_000, p: [{ i: 0, x: 0.42, y: 0.52, alive: true }, { i: 1, x: 0.3, y: 0.5, alive: true }, { i: 3, x: 0.6, y: 0.4, alive: true }] },
        { k: 'kill', v: 104_000, rt: 16_000, p: [{ i: 0, x: 0.42, y: 0.52, alive: true }, { i: 3, x: 0.31, y: 0.62, alive: true }] },
        { k: 'plant', v: 120_000, rt: 32_000, p: [{ i: 0, x: 0.4, y: 0.5, alive: true }, { i: 3, x: 0.6, y: 0.4, alive: true }] },
      ] },
    ],
  },
}

describe('roundCells', () => {
  it('builds one 1-based cell per round with opening duels, buys and marks', () => {
    const cells = roundCells(md, [2])
    expect(cells.map(c => [c.round, c.result, c.buy, c.opening, c.planted, c.marked])).toEqual([
      [1, 'lost', 'pistol', 'lost', false, false],
      [2, 'won', 'full', 'won', true, true],
    ])
  })
  it('is empty without round summaries', () => {
    expect(roundCells({})).toEqual([])
  })
})

describe('momentSnapshot', () => {
  it('places everyone at the nearest kill and adds the victim from the kill event', () => {
    const s = momentSnapshot(md, 2, 100_400)!
    expect(s.outcome).toBe('kill')
    expect(s.caption).toBe('You killed Chamber')
    expect(s.callout).toBe('B Main')
    expect(s.roundMs).toBe(12_000)
    expect(s.points.find(p => p.who === 'you')?.role).toBe('killer')
    expect(s.points.find(p => p.role === 'victim')).toMatchObject({ who: 'enemy', x: 0.4, y: 0.5, alive: false })
    expect(s.line?.outcome).toBe('kill')
  })
  it('tells a teammate death apart from yours', () => {
    expect(momentSnapshot(md, 2, 104_000)?.outcome).toBe('teammate')
  })
  it('returns null when nothing was snapshotted near that time or in that round', () => {
    expect(momentSnapshot(md, 2, 200_000)).toBeNull()
    expect(momentSnapshot(md, 1, 100_000)).toBeNull()
    expect(momentSnapshot({ ...md, roundReplay: undefined }, 2, 100_000)).toBeNull()
  })
})

describe('roundTimeline', () => {
  it('counts players alive after each kill and marks your kill and the plant', () => {
    const t = roundTimeline(md, 2)!
    expect(t.alive).toEqual([{ ms: 0, allies: 5, enemies: 5 }, { ms: 12_000, allies: 5, enemies: 4 }, { ms: 16_000, allies: 4, enemies: 4 }])
    expect(t.marks.map(m => m.kind)).toEqual(['your-kill', 'ally-down', 'plant'])
    expect(t.durationMs).toBe(60_000)
  })
  it('is null for a round without snapshots', () => {
    expect(roundTimeline(md, 1)).toBeNull()
  })
})

describe('numbersView', () => {
  it('uses whole numbers and falls back to the match headshot share when hit regions are missing', () => {
    const n = numbersView(md)!
    expect(n.stats).toEqual([
      { label: 'K / D / A', value: '20 / 15 / 4' },
      { label: 'ADR', value: '152' },
      { label: 'Headshot share', value: '31%' },
    ])
    expect(n.hits).toEqual([])
    expect(n.economy.map(b => [b.label, b.text])).toEqual([['Pistol', '0 of 1'], ['Full buy', '1 of 1']])
    expect(n.openings).toEqual({ won: 1, lost: 1 })
  })
})

describe('text helpers', () => {
  it('formats round time and splits a story into at most three sentences', () => {
    expect(mmss(62_400)).toBe('1:02')
    expect(storyLines('One. Two? Three! Four.')).toEqual(['One.', 'Two?', 'Three!'])
    expect(storyLines('')).toEqual([])
  })
})

describe('ofN', () => {
  it('reads "X of N matches" from a habit line', () => {
    expect(ofN('You died first in 6 of 9 matches.')).toEqual({ x: 6, n: 9 })
    expect(ofN('in 3 of your last 10 matches')).toEqual({ x: 3, n: 10 })
    expect(ofN('no counts here')).toBeNull()
    expect(ofN('7 of 5')).toBeNull()
  })
})


describe('round replay steps', () => {
  const team = [
    { puuid: 'me', team: 'Blue', agent: 'Fade' }, { puuid: 'a1', team: 'Blue', agent: 'Omen' },
    { puuid: 'e1', team: 'Red', agent: 'Chamber' }, { puuid: 'e2', team: 'Red', agent: 'Clove' },
  ]
  const pos = (alive: number[]) => alive.map(i => ({ i, x: 0.1 * (i + 1), y: 0.5 }))
  const md = {
    puuid: 'me',
    finalStats: { team: 'Blue' },
    roundReplay: {
      map: 'Ascent', ownPlayerIndex: 0, players: team,
      rounds: [{ r: 0, frames: [
        { k: 'kill', rt: 18_000, v: 100_000, p: pos([1, 2, 3]), actorIndex: 2, victimIndex: 0 },
        { k: 'kill', rt: 19_000, v: 101_000, p: pos([2, 3]), actorIndex: 3, victimIndex: 1 },
        { k: 'plant', rt: 30_000, v: 112_000, p: pos([2, 3]), spike: { x: 0.4, y: 0.4 } },
      ] }],
    },
    killEvents: [
      { round: 0, killerPuuid: 'e1', victimPuuid: 'me', killerAgent: 'Chamber', victimAgent: 'Fade', videoOffsetMs: 100_000, spatial: { norm: { x: 0.05, y: 0.5 }, callout: 'B Main' } },
      { round: 0, killerPuuid: 'e2', victimPuuid: 'a1', killerAgent: 'Clove', victimAgent: 'Omen', videoOffsetMs: 101_000 },
    ],
  }

  it('builds one step per kill/plant with all players, keeping the dead where they fell', () => {
    const v = roundReplaySteps(md, 1)!
    expect(v.steps.map(s => s.caption)).toEqual(['Chamber killed you', 'Clove killed Omen', 'Spike planted'])
    const last = v.steps[2]
    expect(last.dots.find(d => d.i === 0)).toMatchObject({ alive: false, x: 0.05 })
    expect(last.dots.find(d => d.i === 1)?.alive).toBe(false)
    expect(last.spike).toEqual({ x: 0.4, y: 0.4 })
    expect(v.players[0].who).toBe('you')
    expect(v.steps[0].outcome).toBe('death')
    expect(v.steps[0].callout).toBe('B Main')
  })

  it('opens on your own death over a teammate death a second later', () => {
    const v = roundReplaySteps(md, 1)!
    expect(focusStepIndex(v, 101_000)).toBe(0)
    expect(focusStepIndex(v, 112_000)).toBe(2)
  })

  it('returns null when the round has no snapshots', () => {
    expect(roundReplaySteps({ roundReplay: { players: team, rounds: [] } }, 1)).toBeNull()
  })
})
