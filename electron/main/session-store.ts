/**
 * Desktop session bookkeeping that is safe to keep on disk (no tokens, no email):
 *  - a per-install id, so each desktop install gets its own API token slot ("desktop-<id>")
 *  - the last signed-in user (non-secret fields), so a slow or offline launch still opens signed in
 *  - when the current token was issued (for "token age" in sign-out telemetry)
 *  - a small queue of sign-out events, sent as `desktop_signed_out` after the next sign-in
 *
 * Every function takes the userData directory so it can be tested without Electron.
 */
import { randomUUID } from 'crypto'
import { readFileSync, writeFileSync, unlinkSync } from 'fs'
import { join } from 'path'

const INSTALL_ID_FILE = 'install-id'
const CACHED_USER_FILE = 'auth-user.json'
const META_FILE = 'auth-meta.json'
const SIGNOUT_FILE = 'signout-events.json'

/** Sign-out events kept while waiting for the next sign-in. */
export const MAX_QUEUED_SIGNOUTS = 20

export type SignOutReason =
  | 'http_401'
  | 'user_403'
  | 'user_logout'
  | 'no_token_file'
  | 'decrypt_failed'

export interface SignOutEvent {
  reason: SignOutReason
  at: string
  endpoint?: string
  status?: number
  code?: string
  tokenAgeDays?: number | null
  appVersion?: string
  platform?: string
}

function readText(dir: string, file: string): string | null {
  try { return readFileSync(join(dir, file), 'utf8') } catch { return null }
}

function writeText(dir: string, file: string, text: string): boolean {
  try { writeFileSync(join(dir, file), text, 'utf8'); return true } catch { return false }
}

function remove(dir: string, file: string): void {
  try { unlinkSync(join(dir, file)) } catch { /* already gone */ }
}

// ── Install id / device name ─────────────────────────────────────────────────

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Stable id for this install; created on first use. Falls back to an in-memory id if the disk is unwritable. */
export function readInstallId(dir: string, makeId: () => string = randomUUID): string {
  const existing = readText(dir, INSTALL_ID_FILE)?.trim()
  if (existing && UUID_RE.test(existing)) return existing.toLowerCase()
  const id = makeId().toLowerCase()
  writeText(dir, INSTALL_ID_FILE, id)
  return id
}

/** Token slot name sent at login. The API gives each "desktop-<id>" its own token. */
export function desktopDeviceName(installId: string): string {
  return UUID_RE.test(installId) ? `desktop-${installId.toLowerCase()}` : 'desktop'
}

// ── Cached user (non-secret fields only) ────────────────────────────────────

/** Fields kept on disk. No email, no PUUIDs, nothing that authenticates. */
const CACHED_USER_FIELDS = [
  'id', 'name', 'tier', 'is_admin',
  'riot_name', 'riot_tag', 'riot_region', 'riot_verified', 'riot_accounts', 'max_valorant_accounts',
  'lol_riot_name', 'lol_riot_tag', 'lol_platform', 'lol_region',
  'primary_game', 'games', 'deadlock_account_id', 'cs2_tier', 'onboarding', 'stripe_subscription_status',
] as const

const CACHED_RIOT_ACCOUNT_FIELDS = ['id', 'riot_name', 'riot_tag', 'riot_region', 'is_active'] as const

export function pickCachedUserFields<T extends object>(user: T): Partial<T> {
  const out: Record<string, unknown> = {}
  for (const key of CACHED_USER_FIELDS) {
    if (key in user) out[key] = (user as Record<string, unknown>)[key]
  }
  // Linked Riot accounts: keep only what the UI shows (no PUUIDs or other raw API fields).
  if (Array.isArray(out.riot_accounts)) {
    out.riot_accounts = (out.riot_accounts as Array<Record<string, unknown>>).map((acc) => {
      const slim: Record<string, unknown> = {}
      for (const k of CACHED_RIOT_ACCOUNT_FIELDS) if (acc && k in acc) slim[k] = acc[k]
      return slim
    })
  }
  return out as Partial<T>
}

export function saveCachedUser(dir: string, user: { id?: unknown }): void {
  if (typeof user?.id !== 'number') return
  writeText(dir, CACHED_USER_FILE, JSON.stringify({ savedAt: new Date().toISOString(), user: pickCachedUserFields(user) }))
}

/** The last signed-in user, or null. The email is blank because it is never stored. */
export function loadCachedUser<T>(dir: string): T | null {
  const raw = readText(dir, CACHED_USER_FILE)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as { user?: { id?: unknown } }
    const user = parsed?.user
    if (!user || typeof user !== 'object' || typeof user.id !== 'number') return null
    return { email: '', ...user } as T
  } catch {
    return null
  }
}

export function clearCachedUser(dir: string): void {
  remove(dir, CACHED_USER_FILE)
}

// ── Token issue time ─────────────────────────────────────────────────────────

export function markTokenIssued(dir: string, now = Date.now()): void {
  writeText(dir, META_FILE, JSON.stringify({ issuedAt: now }))
}

export function tokenAgeDays(dir: string, now = Date.now()): number | null {
  const raw = readText(dir, META_FILE)
  if (!raw) return null
  try {
    const issuedAt = (JSON.parse(raw) as { issuedAt?: unknown }).issuedAt
    if (typeof issuedAt !== 'number' || !Number.isFinite(issuedAt) || issuedAt > now) return null
    return Math.floor((now - issuedAt) / 86_400_000)
  } catch {
    return null
  }
}

export function clearTokenMeta(dir: string): void {
  remove(dir, META_FILE)
}

// ── Sign-out event queue ─────────────────────────────────────────────────────

export function readSignOutEvents(dir: string): SignOutEvent[] {
  const raw = readText(dir, SIGNOUT_FILE)
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter(e => e && typeof e.reason === 'string').slice(-MAX_QUEUED_SIGNOUTS) : []
  } catch {
    return []
  }
}

/** Queue one sign-out (newest kept, capped). Never contains tokens, headers or email. */
export function queueSignOutEvent(dir: string, event: SignOutEvent): void {
  const next = [...readSignOutEvents(dir), event].slice(-MAX_QUEUED_SIGNOUTS)
  writeText(dir, SIGNOUT_FILE, JSON.stringify(next))
}

/** Take every queued event (the queue is emptied). */
export function takeSignOutEvents(dir: string): SignOutEvent[] {
  const events = readSignOutEvents(dir)
  if (events.length) remove(dir, SIGNOUT_FILE)
  return events
}
