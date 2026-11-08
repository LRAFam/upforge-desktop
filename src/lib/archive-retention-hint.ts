/**
 * Free-plan cloud VOD keep hint. The Plus side comes from the API
 * (`archive_stats.plus_retention`, read from server config), never a
 * hard-coded day count. Older APIs without it get no Plus claim at all.
 */
export interface PlusRetention {
  name?: string | null
  keep_days: number | null
  keeps_while_subscribed: boolean
}

export interface ArchiveRetentionStats {
  count?: number | null
  limit?: number | null
  /** Names the API actually sends today (count/limit are kept for older builds). */
  archived_count?: number | null
  archived_limit?: number | null
  retention_days?: number | null
  plus_retention?: PlusRetention | null
}

export function plusRetentionPhrase(plus: PlusRetention | null | undefined): string | null {
  if (!plus) return null
  const name = plus.name || 'Plus'
  if (plus.keeps_while_subscribed) return `${name} keeps them while you're subscribed.`
  if (typeof plus.keep_days === 'number' && plus.keep_days > 0) return `${name} keeps them ${plus.keep_days} days.`
  return null
}

export function freeArchiveRetentionHint(
  stats: ArchiveRetentionStats | null | undefined,
  opts: { requireSaved?: boolean } = {},
): string | null {
  if (!stats) return null
  const days = stats.retention_days
  const max = stats.limit ?? stats.archived_limit
  const count = stats.count ?? stats.archived_count ?? 0
  if (days == null || max == null) return null
  if (opts.requireSaved && count < 1) return null
  const free = `Free keeps cloud VODs for ${days} days (${max} max).`
  const plus = plusRetentionPhrase(stats.plus_retention)
  return plus ? `${free} ${plus}` : free
}
