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
  remaining?: number | null
  archived_remaining?: number | null
  retention_days?: number | null
  plus_retention?: PlusRetention | null
}

export interface ArchiveQuota {
  count: number
  /** null = no cap (Plus / cloud storage on / admin). */
  limit: number | null
  remaining: number | null
}

/**
 * One reader for cloud archive quota. The API sends archived_count /
 * archived_limit / archived_remaining; older builds sent count / limit / remaining.
 */
export function readArchiveQuota(stats: ArchiveRetentionStats | null | undefined): ArchiveQuota {
  if (!stats) return { count: 0, limit: null, remaining: null }
  const count = stats.archived_count ?? stats.count ?? 0
  const limit = stats.archived_limit !== undefined ? stats.archived_limit : (stats.limit ?? null)
  let remaining = stats.archived_remaining !== undefined ? stats.archived_remaining : (stats.remaining ?? null)
  if (remaining == null && limit != null) remaining = Math.max(0, limit - count)
  return { count, limit: limit ?? null, remaining: remaining ?? null }
}

export interface NormalizedArchiveStats extends ArchiveQuota {
  archived_count: number
  archived_limit: number | null
  archived_remaining: number | null
  retention_days: number | null
  storage_bytes_used: number
  plus_retention?: PlusRetention
}

/** Raw API archive_stats → both key names + plus_retention (main-process profile mapper). */
export function normalizeArchiveStats(
  raw: (ArchiveRetentionStats & { storage_bytes_used?: number | null }) | null | undefined,
): NormalizedArchiveStats | undefined {
  if (!raw || (raw.archived_count == null && raw.count == null)) return undefined
  const q = readArchiveQuota(raw)
  return {
    ...q,
    archived_count: q.count,
    archived_limit: q.limit,
    archived_remaining: q.remaining,
    retention_days: raw.retention_days ?? null,
    storage_bytes_used: raw.storage_bytes_used ?? 0,
    ...(raw.plus_retention ? { plus_retention: raw.plus_retention } : {}),
  }
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
  const { limit: max, count } = readArchiveQuota(stats)
  if (days == null || max == null) return null
  if (opts.requireSaved && count < 1) return null
  const free = `Free keeps cloud VODs for ${days} days (${max} max).`
  const plus = plusRetentionPhrase(stats.plus_retention)
  return plus ? `${free} ${plus}` : free
}
