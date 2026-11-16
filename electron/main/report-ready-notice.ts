/**
 * "Your match report is ready": the notice shown after a match once its free report has synced.
 * Without it, a match that was not recorded ended in silence: the report was made a couple of
 * minutes later and only showed up on Home. Pure rules; the caller shows the notification.
 */
import type { FocusUpdate } from '../../src/lib/focus'

export interface ReportReadyInput {
  /** Why the sync ran (runFocusSync): only syncs that follow a match announce a report. */
  reason: string
  /** The newest report this sync created, if any. */
  latest: FocusUpdate | null
  /** The after-match window is on screen: it already links this report. */
  postGameShowing: boolean
  /** Match ids already announced in this app session. */
  announced: ReadonlySet<string>
}

export interface ReportReadyNotice {
  matchId: string
  title: string
  body: string
  /** Route the main window opens when the notice is clicked. */
  path: string
}

const AFTER_MATCH = new Set(['match_end', 'match_end_retry'])
const MATCH_ID = /^[A-Za-z0-9_-]{1,64}$/
const MAX_BODY = 140

function clip(text: string): string {
  const clean = text.replace(/\s+/g, ' ').trim()
  return clean.length > MAX_BODY ? `${clean.slice(0, MAX_BODY - 1).trimEnd()}…` : clean
}

/** The notice to show, or null when this sync should stay quiet. */
export function reportReadyNotice(input: ReportReadyInput): ReportReadyNotice | null {
  if (!AFTER_MATCH.has(input.reason) || input.postGameShowing) return null
  const matchId = input.latest?.match_id
  if (typeof matchId !== 'string' || !MATCH_ID.test(matchId) || input.announced.has(matchId)) return null
  // Lead with what the coach found when there is a note; otherwise just say the report is there.
  const headline = input.latest?.report?.notes?.headline?.text
  return {
    matchId,
    title: 'Your match report is ready',
    body: typeof headline === 'string' && headline.trim() ? clip(headline) : 'See what decided your last match.',
    path: `/report/${matchId}`,
  }
}
