import { describe, expect, it, vi } from 'vitest'
import { RiotLocalApi } from './riot-local-api'
import { observedRoundStarts } from './riot-event-time'
import type { MatchData } from './riot-types'

vi.mock('electron', () => ({ app: { isPackaged: false, getAppPath: () => process.cwd() } }))

const me = '30d439c3-44dd-514e-9c38-13d1301ba0b0'
const kill = (round: number, game: number, inRound: number) => ({
  round, timeSinceGameStartMillis: game, timeSinceRoundStartMillis: inRound,
  killer: me, victim: '659c42ea-73f7-5ad0-926e-7f5364b5fe75', assistants: [],
  finishingDamage: { damageType: 'Weapon', damageItem: '' },
})

describe('Valorant kill events keep the round clock', () => {
  // Real bug: kill events dropped timeSinceRoundStartMillis, so round-timer sync found no round
  // starts and every Valorant recording kept the -8 s loading guess (moments a click "late").
  it('copies timeSinceRoundStartMillis so round starts can be observed', () => {
    const matchData = {
      game: 'valorant', matchId: 'm1', map: 'Abyss', gameMode: 'COMPETITIVE', puuid: me,
      killEvents: [], playerKills: [], playerDeaths: [], events: [], firstBloods: [],
      spikePlants: [], spikeDefuses: [], spikeDetonations: [], roundSummaries: [], teamSnapshot: [],
    } as unknown as MatchData
    const details = {
      matchInfo: { matchId: 'm1', mapId: '/Game/Maps/Infinity/Infinity', queueID: 'competitive' },
      players: [{ subject: me, teamId: 'Blue', characterId: '' }],
      kills: [kill(0, 61_684, 21_000), kill(1, 194_868, 24_500)],
      roundResults: [],
    }
    new RiotLocalApi().populateMatchDataFromDetails(matchData, details)
    expect(matchData.killEvents.map(k => k.timeSinceRoundStartMillis)).toEqual([21_000, 24_500])
    const starts = observedRoundStarts(matchData.killEvents as unknown as Array<Record<string, unknown>>)
    expect([...starts]).toEqual([[0, 40_684], [1, 170_368]])
  })
})
