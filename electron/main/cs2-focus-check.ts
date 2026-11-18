/**
 * CS2 focus counting from the desktop.
 *
 * - The match-report notes call and the focus-check call carry `played_at` (when the recording
 *   started): the API never counts a match for a focus without a real play time.
 * - They carry `job_id` when the same recording was also uploaded for demo analysis, so the API
 *   counts the notes and the demo as one match.
 * - When a demo is parsed into a recording, POST /api/cs2/match-report/focus-check sends the match
 *   so it counts without its report page being opened. Older APIs don't have that route: a 404/405
 *   turns the call off for this session (logged only, never shown, never retried).
 */

export const CS2_FOCUS_CHECK_PATH = '/api/cs2/match-report/focus-check'

/** Same rule as the API's match_key validation. */
const MATCH_KEY_RE = /^[A-Za-z0-9_.:-]{1,64}$/
/** The API only accepts a UUID job_id (anything else would fail the whole request). */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
/** The API refuses a played_at more than 5 minutes in the future; stay well inside it. */
const FUTURE_SLACK_MS = 60_000

export interface Cs2FocusRecording {
  id: string
  game?: string | null
  map?: string | null
  gameMode?: string | null
  captureRecordingStartTime?: number | null
  cs2DemoJobId?: string | null
  /** Set once the API counted this match: the job it was counted under ('' = the recording id). */
  cs2FocusKeyJob?: string | null
  timeline?: unknown
}

type TimelineLike = {
  recordingStartTime?: unknown
  map?: unknown
  gameMode?: unknown
  finalStats?: { won?: unknown } | null
  match_stats?: Record<string, unknown> | null
}

export interface Cs2MatchExtras {
  played_at?: string
  job_id?: string
}

function timelineOf(rec: Cs2FocusRecording): TimelineLike | null {
  const t = rec.timeline
  return t && typeof t === 'object' ? t as TimelineLike : null
}

/** When the recording started (ISO 8601), or null when unknown or not a sane epoch-ms time. */
export function cs2PlayedAt(rec: Cs2FocusRecording, now = Date.now()): string | null {
  const raw = rec.captureRecordingStartTime ?? timelineOf(rec)?.recordingStartTime
  if (typeof raw !== 'number' || !Number.isFinite(raw) || raw < 1e12) return null
  if (raw > now + FUTURE_SLACK_MS) return null
  return new Date(raw).toISOString()
}

export function isCs2DemoJobId(jobId: unknown): jobId is string {
  return typeof jobId === 'string' && UUID_RE.test(jobId)
}

/** Extra fields for the CS2 notes and focus-check calls. Older APIs ignore them. */
export function cs2MatchExtras(rec: Cs2FocusRecording | null | undefined, now = Date.now()): Cs2MatchExtras {
  if (!rec || rec.game !== 'cs2') return {}
  const out: Cs2MatchExtras = {}
  const playedAt = cs2PlayedAt(rec, now)
  if (playedAt) out.played_at = playedAt
  // Keep the key the match was first counted under (a job linked later must not make it count twice).
  const job = typeof rec.cs2FocusKeyJob === 'string' ? rec.cs2FocusKeyJob : rec.cs2DemoJobId
  if (isCs2DemoJobId(job)) out.job_id = job
  return out
}

/** Focus-check body (same shape as the notes call), or null when no demo has been parsed. */
export function cs2FocusCheckBody(rec: Cs2FocusRecording, now = Date.now()): Record<string, unknown> | null {
  if (rec.game !== 'cs2' || !MATCH_KEY_RE.test(rec.id)) return null
  const t = timelineOf(rec)
  const stats = t?.match_stats
  // Only the demo parser sets timeline.match_stats with player_stats.
  if (!stats || typeof stats !== 'object' || !stats.player_stats || typeof stats.player_stats !== 'object') return null
  const match_stats: Record<string, unknown> = { player_stats: stats.player_stats }
  for (const key of ['score', 'rounds', 'round_stats', 'utility_stats', 'economy_stats'] as const) {
    if (stats[key] != null) match_stats[key] = stats[key]
  }
  const won = t?.finalStats?.won
  const mode = rec.gameMode || (typeof t?.gameMode === 'string' ? t.gameMode : null)
  const map = rec.map || (typeof t?.map === 'string' ? t.map : null)
  const facts: Record<string, unknown> = { map: map || null, won: typeof won === 'boolean' ? won : null, match_stats }
  // Same normalisation as match-data-payload gameModeForApi (kept local: this module has no imports).
  const gameMode = mode ? mode.trim().toLowerCase().replace(/[\s-]+/g, '_') : null
  if (gameMode) facts.game_mode = gameMode
  return { match_key: rec.id, facts, ...cs2MatchExtras(rec, now) }
}

export interface Cs2FocusCheckDeps {
  isAuthenticated: () => boolean
  /** Resolves with the HTTP status, or null on a network error. Must not throw. */
  post: (path: string, body: Record<string, unknown>) => Promise<number | null>
  /** Remember the key the API counted this match under (see cs2MatchExtras). */
  markCounted: (recordingId: string, jobId: string | null) => void
  log: { info: (...args: unknown[]) => void; warn: (...args: unknown[]) => void }
}

/**
 * One focus check per recording (none once the API has counted it). A 404/405 (API without the route) stops all further
 * checks this session; any other failure is logged and not retried (the notes call counts too).
 */
export function createCs2FocusChecker(deps: Cs2FocusCheckDeps) {
  const attempted = new Set<string>()
  let unsupported = false

  async function check(rec: Cs2FocusRecording): Promise<'sent' | 'skipped' | 'unsupported' | 'failed'> {
    if (unsupported || attempted.has(rec.id) || typeof rec.cs2FocusKeyJob === 'string') return 'skipped'
    const body = cs2FocusCheckBody(rec)
    // Without a play time the API never counts the match: nothing to send.
    if (!body || typeof body.played_at !== 'string' || !deps.isAuthenticated()) return 'skipped'
    attempted.add(rec.id)
    const status = await deps.post(CS2_FOCUS_CHECK_PATH, body).catch(() => null)
    if (status === 404 || status === 405) {
      unsupported = true
      deps.log.info('[CS2Focus] focus-check not available on this API — skipping for this session')
      return 'unsupported'
    }
    if (status !== 200) {
      deps.log.warn('[CS2Focus] focus-check failed', { recordingId: rec.id, status })
      return 'failed'
    }
    deps.markCounted(rec.id, typeof body.job_id === 'string' ? body.job_id : null)
    return 'sent'
  }

  return { check }
}
