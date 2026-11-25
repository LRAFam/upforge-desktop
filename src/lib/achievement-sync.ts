import type { AchievementList } from './account-achievements'

export const ACHIEVEMENT_IDS = [
  'first-drill', 'ten-drills', 'fifty-drills', 'hundred-drills', 'streak-3', 'streak-7', 'streak-30',
  'score-90', 'score-100', 'accuracy-90', 'reaction-200', 'first-analysis', 'focus-streak-3', 'focus-streak-5',
] as const
const known = new Set<string>(ACHIEVEMENT_IDS)

/** Account API accepts these IDs and ISO dates; retain the earliest instant, not lexical timezone order. */
export function mergeAchievementLists(...lists: AchievementList[]): AchievementList {
  const merged: AchievementList = {}
  for (const list of lists) for (const [id, at] of Object.entries(list)) {
    const time = Date.parse(at)
    if (!known.has(id) || !Number.isFinite(time)) continue
    if (!merged[id] || time < Date.parse(merged[id])) merged[id] = new Date(time).toISOString()
  }
  return merged
}

/** Exact GET/POST /api/achievements response contract. Bad responses must not certify a sync. */
export function achievementResponse(data: unknown): AchievementList {
  if (!data || typeof data !== 'object' || !Array.isArray((data as { achievements?: unknown }).achievements)) {
    throw new Error('Invalid achievement response')
  }
  const list: AchievementList = {}
  for (const row of (data as { achievements: unknown[] }).achievements) {
    if (!row || typeof row !== 'object') throw new Error('Invalid achievement row')
    const { id, unlocked_at: at } = row as { id?: unknown; unlocked_at?: unknown }
    if (typeof id !== 'string' || typeof at !== 'string' || !Number.isFinite(Date.parse(at))) throw new Error('Invalid achievement row')
    if (known.has(id)) Object.assign(list, mergeAchievementLists(list, { [id]: at }))
  }
  return list
}
