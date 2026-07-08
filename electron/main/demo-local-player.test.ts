import { describe, expect, it } from 'vitest'
import { inferLocalPlayerFromDemoKills } from './demo-local-player'

describe('inferLocalPlayerFromDemoKills', () => {
  it('picks the player with the most kills', () => {
    const roundKills = [
      { round: 0, attackerUserId: 3, victimUserId: 8, attackerTeam: 2, victimTeam: 3 },
      { round: 0, attackerUserId: 3, victimUserId: 9, attackerTeam: 2, victimTeam: 3 },
      { round: 1, attackerUserId: 5, victimUserId: 3, attackerTeam: 3, victimTeam: 2 },
      { round: 1, attackerUserId: 3, victimUserId: 10, attackerTeam: 2, victimTeam: 3 },
    ]
    const result = inferLocalPlayerFromDemoKills(roundKills, (id) => `Player${id}`)
    expect(result).toEqual({ userId: 3, team: 2, name: 'Player3' })
  })
})
