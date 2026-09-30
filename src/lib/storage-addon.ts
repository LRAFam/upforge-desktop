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
