/** Minimal clip fields for ranking / retention priority */
export interface ClipPrioritySource {
  id: string
  trigger: 'manual' | 'kill' | 'ace' | 'multikill' | 'clutch' | 'hotkey'
  favorited: boolean
  overallScore: number | null
  apiClipId?: number | null
  savedAt?: number
}

/** Higher = more important when surfacing top moments */
export function clipRank(clip: ClipPrioritySource): number {
  const scoreBoost = (clip.overallScore ?? 5) * 10
  if (clip.trigger === 'ace') return 90 + scoreBoost
  if (clip.trigger === 'clutch') return 85 + scoreBoost
  if (clip.trigger === 'multikill') return 75 + scoreBoost
  if (clip.favorited) return 70
  return 50 + scoreBoost
}

/** Higher = keep longer when evicting from cap or age prune. */
export function clipRetentionScore(clip: ClipPrioritySource): number {
  if (clip.apiClipId != null) return 1000
  if (clip.favorited) return 500
  if (clip.trigger === 'ace' || clip.trigger === 'hotkey') return 400
  if (clip.trigger === 'clutch') return 350
  if (clip.trigger === 'multikill') return 300
  if (clip.trigger === 'manual') return 250
  // Routine kills — older kills evict first via savedAt tie-break
  const ageMs = clip.savedAt ?? 0
  return 100 + Math.min(99, Math.floor(ageMs / 86_400_000))
}

export function sortClipsByRank<T extends ClipPrioritySource>(clips: T[]): T[] {
  return clips.slice().sort((a, b) => clipRank(b) - clipRank(a))
}

export function topMomentClips<T extends ClipPrioritySource>(clips: T[], limit = 3): T[] {
  const seen = new Set<string>()
  const out: T[] = []
  for (const clip of sortClipsByRank(clips)) {
    if (seen.has(clip.id)) continue
    seen.add(clip.id)
    out.push(clip)
    if (out.length >= limit) break
  }
  return out
}
