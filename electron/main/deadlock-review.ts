/**
 * Deadlock "Review replay": a user-started cloud review of one recording's replay.
 *
 * It costs a credit, so it only ever runs from an explicit action. The flow:
 * find this recording's replay → upload → remember the job on the recording → poll (capped) →
 * build the kill timeline from the review's real replay events. With no events, the
 * recording keeps its sparse timeline, so the Analyse lock stays on (desktop↔API contract).
 * All I/O is injected so the logic is testable without network or Electron.
 */
import type { MatchData } from './riot-types'
import { deadlockTimelineFromCloud, type DeadlockCloudKillEvent } from './deadlock-cloud-timeline'

export interface DeadlockReviewRecording {
  id: string
  game: string
  recordedAt: number
  timeline: MatchData | null
  deadlockReviewJobId?: string
}

export type StartReviewResult =
  | { ok: true; jobId: string }
  | { ok: false; error: string }

export interface StartReviewDeps {
  getRecording: (id: string) => DeadlockReviewRecording | undefined
  /** Replay for this recording's match session (same matching as the replay retrieval path). */
  findReplay: (rec: DeadlockReviewRecording) => Promise<string | null>
  upload: (demoPath: string) => Promise<{ ok: true; jobId: string } | { ok: false; error: string }>
  setJob: (recordingId: string, jobId: string) => boolean
}

export async function startDeadlockReplayReview(deps: StartReviewDeps, recordingId: string): Promise<StartReviewResult> {
  const rec = deps.getRecording(recordingId)
  if (!rec || rec.game !== 'deadlock') return { ok: false, error: 'This recording is not a Deadlock match.' }
  if (rec.deadlockReviewJobId) return { ok: true, jobId: rec.deadlockReviewJobId }
  const demoPath = await deps.findReplay(rec)
  if (!demoPath) {
    return { ok: false, error: 'No replay file found for this match yet. Deadlock saves it a few minutes after the match.' }
  }
  const up = await deps.upload(demoPath)
  if (!up.ok) return up
  if (!deps.setJob(recordingId, up.jobId)) return { ok: false, error: 'The review started but could not be linked to this recording.' }
  return { ok: true, jobId: up.jobId }
}

export type ReviewJobStatus = 'uploading' | 'pending' | 'processing' | 'completed' | 'failed' | 'unknown'

export interface ReviewDetail {
  hero?: string | null
  duration_minutes?: number | null
  match_result?: string | null
  match_stats?: { kill_events?: DeadlockCloudKillEvent[] | null } | null
}

export interface PollReviewDeps {
  getRecording: (id: string) => DeadlockReviewRecording | undefined
  getStatus: (jobId: string) => Promise<ReviewJobStatus>
  getDetail: (jobId: string) => Promise<ReviewDetail | null>
  updateTimeline: (recordingId: string, timeline: MatchData) => boolean
  notify: () => void
  sleep: (ms: number) => Promise<void>
  /** Stops polling early, e.g. on sign-out or app quit. */
  cancelled?: () => boolean
}

export type PollReviewResult = 'linked' | 'no_events' | 'failed' | 'gave_up' | 'not_found'

export const REVIEW_MAX_POLLS = 20

/** Backoff: 10 s, 15 s, 22 s … capped at 60 s; 20 polls ≈ 15 minutes in total. */
export function reviewPollDelayMs(attempt: number): number {
  return Math.min(60_000, Math.round(10_000 * 1.5 ** attempt))
}

export async function pollDeadlockReplayReview(
  deps: PollReviewDeps,
  recordingId: string,
  opts: { maxPolls?: number } = {},
): Promise<PollReviewResult> {
  const maxPolls = Math.max(1, Math.min(opts.maxPolls ?? REVIEW_MAX_POLLS, REVIEW_MAX_POLLS))
  for (let attempt = 0; attempt < maxPolls; attempt++) {
    if (deps.cancelled?.()) return 'gave_up'
    const rec = deps.getRecording(recordingId)
    const jobId = rec?.deadlockReviewJobId
    if (!rec || !jobId) return 'not_found'
    const status = await deps.getStatus(jobId)
    if (status === 'failed') return 'failed'
    if (status === 'completed') return linkReviewTimeline(deps, rec, jobId)
    if (attempt < maxPolls - 1) await deps.sleep(reviewPollDelayMs(attempt))
  }
  return 'gave_up'
}

/** One-shot: fetch a finished review and attach its timeline (used by refresh and after polling). */
export async function linkReviewTimeline(
  deps: Pick<PollReviewDeps, 'getDetail' | 'updateTimeline' | 'notify'>,
  rec: DeadlockReviewRecording,
  jobId: string,
): Promise<PollReviewResult> {
  const detail = await deps.getDetail(jobId)
  if (!detail) return 'failed'
  const built = deadlockTimelineFromCloud({
    events: detail.match_stats?.kill_events,
    hero: detail.hero ?? null,
    jobId,
    recordingStartTime: rec.timeline?.recordingStartTime ?? rec.recordedAt,
    matchStartTime: rec.timeline?.matchStartTime ?? null,
    durationMinutes: detail.duration_minutes ?? null,
    result: detail.match_result ?? null,
  })
  if (!built) return 'no_events'
  // Keep what the recording already knew (map, ids) and add the replay's kills on top.
  const merged = rec.timeline ? mergeKeepingKnown(rec.timeline, built) : built
  if (!deps.updateTimeline(rec.id, merged)) return 'not_found'
  deps.notify()
  return 'linked'
}

/** The replay's fields win, except where it has nothing (null/undefined) and the recording already knew a value. */
function mergeKeepingKnown(known: MatchData, built: MatchData): MatchData {
  const out = { ...known } as Record<string, unknown>
  for (const [k, v] of Object.entries(built)) {
    if (v !== null && v !== undefined) out[k] = v
  }
  return out as unknown as MatchData
}

export function parseReviewStatus(raw: unknown): ReviewJobStatus {
  const s = typeof raw === 'string' ? raw : ''
  const known: readonly string[] = ['uploading', 'pending', 'processing', 'completed', 'failed']
  return known.includes(s) ? s as ReviewJobStatus : 'unknown'
}
