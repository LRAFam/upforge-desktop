export interface ReviewAccess {
  version: 1
  replay: boolean
  personal_notes: boolean
  next_match_focus: boolean
  comparison: boolean
  save_comparison: boolean
  read_saved_comparisons: boolean
  comparison_access_reason: 'preview' | 'plan' | 'existing_account' | 'upgrade_required'
}
export function validReviewAccess(value: unknown): value is ReviewAccess {
  if (!value || typeof value !== 'object') return false
  const access = value as ReviewAccess
  return access.version === 1
    && ['replay', 'personal_notes', 'next_match_focus', 'comparison', 'save_comparison', 'read_saved_comparisons'].every(key => typeof (access as unknown as Record<string, unknown>)[key] === 'boolean')
    && ['preview', 'plan', 'existing_account', 'upgrade_required'].includes(access.comparison_access_reason)
}
export interface Capacity { used: number; limit: number | null; remaining: number | null }
export interface AccountUsage {
  version: 1; as_of: string
  review_access?: ReviewAccess
  reports: Capacity & { period: 'monthly' | 'lifetime' | 'unlimited'; resets_at: string | null; reset_on_next_use: boolean; purchased: number }
  clips: Capacity
  footage: Capacity & { stored: number; reserved: number; stored_bytes: number | null; retention_days: number | null; next_expiry_at: string | null }
  coach_credits: number
}
export function validAccountUsage(value: unknown): value is AccountUsage {
  if (!value || typeof value !== 'object') return false
  const v = value as AccountUsage
  const count = (x: unknown) => typeof x === 'number' && Number.isSafeInteger(x) && x >= 0
  const date = (x: unknown) => x === null || (typeof x === 'string' && Number.isFinite(Date.parse(x)))
  const capacity = (c: Capacity) => c && count(c.used) && (c.limit === null ? c.remaining === null : count(c.limit) && c.remaining === Math.max(0, c.limit - c.used))
  return (v.review_access === undefined || validReviewAccess(v.review_access)) && v.version === 1 && typeof v.as_of === 'string' && date(v.as_of)
    && !!capacity(v.reports) && !!capacity(v.clips) && !!capacity(v.footage)
    && ['monthly', 'lifetime', 'unlimited'].includes(v.reports.period)
    && date(v.reports.resets_at) && typeof v.reports.reset_on_next_use === 'boolean' && count(v.reports.purchased)
    && count(v.footage.stored) && count(v.footage.reserved) && v.footage.used === v.footage.stored + v.footage.reserved
    && (v.footage.stored_bytes === null || count(v.footage.stored_bytes))
    && (v.footage.retention_days === null || count(v.footage.retention_days)) && date(v.footage.next_expiry_at) && count(v.coach_credits)
}
export function capacityLabel(c: Capacity): string { return c.limit === null ? `${c.used} stored · unlimited` : `${c.used} / ${c.limit} used · ${c.remaining} available` }
