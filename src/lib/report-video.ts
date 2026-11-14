/**
 * Match report → video: what the free report offers for this match's recording.
 * Pure rules so the page stays a thin view. Whether a recording can be analysed is decided by the
 * shared gate (analyse-gate.ts, same as Matches); the main process and the API still enforce it.
 */
import type { PendingRecording } from '../env.d.ts'
import { roundToQuery } from '../components/v3/matchpage/valorant/round-link'
import { analyseBlockedMessage, canOfferAnalyse } from './analyse-gate'
import { isUnlimitedQuota } from './quota-display'

export type ReportRecording = Pick<PendingRecording,
  'id' | 'matchId' | 'analysisId' | 'archiveId' | 'jobId' | 'pipelineStatus' | 'pipelineDeferReason' | 'clipsOnly'
  | 'hasLocalFile' | 'lastAnalysisError' | 'analysisReadiness' | 'productionFixture'>

export type ReportVideoAction =
  /** No recording of this match (or nothing playable): the report shows no video block. */
  | { kind: 'none' }
  /** Video coaching exists for this match. */
  | { kind: 'open'; analysisId: number }
  /** Uploading or being analysed right now. */
  | { kind: 'working'; text: string }
  /** Recorded, but it can't be sent yet (match data still syncing, mode not supported, upload paused). */
  | { kind: 'waiting'; text: string }
  /** Recorded and ready, but the plan has no analyses left. */
  | { kind: 'upgrade' }
  /** Recorded and ready to send. `retry` = an earlier attempt failed after the upload. */
  | { kind: 'start'; recordingId: string; retry: boolean }

/** A full recording the report can act on: not clips-only, not a read-only developer fixture. */
function usable(rec: ReportRecording): boolean {
  return !rec.clipsOnly && !rec.productionFixture
}

/**
 * The recording of this match the report acts on. A match can have more than one row (a re-import,
 * a clips-only capture), so prefer the analysed one, then one still being worked on, then one whose
 * file is on this PC.
 */
export function pickReportRecording<T extends ReportRecording>(rows: readonly T[], matchId: string): T | null {
  if (!matchId) return null
  const mine = rows.filter(r => r.matchId === matchId && usable(r))
  return mine.find(r => r.analysisId != null)
    ?? mine.find(r => r.pipelineStatus === 'uploading' || r.pipelineStatus === 'analysing')
    ?? mine.find(r => r.hasLocalFile)
    ?? mine[0]
    ?? null
}

/**
 * `quotaLeft`: false only when the profile says the plan has no analyses left; null while unknown
 * (the API still refuses when there are none, so unknown never blocks the button).
 * `justStarted`: the player pressed the button here and the recording hasn't reported the upload
 * yet, so the page holds "sending" instead of offering the button (or plans) a second time.
 */
export function reportVideoAction(
  rec: ReportRecording | null | undefined,
  opts: { quotaLeft: boolean | null; justStarted?: boolean },
): ReportVideoAction {
  if (!rec || !usable(rec)) return { kind: 'none' }
  if (rec.analysisId != null) return { kind: 'open', analysisId: rec.analysisId }
  if (rec.pipelineStatus === 'analysing') {
    return { kind: 'working', text: 'Your coach is watching this match. You’ll get a notification when it’s ready.' }
  }
  if (rec.pipelineStatus === 'uploading') return { kind: 'working', text: 'Uploading this match for video coaching…' }
  const retry = Boolean(rec.lastAnalysisError && rec.jobId)
  // Nothing on this PC and nothing in the cloud to retry from: there is no footage to send.
  if (!rec.hasLocalFile && !retry) return { kind: 'none' }
  if (!canOfferAnalyse(rec)) return { kind: 'waiting', text: analyseBlockedMessage(rec) }
  if (opts.justStarted && !retry) return { kind: 'working', text: 'Sending this match to your coach…' }
  if (opts.quotaLeft === false) return { kind: 'upgrade' }
  return { kind: 'start', recordingId: rec.id, retry }
}

const reportsSeen = new Set<string>()
/** True the first time a report is shown in this app session: one "opened" event per match. */
export function firstReportView(game: string, matchId: string): boolean {
  const key = `${game}:${matchId}`
  if (!matchId || reportsSeen.has(key)) return false
  reportsSeen.add(key)
  return true
}

/**
 * "2 analyses left" from the plan's own monthly allowance, for the line under the button.
 * Null when it would mislead: unknown, no cap (admin), or only bought credits remain.
 */
export function reportAllowanceLabel(
  stats: { total?: number | null; limit?: number | null } | null | undefined,
): string | null {
  const total = stats?.total
  const limit = stats?.limit
  if (typeof total !== 'number' || typeof limit !== 'number' || !Number.isFinite(total) || !Number.isFinite(limit)) return null
  const left = Math.floor(limit - total)
  if (left <= 0 || isUnlimitedQuota(limit)) return null
  return `${left} ${left === 1 ? 'analysis' : 'analyses'} left`
}

export interface ReportVideoCopy {
  text: string
  /** Null when there is nothing to press (in progress, or waiting on something else). */
  button: string | null
}

/** `leftLabel` is the plan line the sidebar shows ("1 analysis left"); omitted when unknown. */
export function reportVideoCopy(action: ReportVideoAction, leftLabel?: string | null): ReportVideoCopy | null {
  switch (action.kind) {
    case 'none': return null
    case 'open': return { text: 'Your coach watched this match on video.', button: 'Open video coaching' }
    case 'working':
    case 'waiting': return { text: action.text, button: null }
    case 'upgrade':
      return {
        text: 'This match was recorded, so your coach can watch it on video. Your plan has no video analyses left.',
        button: 'See plans',
      }
    case 'start':
      if (action.retry) return { text: 'The last video coaching attempt for this match didn’t finish.', button: 'Try again' }
      return {
        text: `This match was recorded. Upload it and your coach watches it on video. Uses 1 analysis${leftLabel ? ` (${leftLabel})` : ''}.`,
        button: 'Get video coaching',
      }
  }
}

/**
 * Route query that opens this match's footage at a round (1-based, as the report shows it),
 * or null when there is nothing to play. Same shapes the post-game "Review round" link uses.
 */
export function reportWatchQuery(rec: ReportRecording | null | undefined, round: number): Record<string, string> | null {
  if (!rec || !usable(rec) || !Number.isInteger(round)) return null
  const r = roundToQuery(round - 1)
  if (!r) return null
  if (rec.analysisId != null) return { timelineId: String(rec.analysisId), round: r }
  if (rec.hasLocalFile) return { id: rec.id, round: r }
  if (rec.archiveId) return { archiveId: rec.archiveId, round: r }
  return null
}
