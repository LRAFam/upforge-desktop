/** Paid tiers that unlock Pro desktop features (Creator recording preset, etc.). */
const PRO_TIERS = new Set(['pro', 'elite', 'premium', 'founder', 'admin'])

export function hasProAccess(user: { tier?: string | null; is_admin?: boolean } | null | undefined): boolean {
  if (!user) return false
  if (user.is_admin) return true
  return PRO_TIERS.has((user.tier ?? 'free').toLowerCase())
}
