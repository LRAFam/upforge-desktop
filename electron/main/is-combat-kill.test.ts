import { describe, expect, it } from 'vitest'
import { isBombKill, isCombatPlayerKill } from './is-combat-kill'

describe('isCombatPlayerKill', () => {
  it('counts normal weapon kills', () => {
    expect(
      isCombatPlayerKill({
        weapon: 'Sheriff',
        finishingDamage: { damageType: 'Weapon' },
        killerPuuid: 'a',
        victimPuuid: 'b',
        killerName: 'You',
        victimName: 'Sova',
      }),
    ).toBe(true)
  })

  it('excludes spike / bomb self-kills', () => {
    const bomb = {
      weapon: 'Spike',
      finishingDamage: { damageType: 'Bomb' },
      killerPuuid: 'a',
      victimPuuid: 'a',
      killerName: 'You',
      victimName: 'You',
    }
    expect(isBombKill(bomb)).toBe(true)
    expect(isCombatPlayerKill(bomb)).toBe(false)
  })

  it('excludes bomb even when weapon string missing', () => {
    expect(
      isCombatPlayerKill({
        finishingDamage: { damageType: 'Bomb' },
        killerPuuid: 'a',
        victimPuuid: 'a',
      }),
    ).toBe(false)
  })
})
