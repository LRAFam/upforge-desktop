/**
 * LoL map codename → human-readable label.
 * Shared by renderer (dashboard, recordings) and main process (live client).
 *
 * Riot's Live Client reports internal names like "Map11" for Summoner's Rift.
 */

export function resolveLolMapLabel(raw: string | null | undefined): string {
  const value = (raw ?? '').trim()
  if (!value) return "Summoner's Rift"
  const key = value.toLowerCase().replace(/\s+/g, '')
  const map: Record<string, string> = {
    map11: "Summoner's Rift",
    summonersrift: "Summoner's Rift",
    map12: 'Howling Abyss',
    howlingabyss: 'Howling Abyss',
    map21: 'Nexus Blitz',
    nexusblitz: 'Nexus Blitz',
    map22: 'Convergence',
    map30: 'Rings of Ruin',
    ringsofruin: 'Rings of Ruin',
  }
  if (map[key]) return map[key]
  if (/^map\d+$/i.test(value)) return "Summoner's Rift"
  return value
}
