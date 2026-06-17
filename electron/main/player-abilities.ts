/**
 * Parse per-round ability state from Riot MatchDetails roundResults.playerStats.
 */
import type { AbilityState, PlayerAbilities } from './riot-types'

function abilitySlot(
  raw: Record<string, unknown> | null | undefined,
  slot: 'grenade' | 'ability1' | 'ability2' | 'ultimate',
): AbilityState | null {
  if (!raw) return null
  const displayName = (raw.displayName as string) ?? (raw.name as string) ?? slot
  const charges = (raw.charges as number) ?? (raw.abilityCharges as number) ?? null
  const currentPoints = (raw.currentPoints as number) ?? (raw.ultPoints as number) ?? null
  const maxPoints = (raw.maxPoints as number) ?? (raw.ultMax as number) ?? null
  if (charges == null && currentPoints == null && maxPoints == null && !raw.displayName && !raw.name) {
    return null
  }
  return {
    displayName,
    charges: charges ?? null,
    currentPoints: currentPoints ?? null,
    maxPoints: maxPoints ?? null,
  }
}

/** Best-effort parse — Riot field names vary by patch. */
export function parsePlayerAbilitiesFromRoundStats(
  prs: Record<string, unknown> | undefined,
): PlayerAbilities | null {
  if (!prs) return null

  const root = (prs.ability as Record<string, unknown> | undefined)
    ?? (prs.abilityInfo as Record<string, unknown> | undefined)
    ?? (prs.abilities as Record<string, unknown> | undefined)

  if (!root) return null

  const grenade = abilitySlot(
    (root.grenade as Record<string, unknown>) ?? (root.Grenade as Record<string, unknown>),
    'grenade',
  )
  const ability1 = abilitySlot(
    (root.ability1 as Record<string, unknown>) ?? (root.Ability1 as Record<string, unknown>),
    'ability1',
  )
  const ability2 = abilitySlot(
    (root.ability2 as Record<string, unknown>) ?? (root.Ability2 as Record<string, unknown>),
    'ability2',
  )
  const ultimate = abilitySlot(
    (root.ultimate as Record<string, unknown>) ?? (root.Ultimate as Record<string, unknown>),
    'ultimate',
  )

  if (!grenade && !ability1 && !ability2 && !ultimate) return null

  return {
    grenade,
    ability1,
    ability2,
    signature: ability2,
    ultimate,
  }
}
