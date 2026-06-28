/**
 * User-facing copy for analysis failures. Credits are refunded server-side for
 * most analysis pipeline failures (integrity gate, timeout, bad data).
 */

import type { DuelFailureDiagnostics } from './duel-diagnostics'

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
  failureDiagnostics?: DuelFailureDiagnostics | null
}

function extractXmlErrorParts(raw: string): { code?: string; message?: string } {
  const code = raw.match(/<Code>([^<]+)<\/Code>/i)?.[1]
  const message = raw.match(/<Message>([^<]+)<\/Message>/i)?.[1]
  return { code, message }
}

/** True when the string looks like raw infrastructure noise, not user copy. */
export function isTechnicalErrorMessage(raw: string): boolean {
  const err = raw.trim()
  if (!err) return false
  if (err.includes('<?xml') || err.includes('<Error>')) return true
  if (/ffmpeg exited|moov atom|invalid data found when processing/i.test(err)) return true
  if (err.length > 160) return true
  return false
}

export function formatAnalysisFailureMessage(rawError: string): string {
  return classifyAnalysisFailure(rawError).message
}

export function classifyAnalysisFailure(rawError: string): AnalysisFailurePresentation {
  const err = rawError.trim()
  const lower = err.toLowerCase()
  const xml = extractXmlErrorParts(err)

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
      message: isTechnicalErrorMessage(err) ? 'This recording is too large to upload for full analysis.' : err,
      hint: 'Your highlight clips were saved — open the dashboard to review them.',
      creditRefunded: false,
      canRetry: false,
    }
  }

  if (/moov atom|invalid data found when processing|error opening input file|recording is incomplete/i.test(lower)) {
    return {
      kind: 'upload',
      title: 'Recording file is incomplete',
      message: 'OBS stopped before the replay finished saving, so the video cannot be analysed.',
      hint: 'Let recording finish after the match ends (UpForge stops OBS automatically). Play another match, or retry from the dashboard only if the file on disk plays in a media player.',
      creditRefunded: /credit.*refund|refunded/i.test(lower),
      canRetry: false,
    }
  }

  if (
    /connection refused|sqlstate|queryexception|request failed \(5|econnrefused|enotfound|econnaborted|etimedout|fetch failed|temporarily unavailable|cannot reach upforge|network error|server error/i.test(lower)
  ) {
    return {
      kind: 'upload',
      title: 'UpForge is temporarily unavailable',
      message: 'We could not reach the servers right now. This usually clears within a minute.',
      hint: 'Your recording is safe on your PC — try again shortly from the dashboard.',
      creditRefunded: false,
      canRetry: true,
    }
  }

  if (
    xml.code === 'SlowDown'
    || /slowdown|please reduce your request rate/i.test(lower)
  ) {
    return {
      kind: 'upload',
      title: 'Upload temporarily throttled',
      message: 'Cloud storage asked us to slow down — wait a minute, then try again.',
      hint: 'Your recording is still on the dashboard — tap Analyse or Retry in a moment.',
      creditRefunded: false,
      canRetry: true,
    }
  }

  if (/s3 upload failed|service unavailable|http 503|http 502|http 500/i.test(lower) || err.includes('<?xml')) {
    const friendly = xml.message || (xml.code ? `Cloud storage error (${xml.code})` : null)
    return {
      kind: 'upload',
      title: 'Upload did not finish',
      message: friendly ?? 'The replay could not be sent to cloud storage.',
      hint: 'Your recording is still on the dashboard — tap Analyse to try again.',
      creditRefunded: false,
      canRetry: true,
    }
  }

  if (/upload was interrupted|file not found|could not prepare/i.test(lower)) {
    return {
      kind: 'upload',
      title: 'Upload did not finish',
      message: isTechnicalErrorMessage(err) ? 'The replay could not be prepared for upload.' : err,
      hint: 'Your recording is still on the dashboard — tap Analyse to try again.',
      creditRefunded: false,
      canRetry: true,
    }
  }

  if (/upload failed/i.test(lower)) {
    return {
      kind: 'upload',
      title: 'Upload did not finish',
      message: 'The replay could not be sent to cloud storage.',
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
      message: 'Your match stats synced, but coaching could not be verified from the duel clips Gemini reviewed.',
      hint: 'Open fight footage debug on the post-game screen or dashboard — each death shows clip upload status and what Gemini saw. Your credit was refunded.',
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
      message: 'We could not find death moments to review in this recording.',
      hint: 'Coaching reviews your deaths (not kill highlights). UpForge enables Analyse automatically once Riot stats sync — usually within a minute after the game.',
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
      message: isTechnicalErrorMessage(err) ? 'Something went wrong while analysing this match.' : err,
      hint: 'Your coaching credit was refunded. You can try again from the dashboard.',
      creditRefunded: true,
      canRetry: true,
    }
  }

  return {
    kind: 'refunded_generic',
    title: 'Analysis could not complete',
    message: isTechnicalErrorMessage(err)
      ? 'Something went wrong while analysing this match.'
      : (err || 'Something went wrong while analysing this match.'),
    hint: /credit.*refund|refunded/i.test(lower)
      ? 'Your coaching credit was refunded. Try again from the dashboard.'
      : 'Try again from the dashboard, or contact support if this keeps happening.',
    creditRefunded: /credit.*refund|refunded/i.test(lower),
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
