import {
  type AbilitySlotKey,
  abilityNameForAgentSlot,
  getFandomAbilityImageUrl,
  isKnownAbilityName,
  isWeaponName,
  resolveAbilityDisplayName,
} from './valorant-ability-images'
import { getAbilityIcon, normalizeAbilitySlot } from './valorant'

export type { AbilitySlotKey }
export { normalizeAbilitySlot, getAbilityIcon as getAbilityIconUrl }

const WEAPON_UUID_TO_NAME: Record<string, string> = {
  '29a0cfab-485b-f5d5-779a-b59f85e204a8': 'Classic',
  '42da8ccc-40d5-affc-beec-15aa47b42eda': 'Shorty',
  '44d4e95c-4157-0037-81b2-17841bf2e8e3': 'Frenzy',
  '1baa85b4-4c70-1284-64bb-6481dfc3bb4e': 'Ghost',
  'e336c6b8-418d-9340-d77f-7a9e4cfe0702': 'Sheriff',
  'f7e1b454-4ad4-1063-ec0a-159e56b58941': 'Stinger',
  '462080d1-4035-2937-7c09-27aa2a5c27a7': 'Spectre',
  '910be174-449b-c412-ab22-d0873436b21b': 'Bucky',
  'ec845bf4-4f79-ddda-a3da-0db3774b2794': 'Judge',
  'ae3de142-4d85-2547-dd26-4e90bed35cf7': 'Bulldog',
  '4ade7faa-4cf1-8376-95ef-39884480959b': 'Guardian',
  'ee8e8d15-496b-07ac-e5f6-8fae5d4c7b1a': 'Phantom',
  '9c82e19d-4575-0200-1a81-3eacf00cf872': 'Vandal',
  'c4883e50-4494-202c-3ec3-6b8a9284f00b': 'Marshal',
  '5f0aaf7a-4289-3998-d5ff-eb9a5cf7ef5c': 'Outlaw',
  'a03b24d3-4319-996d-0f8c-94bbfba1dfc7': 'Operator',
  '55d8a0f4-4274-ca67-fe2c-06ab45efdf58': 'Ares',
  '63e6c2b6-4a8e-869c-3d4c-e38355226584': 'Odin',
  '2f59173c-4bed-b6c3-2191-dea9b58be9c7': 'Melee',
}

export function parseAbilitySlotFromDamageItem(
  damageItem: string | null | undefined
): AbilitySlotKey | null {
  return normalizeAbilitySlot(damageItem)
}

export function resolveFinishingDamage(
  damageType: string | null | undefined,
  damageItem: string | null | undefined
): { weapon: string | null; abilitySlot: AbilitySlotKey | null } {
  if (!damageType) return { weapon: null, abilitySlot: null }
  if (damageType === 'Weapon' && damageItem) {
    return {
      weapon: WEAPON_UUID_TO_NAME[damageItem.toLowerCase()] ?? null,
      abilitySlot: null,
    }
  }
  if (damageType === 'Bomb') return { weapon: 'Spike', abilitySlot: null }
  if (damageType === 'Fall') return { weapon: 'Fall', abilitySlot: null }
  if (damageType === 'Melee') return { weapon: 'Melee', abilitySlot: null }

  const slot = parseAbilitySlotFromDamageItem(damageItem)
  const isUltimate = damageType === 'Ultimate' || damageItem?.toLowerCase() === 'ultimate'

  if (damageType === 'Ability' || damageType === 'Ultimate' || isUltimate) {
    return {
      weapon: isUltimate ? 'Ultimate' : 'Ability',
      abilitySlot: slot ?? (isUltimate ? 'ultimate' : 'ability2'),
    }
  }

  return { weapon: null, abilitySlot: null }
}

export type KillSourceFields = {
  weapon?: string | null
  abilitySlot?: string | null
  abilityName?: string | null
  killerAgent?: string | null
  finishingDamage?: { damageType?: string; damageItem?: string } | null
}

export type ResolvedKillSource = {
  weapon?: string
  abilitySlot?: AbilitySlotKey
  abilityName?: string
}

