import { describe, expect, it } from 'vitest'
import {
  analyseBlockedMessage,
  canOfferAnalyse,
  isAnalyseDeferredForMatch,
  isAnalyseReady,
} from './analyse-gate'
import { POST_MATCH_COPY } from './post-match-copy'

describe('analyse-gate', () => {
  it('isAnalyseReady follows analysisReadiness.ready', () => {
    expect(isAnalyseReady({ analysisReadiness: { ready: true } })).toBe(true)
    expect(isAnalyseReady({ analysisReadiness: { ready: false } })).toBe(false)
    expect(isAnalyseReady({})).toBe(false)
  })

  it('blocks analyse while deferred for match', () => {
    expect(isAnalyseDeferredForMatch({ pipelineDeferReason: 'recording' })).toBe(true)
    expect(isAnalyseDeferredForMatch({ pipelineDeferReason: 'recording', clipsOnly: true })).toBe(false)
    expect(canOfferAnalyse({
      pipelineDeferReason: 'recording',
      analysisReadiness: { ready: true },
    })).toBe(false)
  })

  it('allows cloud retry with lastAnalysisError + jobId even if not ready', () => {
    expect(canOfferAnalyse({
      lastAnalysisError: 'fail',
      jobId: 'job-1',
      analysisReadiness: { ready: false },
    })).toBe(true)
  })

  it('uses shared pause copy when deferred', () => {
    expect(analyseBlockedMessage({ pipelineDeferReason: 'recording' }))
      .toBe(POST_MATCH_COPY.pausedAnalyseBlocked)
  })
})
