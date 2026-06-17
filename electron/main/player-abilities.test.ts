import { describe, expect, it } from 'vitest'
import { parsePlayerAbilitiesFromRoundStats } from './player-abilities'

describe('parsePlayerAbilitiesFromRoundStats', () => {
  it('parses ability slots when Riot provides abilityInfo', () => {
    const parsed = parsePlayerAbilitiesFromRoundStats({
      abilityInfo: {
        grenade: { displayName: 'Poison Cloud', charges: 1 },
        ability1: { displayName: 'Toxic Screen', charges: 0 },
        ability2: { displayName: 'Toxic Orb', charges: 2 },
        ultimate: { displayName: 'Viper\'s Pit', currentPoints: 6, maxPoints: 8 },
      },
    })

    expect(parsed?.grenade?.displayName).toBe('Poison Cloud')
    expect(parsed?.ultimate?.currentPoints).toBe(6)
  })
})