export function resolveKillSourceFields(raw: KillSourceFields): ResolvedKillSource {
  if (raw.abilityName) {
    return {
      weapon: raw.weapon ?? undefined,
      abilitySlot: normalizeAbilitySlot(raw.abilitySlot) ?? undefined,
      abilityName: raw.abilityName.replace(/_/g, ' '),
    }
  }

  let weapon = raw.weapon ?? undefined
  let abilitySlot = normalizeAbilitySlot(raw.abilitySlot) ?? undefined

  const fd = raw.finishingDamage
  if (fd?.damageType) {
    const resolved = resolveFinishingDamage(fd.damageType, fd.damageItem)
    if (!weapon && resolved.weapon) weapon = resolved.weapon
    if (!abilitySlot && resolved.abilitySlot) abilitySlot = resolved.abilitySlot
  }

  if (!abilitySlot && weapon) {
    const slotFromWeapon = normalizeAbilitySlot(weapon)
    if (slotFromWeapon) {
      abilitySlot = slotFromWeapon
      if (!['Ability', 'Ultimate'].includes(weapon)) {
        weapon = slotFromWeapon === 'ultimate' ? 'Ultimate' : 'Ability'
      }
    }
  }

  // Henrik / legacy: weapon field is the ability display name (e.g. "Headhunter")
  if (weapon && !isWeaponName(weapon) && isKnownAbilityName(weapon)) {
    return { weapon, abilitySlot, abilityName: weapon.replace(/_/g, ' ') }
  }

  const abilityName = resolveAbilityDisplayName(raw.killerAgent ?? null, weapon, abilitySlot)
  if (abilityName && abilityName !== 'Ability' && abilityName !== 'Ultimate') {
    return { weapon, abilitySlot, abilityName }
  }

  if (abilitySlot || weapon === 'Ability' || weapon === 'Ultimate') {
    return { weapon, abilitySlot, abilityName: abilityName ?? undefined }
  }

  return { weapon, abilitySlot }
}

export function isAbilityKill(event: KillSourceFields): boolean {
  const resolved = resolveKillSourceFields(event)
  if (resolved.abilityName && resolved.abilityName !== 'Ability') return true
  if (resolved.abilitySlot) return true
  return resolved.weapon === 'Ability' || resolved.weapon === 'Ultimate'
}

export function killSourceLabel(event: KillSourceFields): string | null {
  const resolved = resolveKillSourceFields(event)
  if (isAbilityKill(event)) {
    if (resolved.abilityName) return resolved.abilityName
    if (resolved.weapon === 'Ultimate' || resolved.abilitySlot === 'ultimate') return 'Ultimate'
    return 'Ability'
  }
  if (!resolved.weapon || ['Ability', 'Ultimate', 'Fall'].includes(resolved.weapon)) return null
  return resolved.weapon.replace(/_/g, ' ')
}

export function killSourceImage(
  event: KillSourceFields,
  getWeaponImage: (weapon: string | null | undefined) => string
): string {
  const resolved = resolveKillSourceFields(event)

  if (isAbilityKill(event)) {
    if (resolved.abilityName) {
      const fandom = getFandomAbilityImageUrl(resolved.abilityName)
      if (fandom) return fandom
    }

    const slot = resolved.abilitySlot ?? (resolved.weapon === 'Ultimate' ? 'ultimate' : 'ability2')
    const fromSlotName = abilityNameForAgentSlot(event.killerAgent ?? null, slot)
    if (fromSlotName) {
      const fandom = getFandomAbilityImageUrl(fromSlotName)
      if (fandom) return fandom
    }

    const apiIcon = getAbilityIcon(event.killerAgent ?? null, slot)
    if (apiIcon) return apiIcon
  }

  if (!resolved.weapon || ['Ability', 'Ultimate', 'Spike', 'Fall'].includes(resolved.weapon)) {
    return ''
  }
  return getWeaponImage(resolved.weapon)
}

export function killSourceIsAbilityIcon(event: KillSourceFields): boolean {
  return isAbilityKill(event)
}
