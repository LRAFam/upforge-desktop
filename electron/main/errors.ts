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
