import { describe, expect, it } from 'vitest'
import { formatAnalysisFailureMessage } from '../electron/main/analysis-failure-messages'

describe('formatAnalysisFailureMessage', () => {
  it('maps insufficient duel observations to honest copy', () => {
    const msg = formatAnalysisFailureMessage(
      'Insufficient duel observations — coaching was not generated from reviewed video clips.',
    )
    expect(msg).toContain('reliable coaching')
    expect(msg).toContain('refunded')
  })

  it('appends refund note for generic errors', () => {
    const msg = formatAnalysisFailureMessage('Server error')
    expect(msg).toContain('refunded')
  })
})
