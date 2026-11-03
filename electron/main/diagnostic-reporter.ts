/**
 * Low-volume diagnostic reports for `[MainLag]` events (main-loop stalls, renderer reload bursts),
 * so a freeze on a user's PC is visible without asking for main.log.
 *
 * Rate limited per install (state file in userData survives restarts): at most one report per
 * kind per 10 min and a small daily cap. Payloads carry no account data: no user id/email/name,
 * no Riot/Steam IDs, no paths, only the last few redacted activity lines.
 *
 * Keep this file free of electron imports so it stays unit-testable.
 */
import { redactSensitiveString } from './error-redaction'

export const DIAGNOSTIC_MIN_INTERVAL_MS = 10 * 60_000
export const DIAGNOSTIC_DAILY_CAP = 12
/** Only stalls at least this long become reports (main.log still gets every stall ≥ 1 s). */
export const DIAGNOSTIC_STALL_REPORT_MS = 3000
const DAY_MS = 24 * 60 * 60_000
const ACTIVITY_LINES = 5

export type DiagnosticEvent =
  | { kind: 'main_stall'; stallMs: number }
  | { kind: 'call_burst'; label: string; callCount: number; windowS: number }

export interface DiagnosticRateState {
  lastSentByKey: Record<string, number>
  sentAt: number[]
}

export interface DiagnosticContext {
  game: string | null
  recordingCount: number | null
  activity: ReadonlyArray<{ time: number; message: string }>
}

export interface DiagnosticPayload {
  message: string
  component: string
  extra: Record<string, unknown>
}

export interface DiagnosticReporterDeps {
  send: (payload: DiagnosticPayload) => Promise<unknown> | unknown
  context: () => DiagnosticContext
  loadState: () => DiagnosticRateState | null
  saveState: (state: DiagnosticRateState) => void
  now?: () => number
  enabled?: boolean
  platform?: string
  arch?: string
}

const STEAM64 = /\b7656119\d{10}\b/g
const UUID = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi
// Riot PUUIDs, tokens, hashes: any long opaque run.
const LONG_TOKEN = /\b[A-Za-z0-9_-]{32,}\b/g
// Account ids, Steam32 ids, match ids.
const LONG_NUMBER = /\b\d{7,}\b/g
// Riot ID "Game Name#TAG" (game names are ≤16 chars and may contain spaces).
const RIOT_ID = /[^\s#][^#\r\n]{0,15}#[A-Za-z0-9]{2,5}\b/g
// Any remaining absolute path, file name or not (error-redaction only covers private roots).
const ANY_PATH = /(?:\b[A-Za-z]:[\\/]|\\\\|(?<![\w.])\/(?=[^\s/]+\/))[^\r\n"'<>|]*/g

/** Extra redaction for diagnostics on top of the shared error redaction. */
export function redactDiagnosticLine(message: string): string {
  return redactSensitiveString(message)
    .replace(ANY_PATH, '[path]')
    .replace(STEAM64, '[steam-id]')
    .replace(UUID, '[id]')
    .replace(LONG_TOKEN, '[id]')
    .replace(LONG_NUMBER, '[id]')
    .replace(RIOT_ID, '[riot-id]')
    .slice(0, 200)
}

function eventKey(event: DiagnosticEvent): string {
  return event.kind === 'main_stall' ? 'main_stall' : `call_burst:${event.label}`
}

function safeLabel(label: string): string {
  return label.replace(/[^a-z0-9:_-]/gi, '').slice(0, 64)
}

/** Pure rate decision: prunes old entries and says whether `key` may send at `now`. */
export function diagnosticRateDecision(
  state: DiagnosticRateState,
  key: string,
  now: number,
): { allowed: boolean; next: DiagnosticRateState } {
  const sentAt = state.sentAt.filter(t => now - t < DAY_MS && t <= now)
  const lastSentByKey = Object.fromEntries(
    Object.entries(state.lastSentByKey).filter(([, t]) => now - t < DAY_MS && t <= now),
  )
  const last = lastSentByKey[key]
  const allowed = (last === undefined || now - last >= DIAGNOSTIC_MIN_INTERVAL_MS) && sentAt.length < DIAGNOSTIC_DAILY_CAP
  if (allowed) {
    lastSentByKey[key] = now
    sentAt.push(now)
  }
  return { allowed, next: { lastSentByKey, sentAt } }
}

export function buildDiagnosticPayload(
  event: DiagnosticEvent,
  ctx: DiagnosticContext,
  env: { now: number; platform: string; arch: string },
): DiagnosticPayload {
  const activity = ctx.activity.slice(-ACTIVITY_LINES).map(entry => ({
    age_s: Math.max(0, Math.round((env.now - entry.time) / 1000)),
    message: redactDiagnosticLine(entry.message),
  }))
  const common = {
    category: 'diagnostic',
    kind: event.kind,
    os: env.platform,
    arch: env.arch,
    game: ctx.game && /^[a-z0-9_-]{1,32}$/i.test(ctx.game) ? ctx.game : null,
    recording_count: ctx.recordingCount,
    recent_activity: activity,
  }
  if (event.kind === 'main_stall') {
    return {
      // Stable message so the API groups every stall under one fingerprint; the numbers go in extra.
      message: '[MainLag] main process stall',
      component: 'diagnostic:main-lag',
      extra: { ...common, stall_ms: Math.round(event.stallMs) },
    }
  }
  const label = safeLabel(event.label)
  return {
    message: `[MainLag] ${label} reload burst`,
    component: 'diagnostic:main-lag',
    extra: { ...common, label, call_count: event.callCount, window_s: event.windowS },
  }
}

function validState(raw: DiagnosticRateState | null): DiagnosticRateState {
  const lastSentByKey: Record<string, number> = {}
  if (raw && raw.lastSentByKey && typeof raw.lastSentByKey === 'object') {
    for (const [k, v] of Object.entries(raw.lastSentByKey)) if (typeof v === 'number') lastSentByKey[k] = v
  }
  const sentAt = Array.isArray(raw?.sentAt) ? raw!.sentAt.filter((t): t is number => typeof t === 'number') : []
  return { lastSentByKey, sentAt }
}

/** Returns a function to call for each `[MainLag]` event; it decides whether to send. */
export function createDiagnosticReporter(deps: DiagnosticReporterDeps): (event: DiagnosticEvent) => boolean {
  const now = deps.now ?? (() => Date.now())
  let state: DiagnosticRateState | null = null
  return (event) => {
    if (deps.enabled === false) return false
    if (event.kind === 'main_stall' && event.stallMs < DIAGNOSTIC_STALL_REPORT_MS) return false
    const t = now()
    if (!state) {
      try { state = validState(deps.loadState()) } catch { state = validState(null) }
    }
    const { allowed, next } = diagnosticRateDecision(state, eventKey(event), t)
    state = next
    if (!allowed) return false
    try { deps.saveState(next) } catch { /* rate state is best effort; memory state still limits */ }
    let payload: DiagnosticPayload
    try {
      payload = buildDiagnosticPayload(event, deps.context(), {
        now: t,
        platform: deps.platform ?? process.platform,
        arch: deps.arch ?? process.arch,
      })
    } catch {
      return false
    }
    try {
      void Promise.resolve(deps.send(payload)).catch(() => { /* diagnostics never throw */ })
    } catch { /* ignore */ }
    return true
  }
}
