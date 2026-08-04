/** Mirrors src/lib/valorant-account-cap.ts (main process cannot import renderer src). */

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
