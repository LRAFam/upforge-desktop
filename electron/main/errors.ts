import type { ActivationErrorCode } from './activation-error-codes'

/** Stable pipeline failure with a machine code for funnel + UI classification. */
export class ActivationPipelineError extends Error {
  readonly failureCode: ActivationErrorCode

  constructor(failureCode: ActivationErrorCode, message?: string) {
    const text = message ?? failureCode
    super(text)
    this.name = 'ActivationPipelineError'
    this.failureCode = failureCode
  }
}

export function activationPipelineMessage(
  code: ActivationErrorCode,
  detail?: string,
): string {
  return detail ? `${code}: ${detail}` : code
}

/** Thrown when the API returns 402 Payment Required (quota exceeded). */
export class UpgradeRequiredError extends Error {
  readonly errorCode: string
  readonly failureCode: string
  readonly upgradeUrl: string
  readonly ppaUrl: string
  constructor(
    message: string,
    errorCode = 'analysis_limit_reached',
    upgradeUrl = 'https://upforge.gg/pricing',
    ppaUrl = 'https://upforge.gg/valorant/analyze',
  ) {
    super(message)
    this.name = 'UpgradeRequiredError'
    this.errorCode = errorCode
    this.failureCode = 'quota_required'
    this.upgradeUrl = upgradeUrl
    this.ppaUrl = ppaUrl
  }
}

/** Plan message for a replay-analysis quota wall (the API copy for these routes is not player-ready). */
export const REPLAY_QUOTA_MESSAGE =
  "You've used all your match reviews for now. Upgrade your plan to keep reviewing — your replay is still saved."

/**
 * Error for a failed replay API call. A 402 becomes an {@link UpgradeRequiredError}
 * with the plan message instead of "Request failed (402)".
 */
export function replayApiError(status: number, json: Record<string, unknown> | null): Error {
  if (status === 402) {
    const upgradeUrl = typeof json?.upgrade_url === 'string' && /^https:\/\/upforge\.gg\//.test(json.upgrade_url)
      ? json.upgrade_url
      : undefined
    return new UpgradeRequiredError(REPLAY_QUOTA_MESSAGE, 'analysis_limit_reached', upgradeUrl)
  }
  const message = typeof json?.message === 'string' && json.message
    ? json.message
    : typeof json?.error === 'string' && json.error ? json.error : `Request failed (${status})`
  return new Error(message)
}
