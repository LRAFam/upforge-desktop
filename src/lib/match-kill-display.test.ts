import { describe, expect, it } from 'vitest'
import { killSourceImage, resolveKillSourceFields } from './match-kill-display'

describe('match-kill-display', () => {
  it('resolves Chamber Tour de Force by ability name', () => {
    const resolved = resolveKillSourceFields({
      weapon: 'Tour de Force',
      killerAgent: 'Chamber',
    })
    expect(resolved.abilityName?.toLowerCase()).toContain('tour')
    const icon = killSourceImage(
      { weapon: 'Tour de Force', killerAgent: 'Chamber' },
      () => '',
    )
    expect(icon).toContain('Tour_De_Force')
  })

  it('uses ultimate slot from finishingDamage when weapon is generic Ability', () => {
    const resolved = resolveKillSourceFields({
      weapon: 'Ability',
      killerAgent: 'Chamber',
      finishingDamage: { damageType: 'Ultimate', damageItem: 'Ultimate' },
    })
    expect(resolved.abilitySlot).toBe('ultimate')
    const icon = killSourceImage(
      {
        weapon: 'Ability',
        killerAgent: 'Chamber',
        abilitySlot: resolved.abilitySlot,
        finishingDamage: { damageType: 'Ultimate', damageItem: 'Ultimate' },
      },
      () => '',
    )
    expect(icon).toContain('Tour_De_Force')
  })

  it('does not default Chamber ability kills to Rendezvous when slot is ultimate', () => {
    const icon = killSourceImage(
      {
        weapon: 'Ultimate',
        killerAgent: 'Chamber',
        abilitySlot: 'ultimate',
      },
      () => '',
    )
    expect(icon).not.toContain('Rendezvous')
    expect(icon).toContain('Tour_De_Force')
  })
})
