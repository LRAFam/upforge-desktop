/** Thrown when the API returns 402 Payment Required (quota exceeded). */
export class UpgradeRequiredError extends Error {
  readonly errorCode: string
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
    this.upgradeUrl = upgradeUrl
    this.ppaUrl = ppaUrl
  }
}
