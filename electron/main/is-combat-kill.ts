/**
 * Riot attributes spike detonations to the victim as killer=victim, damageType=Bomb.
 * Those must not count as combat kills (aces, multikills, kill clips).
 *
 * Keep this filter at every playerKills / ace / clip entry point.
 * Spatial UI: bomb deaths use cause='bomb' (amber diamond), never "No trade".
 * Canvas legend stays inside the fixed minimap size (no DOM layout shift).
 */

export interface CombatKillLike {
  weapon?: string | null
  finishingDamage?: { damageType?: string | null } | null
  killerPuuid?: string | null
  victimPuuid?: string | null
  killerName?: string | null
  victimName?: string | null
}

export function isBombKill(ev: CombatKillLike): boolean {
  const damageType = ev.finishingDamage?.damageType
  if (typeof damageType === 'string' && damageType.toLowerCase() === 'bomb') {
    return true
  }
  if (ev.weapon === 'Spike') {
    return true
  }
  return false
}

/** True when this event should count toward player kill stats / aces / clips. */
export function isCombatPlayerKill(ev: CombatKillLike): boolean {
  if (isBombKill(ev)) return false

  const killer = (ev.killerPuuid ?? '').toLowerCase()
  const victim = (ev.victimPuuid ?? '').toLowerCase()
  if (killer && victim && killer === victim) return false

  if (
    ev.killerName
    && ev.victimName
    && ev.killerName === ev.victimName
    && (ev.killerName === 'You' || ev.weapon === 'Fall')
  ) {
    return false
  }

  return true
}
