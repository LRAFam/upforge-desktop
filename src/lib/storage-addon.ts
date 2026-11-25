export interface StorageAddonSnapshot {
  usage: { active: boolean; capacity_bytes: number; used_bytes: number; reserved_bytes: number; remaining_bytes: number; paid_until: string | null; grace_until: string | null; cancel_at_period_end: boolean; status: string }
  packs: { gb: number; cents: number; available: boolean }[]
  grace_days: number
}
export type StorageAddonRequest = { action: 'show' | 'sync' | 'payment' } | { action: 'checkout' | 'change'; gb: number } | { action: 'cancel'; cancel: boolean } | { action: 'keep' | 'remove'; kind: 'clip' | 'recording'; id: string }
export function validStorageRequest(value: StorageAddonRequest): boolean {
  if (!value || typeof value !== 'object') return false
  if (value.action === 'show' || value.action === 'sync' || value.action === 'payment') return true
  if (value.action === 'checkout' || value.action === 'change') return [50,100,250,500].includes(value.gb)
  if (value.action === 'cancel') return typeof value.cancel === 'boolean'
  return (value.action === 'keep' || value.action === 'remove') && typeof value.id === 'string' && (value.kind === 'clip' ? /^[1-9]\d*$/.test(value.id) : value.kind === 'recording' && /^[0-9a-f-]{36}$/i.test(value.id))
}
export function validStorageSnapshot(value: unknown): value is StorageAddonSnapshot {
  if (!value || typeof value !== 'object') return false
  const s = value as StorageAddonSnapshot, u = s.usage
  const integer = (n: unknown) => Number.isSafeInteger(n) && Number(n) >= 0
  const date = (d: unknown) => d === null || typeof d === 'string' && Number.isFinite(Date.parse(d))
  return !!u && typeof u.active === 'boolean' && typeof u.cancel_at_period_end === 'boolean' && typeof u.status === 'string'
    && [u.capacity_bytes,u.used_bytes,u.reserved_bytes,u.remaining_bytes,s.grace_days].every(integer)
    && date(u.paid_until) && date(u.grace_until) && Array.isArray(s.packs) && s.packs.length > 0
    && s.packs.every(p => [50,100,250,500].includes(p.gb) && integer(p.cents) && typeof p.available === 'boolean')
}

export function storagePaymentConfirmed(snapshot: StorageAddonSnapshot, targetGb: number): boolean {
  return snapshot.usage.active && snapshot.usage.status === 'active' && snapshot.usage.capacity_bytes === targetGb * 1e9
}

/**
 * What happens when a storage pack ends. Once full-video retention has started, packs follow the
 * same rule as plans: the retention summary's `grace_days`, then Free keep time. Before that the
 * pack's own download window applies. Numbers always come from the API; a missing one is left out
 * of the sentence rather than guessed.
 */
export function packEndLine(opts: {
  retentionStarted: boolean
  packGraceDays: number | null | undefined
  retentionGraceDays?: number | null
  freeKeepDays?: number | null
}): string {
  if (opts.retentionStarted) {
    const grace = opts.retentionGraceDays ?? opts.packGraceDays
    const ends = grace ? `If it ends, your full videos stay for ${grace} days, then Free rules apply` : 'If it ends, Free rules apply after a grace period'
    const free = opts.freeKeepDays ? ` (each video kept ${opts.freeKeepDays} days)` : ''
    return `A storage pack keeps every full video in the cloud while you're subscribed. ${ends}${free}. Each affected video shows its removal date. Clips, notes and stats are never removed.`
  }
  const window = opts.packGraceDays ? `you have ${opts.packGraceDays} days to download them before removal` : 'you have time to download them before removal'
  return `New uploads use paid space when your plan allowance is full. Use Keep in paid storage for footage you want to retain longer. Files in paid storage stay while you keep paying. After paid access ends, ${window}.`
}

/**
 * "Your cloud space: 10 GB → 60 GB" for the selected pack. Uses the plan's included space plus the
 * pack (packs replace each other, they don't stack). Empty when the included space is unknown.
 */
export function packGain(includedBytes: number | null | undefined, currentPackBytes: number, selectedGb: number, format: (n: number) => string): string {
  if (typeof includedBytes !== 'number') return ''
  const now = includedBytes + currentPackBytes
  const next = includedBytes + selectedGb * 1e9
  if (now === next) return `Your cloud space: ${format(now)} (this is your current pack)`
  return `Your cloud space: ${format(now)} → ${format(next)}`
}

/** No storage upsell for an account with no storage cap; an existing pack can still be managed. */
export function hideStorageOffer(noCap: boolean, loaded: boolean, hasSubscription: boolean): boolean {
  return noCap && (!loaded || !hasSubscription)
}
