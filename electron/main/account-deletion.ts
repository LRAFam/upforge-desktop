import type { AxiosInstance } from 'axios'

/**
 * Self-serve account deletion + "download my data", through the API:
 * GET/POST/DELETE /api/account/deletion (POST { password, confirm_email }), GET/POST /api/account/export.
 * The deletion runs on the server after a grace period and can be cancelled until then.
 */
export interface AccountDeletionPending {
  status: string
  scheduled_for: string | null
  can_cancel: boolean
}

export interface AccountDeletionSummary {
  grace_days: number
  counts: Record<'analyses' | 'recordings' | 'clips' | 'replays' | 'training_items', number>
  subscriptions: number
  owns_squad: { name: string; other_members: number } | null
  is_coach: boolean
  kept_records: string[]
  blockers: { code: string; message: string }[]
}

export interface AccountDeletionState {
  pending: AccountDeletionPending | null
  summary: AccountDeletionSummary | null
}

export interface AccountExportState {
  status: 'pending' | 'ready' | 'failed' | 'expired'
  expires_at: string | null
  download_url: string | null
}

export type AccountResult<T> = ({ ok: true } & T) | { ok: false; error: string }

/** Server message for a failed call, else the fallback. */
export function accountError(err: unknown, fallback: string): string {
  const data = (err as { response?: { data?: { error?: unknown; message?: unknown } } } | null)?.response?.data
  const text = typeof data?.error === 'string' ? data.error : typeof data?.message === 'string' ? data.message : ''
  return text || fallback
}

export async function readAccountDeletion(api: AxiosInstance): Promise<AccountDeletionState> {
  try {
    const res = await api.get('/api/account/deletion')
    const data = res.data as Partial<AccountDeletionState> | null
    return { pending: data?.pending ?? null, summary: data?.summary ?? null }
  } catch {
    return { pending: null, summary: null }
  }
}

export async function requestAccountDeletion(
  api: AxiosInstance,
  password: unknown,
  confirmEmail: unknown,
): Promise<AccountResult<{ pending: AccountDeletionPending | null }>> {
  if (typeof password !== 'string' || !password || typeof confirmEmail !== 'string' || !confirmEmail.trim()) {
    return { ok: false, error: 'Enter your password and email.' }
  }
  try {
    const res = await api.post('/api/account/deletion', { password, confirm_email: confirmEmail.trim() })
    return { ok: true, pending: (res.data as { pending?: AccountDeletionPending } | null)?.pending ?? null }
  } catch (err) {
    return { ok: false, error: accountError(err, 'Could not schedule the deletion. Try again.') }
  }
}

export async function cancelAccountDeletion(api: AxiosInstance): Promise<AccountResult<object>> {
  try {
    await api.delete('/api/account/deletion')
    return { ok: true }
  } catch (err) {
    return { ok: false, error: accountError(err, 'Could not cancel. Try again.') }
  }
}

export async function readAccountExport(api: AxiosInstance): Promise<AccountExportState | null> {
  try {
    const res = await api.get('/api/account/export')
    return (res.data as { export?: AccountExportState | null } | null)?.export ?? null
  } catch {
    return null
  }
}

export async function requestAccountExport(api: AxiosInstance): Promise<AccountResult<{ export: AccountExportState | null }>> {
  try {
    const res = await api.post('/api/account/export')
    return { ok: true, export: (res.data as { export?: AccountExportState | null } | null)?.export ?? null }
  } catch (err) {
    return { ok: false, error: accountError(err, 'Could not request your data. Try again.') }
  }
}

/** Only a signed S3 https link is opened outside the app. */
export function isSafeDownloadUrl(url: unknown): url is string {
  if (typeof url !== 'string') return false
  try {
    return new URL(url).protocol === 'https:'
  } catch {
    return false
  }
}
