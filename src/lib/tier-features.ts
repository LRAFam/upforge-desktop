/** Platform admin — DB flag and/or effective admin tier from the API. */
export function isPlatformAdmin(
  tier: string | null | undefined,
  isAdmin?: boolean | null,
): boolean {
  return !!isAdmin || (tier ?? '').toLowerCase() === 'admin'
}

/** Plus (premium), Pro, founder, and admin can click heatmap events to seek VOD. */
export function canSpatialVodSeek(tier: string | null | undefined): boolean {
  const t = (tier ?? 'free').toLowerCase()
  return t === 'premium' || t === 'pro' || t === 'founder' || t === 'admin'
}

export interface AnalysisQuotaStats {
  total: number
  limit: number | null
}

/** Whether the user can start another analysis (client-side pre-check; API is authoritative). */
export function hasAnalysisQuotaRemaining(
  stats: AnalysisQuotaStats | null | undefined,
  tier?: string | null,
  isAdmin?: boolean | null,
): boolean {
  if (isPlatformAdmin(tier, isAdmin)) return true
  if (!stats || stats.limit == null) return false
  return stats.total < stats.limit
}
