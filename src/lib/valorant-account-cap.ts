/** Valorant linked-account caps — mirrors upforge-api TierService / config/tiers.php */

export function maxValorantAccountsForTier(
  tier?: string | null,
  isAdmin?: boolean | null,
): number {
  if (isAdmin) return 5
  const t = (tier ?? 'free').toLowerCase()
  if (t === 'admin' || t === 'founder' || t === 'pro' || t === 'elite') return 5
  if (t === 'premium' || t === 'plus') return 3
  return 1
}

/**
 * Prefer the higher of API-reported max and tier-derived max so older APIs
 * (missing max_valorant_accounts) still unlock Plus/Pro/admin caps.
 */
export function resolveMaxValorantAccounts(opts: {
  apiMax?: number | null
  tier?: string | null
  isAdmin?: boolean | null
  userMax?: number | null
}): number {
  const fromTier = maxValorantAccountsForTier(opts.tier, opts.isAdmin)
  const candidates = [opts.apiMax, opts.userMax, fromTier]
    .map((n) => Number(n))
    .filter((n) => Number.isFinite(n) && n >= 1)
  return candidates.length ? Math.max(...candidates) : 1
}
