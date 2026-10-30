/**
 * Smart clip titles (board P6): built only from what the clip record measured —
 * trigger, kill count, weapon, round, victim. No callouts or times we don't have.
 * Returns null when there's nothing better than the existing default.
 */
export interface TitleClip {
  trigger: string
  killCount: number | null
  weapon: string | null
  round: number | null
  map: string | null
  game?: string | null
  clipEvents?: Array<{ weapon?: string | null; victim_agent?: string | null; round?: number | null }> | null
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

function sameWeapon(clip: TitleClip): string | null {
  const ws = (clip.clipEvents ?? []).map(e => e.weapon).filter((w): w is string => !!w)
  if (ws.length && ws.every(w => w === ws[0])) return ws[0]
  return clip.weapon || null
}

export function smartClipTitle(clip: TitleClip): string | null {
  const roundBased = clip.game == null || clip.game === 'valorant' || clip.game === 'cs2'
  const round = roundBased && typeof clip.round === 'number' && clip.round >= 0 ? `Round ${clip.round + 1}` : null
  const weapon = sameWeapon(clip)
  const parts: string[] = []
  switch (clip.trigger) {
    case 'ace': parts.push(weapon ? `Ace with the ${cap(weapon)}` : 'Ace'); break
    case 'multikill': {
      if (!clip.killCount || clip.killCount < 2) return null
      parts.push(`${clip.killCount}K${weapon ? ` with the ${cap(weapon)}` : ''}`)
      break
    }
    case 'clutch': parts.push(clip.killCount && clip.killCount > 0 ? `Clutch · ${clip.killCount} ${clip.killCount === 1 ? 'kill' : 'kills'}` : 'Clutch'); break
    case 'kill': {
      const victim = (clip.clipEvents ?? []).length === 1 ? clip.clipEvents![0].victim_agent : null
      if (!victim && !weapon) return null
      parts.push(`Kill${victim ? ` on ${cap(victim)}` : ''}${weapon ? ` with the ${cap(weapon)}` : ''}`)
      break
    }
    default: return null // death/objective/hotkey/manual titles are already specific or user-set
  }
  if (round) parts.push(round)
  return parts.join(' · ')
}
