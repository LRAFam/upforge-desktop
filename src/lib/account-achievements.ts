/**
 * Achievements are kept per account in the settings file: `achievementsByUser[userId]` (id → ISO date).
 * Older builds kept one list for the whole PC in `achievements`; the first account that loads it
 * takes it over and the PC-wide list is cleared, so no other account inherits it.
 */
export type AchievementList = Record<string, string>
export type AchievementSettings = {
  achievements?: AchievementList | null
  achievementsByUser?: Record<string, AchievementList> | null
}

const isList = (v: unknown): v is AchievementList =>
  !!v && typeof v === 'object' && !Array.isArray(v) && Object.values(v).every(d => typeof d === 'string')

/** This account's list, plus whether it just took over the PC-wide list from an older build. */
export function readAccountAchievements(settings: AchievementSettings | null | undefined, userId: number): {
  list: AchievementList
  claimedLegacy: boolean
} {
  const byUser = settings?.achievementsByUser
  const own = byUser && isList(byUser[String(userId)]) ? byUser[String(userId)] : {}
  const legacy = isList(settings?.achievements) ? settings!.achievements! : {}
  const claimedLegacy = Object.keys(legacy).length > 0
  // Keep the earlier date when both lists have the same achievement.
  const list: AchievementList = { ...legacy }
  for (const [id, at] of Object.entries(own)) if (!list[id] || at < list[id]) list[id] = at
  return { list, claimedLegacy }
}

/** The settings partial that saves this account's list and leaves every other account's list alone. */
export function accountAchievementsSave(
  settings: AchievementSettings | null | undefined,
  userId: number,
  list: AchievementList,
): { achievementsByUser: Record<string, AchievementList>; achievements: AchievementList } {
  const byUser = settings?.achievementsByUser && typeof settings.achievementsByUser === 'object' ? settings.achievementsByUser : {}
  return {
    achievementsByUser: { ...byUser, [String(userId)]: { ...list } },
    // The PC-wide list from older builds is never shown to anyone again.
    achievements: {},
  }
}
