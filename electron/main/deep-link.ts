/**
 * `upforge://` deep links. Only an explicit allow-list is understood; anything else is ignored.
 *
 * Accepted (coach invite → open Coaches (/rosters) with the coach looked up; joining always asks first):
 *   upforge://roster/join?coach=123
 *   upforge://roster/join?code=123        (alias; roster invites are the coach's public id)
 *   upforge://coaches/123                 (mirrors the web invite path upforge.gg/coaches/123#join-roster)
 *
 * Never navigates to, opens or forwards the raw URL. The action is held in the main process until a
 * signed-in renderer takes it (so a link clicked before sign-in still lands after signing in).
 */

export const DEEP_LINK_SCHEME = 'upforge'
const MAX_URL_LENGTH = 256
const COACH_ID = /^[1-9]\d{0,8}$/
/** A pending link older than this is dropped (the user has moved on). */
export const PENDING_TTL_MS = 30 * 60 * 1000

export type DeepLinkAction = { kind: 'roster-join'; coachId: number }

function coachIdFrom(value: string | null | undefined): number | null {
  if (!value || !COACH_ID.test(value)) return null
  return Number(value)
}

/** Parse one `upforge://` URL into an allowed action, or null. */
export function parseUpforgeDeepLink(raw: unknown): DeepLinkAction | null {
  if (typeof raw !== 'string') return null
  const text = raw.trim()
  if (!text || text.length > MAX_URL_LENGTH) return null
  // None of the allowed shapes need encoding, whitespace or fragments; refuse anything that has them.
  if (/[%\s#\\]/.test(text)) return null
  if (!text.toLowerCase().startsWith(`${DEEP_LINK_SCHEME}://`)) return null
  let url: URL
  try {
    url = new URL(text)
  } catch {
    return null
  }
  if (url.protocol !== `${DEEP_LINK_SCHEME}:`) return null
  if (url.username || url.password || url.port) return null

  const host = url.hostname.toLowerCase()
  // Windows may append a trailing slash; nothing else is tolerated.
  const path = url.pathname.replace(/\/+$/, '')

  if (host === 'roster' && path === '/join') {
    const params = [...url.searchParams.keys()]
    if (params.some(k => k !== 'coach' && k !== 'code')) return null
    const coachId = coachIdFrom(url.searchParams.get('coach') ?? url.searchParams.get('code'))
    return coachId == null ? null : { kind: 'roster-join', coachId }
  }

  if (host === 'coaches') {
    const m = /^\/([^/]+)$/.exec(path)
    if (!m || url.search) return null
    const coachId = coachIdFrom(m[1])
    return coachId == null ? null : { kind: 'roster-join', coachId }
  }

  return null
}

/** The first `upforge://` argument in a process argv (Windows/Linux deliver links this way). */
export function findDeepLinkInArgv(argv: readonly unknown[]): string | null {
  for (const arg of argv) {
    if (typeof arg === 'string' && arg.toLowerCase().startsWith(`${DEEP_LINK_SCHEME}://`)) return arg
  }
  return null
}

/** Holds at most one pending action until a signed-in renderer takes it. */
export class PendingDeepLink {
  private action: DeepLinkAction | null = null
  private receivedAt = 0

  constructor(private readonly now: () => number = Date.now) {}

  /** Store the latest allowed link. Returns the parsed action, or null when the URL isn't allowed. */
  offer(raw: unknown): DeepLinkAction | null {
    const action = parseUpforgeDeepLink(raw)
    if (!action) return null
    this.action = action
    this.receivedAt = this.now()
    return action
  }

  hasPending(): boolean {
    this.expire()
    return this.action != null
  }

  /** Hand the action over once, only to a signed-in session; otherwise keep holding it. */
  take(signedIn: boolean): DeepLinkAction | null {
    this.expire()
    if (!signedIn || !this.action) return null
    const action = this.action
    this.action = null
    return action
  }

  private expire(): void {
    if (this.action && this.now() - this.receivedAt > PENDING_TTL_MS) this.action = null
  }
}
