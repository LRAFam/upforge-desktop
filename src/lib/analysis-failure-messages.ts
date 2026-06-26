/**
 * User-facing copy for analysis failures. Credits are refunded server-side for
 * most analysis pipeline failures (integrity gate, timeout, bad data).
 */

export type AnalysisFailureKind =
  | 'refunded_quality'
  | 'refunded_timeout'
  | 'refunded_data'
  | 'refunded_generic'
  | 'integrity'
  | 'quota'
  | 'upload'
  | 'clips_only'

export interface AnalysisFailurePresentation {
  kind: AnalysisFailureKind
  title: string
  message: string
  hint: string | null
  creditRefunded: boolean
  canRetry: boolean
}

export interface AnalysisErrorPayload {
  message: string
  title: string
  hint: string | null
  creditRefunded: boolean
  canRetry: boolean
  kind: AnalysisFailureKind
  recordingId?: string
  needsUpgrade?: boolean
  upgradeUrl?: string
  ppaUrl?: string
  clipsOnly?: boolean
}

export function formatAnalysisFailureMessage(rawError: string): string {
  return classifyAnalysisFailure(rawError).message
}

export function classifyAnalysisFailure(rawError: string): AnalysisFailurePresentation {
  const err = rawError.trim()
  const lower = err.toLowerCase()

  if (/analysis\.limit|upgrade\.required|no analyses remaining/i.test(lower)) {
    return {
      kind: 'quota',
      title: 'Analysis limit reached',
      message: err.includes('remaining') ? err : 'You have used all your analyses for this period.',
      hint: 'Upgrade for more monthly coaching or buy a one-off analysis on the web.',
      creditRefunded: false,
      canRetry: false,
    }
  }

  if (/clips.?only|too large|recording too large/i.test(lower)) {
    return {
      kind: 'clips_only',
      title: 'Recording too large',
      message: err,
      hint: 'Your highlight clips were saved — open the dashboard to review them.',
      creditRefunded: false,
      canRetry: false,
    }
  }

  if (/upload was interrupted|file not found|upload failed|could not prepare/i.test(lower)) {
    return {
      kind: 'upload',
      title: 'Upload did not finish',
      message: err,
      hint: 'Your recording is still on the dashboard — tap Analyse to try again.',
      creditRefunded: false,
      canRetry: true,
    }
  }

  if (/timed? ?out|curl error 28|operation timed/i.test(err)) {
    return {
      kind: 'refunded_timeout',
      title: 'Analysis timed out',
      message: 'The server took too long on this match. Your coaching credit was refunded.',
      hint: 'Try again from the dashboard — off-peak hours are usually faster.',
      creditRefunded: true,
      canRetry: true,
    }
  }

  if (/insufficient duel observations|not generated from reviewed video|coachingintegrityerror/i.test(lower)) {
    return {
      kind: 'integrity',
      title: 'Could not verify fight footage',
      message: 'We could not get clear enough video insight from your duel clips to publish coaching.',
      hint: 'This often happens when recording started late or the death moment was unclear. Your credit was refunded — try Analyse again, or play another match with recording from the start.',
      creditRefunded: true,
      canRetry: true,
    }
  }

  if (/no actionable coaching|ai coach returned no|coaching integrity|quality bar/i.test(lower)) {
    return {
      kind: 'refunded_quality',
      title: 'Coaching did not meet our quality bar',
      message: 'We would rather refund you than show generic advice not grounded in your gameplay.',
      hint: 'Your coaching credit was refunded. Wait a minute after the game ends so match stats finish syncing, then try Analyse again.',
      creditRefunded: true,
      canRetry: true,
    }
  }

  if (/duel_moments|duel moments manifest/i.test(lower)) {
    return {
      kind: 'refunded_data',
      title: 'No reviewable moments',
      message: 'We could not find duel moments to review in this recording.',
      hint: 'Your coaching credit was refunded. Make sure the full match recorded with timeline sync.',
      creditRefunded: true,
      canRetry: true,
    }
  }

  if (/match_data|match data|kill events/i.test(lower)) {
    return {
      kind: 'refunded_data',
      title: 'Match stats were not ready',
      message: 'Riot match data had not finished syncing when analysis ran.',
      hint: 'Your credit was refunded. Wait ~30 seconds after the game ends, then tap Analyse on the dashboard.',
      creditRefunded: true,
      canRetry: true,
    }
  }

  if (/credit.*refund|refunded/i.test(lower)) {
    return {
      kind: 'refunded_generic',
      title: 'Analysis could not complete',
      message: err,
      hint: 'Your coaching credit was refunded. You can try again from the dashboard.',
      creditRefunded: true,
      canRetry: true,
    }
  }

  return {
    kind: 'refunded_generic',
    title: 'Analysis could not complete',
    message: err || 'Something went wrong while analysing this match.',
    hint: 'Your coaching credit was refunded. Try again from the dashboard.',
    creditRefunded: true,
    canRetry: true,
  }
}

export function buildAnalysisErrorPayload(
  rawError: string,
  extras: Partial<AnalysisErrorPayload> = {},
): AnalysisErrorPayload {
  const presentation = classifyAnalysisFailure(rawError)
  return {
    message: presentation.message,
    title: presentation.title,
    hint: presentation.hint,
    creditRefunded: presentation.creditRefunded,
    canRetry: presentation.canRetry,
    kind: presentation.kind,
    ...extras,
  }
}
