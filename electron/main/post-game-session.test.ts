import { beforeEach, describe, expect, it } from 'vitest'
import {
  applyPostGameChannelEvent,
  clearPostGameSession,
  capturePostGameSession,
  getPostGameSessionSnapshot,
  isPostGamePastPreparing,
  isPostGameSessionForRecording,
  resetPostGameSession,
  sendPostGameEventForRecording,
} from './post-game-session'

describe('isPostGamePastPreparing', () => {
  it('is false for preparing and empty', () => {
    expect(isPostGamePastPreparing('preparing')).toBe(false)
    expect(isPostGamePastPreparing(null)).toBe(false)
    expect(isPostGamePastPreparing(undefined)).toBe(false)
  })

  it('is true once flow has advanced', () => {
    expect(isPostGamePastPreparing('uploading')).toBe(true)
    expect(isPostGamePastPreparing('pending')).toBe(true)
    expect(isPostGamePastPreparing('error')).toBe(true)
    expect(isPostGamePastPreparing('analysing')).toBe(true)
    expect(isPostGamePastPreparing('ready')).toBe(true)
    expect(isPostGamePastPreparing('archived')).toBe(true)
  })
})

describe('applyPostGameChannelEvent preparing race', () => {
  beforeEach(() => {
    clearPostGameSession()
  })

  it('does not reset phase to preparing after prep-step', () => {
    resetPostGameSession('valorant', 'Haven', 'Jett')
    applyPostGameChannelEvent('post-game:prep-step', {
      game: 'valorant',
      map: 'Haven',
      agent: 'Jett',
    })
    expect(getPostGameSessionSnapshot()?.phase).toBe('uploading')

    applyPostGameChannelEvent('post-game:preparing', {
      game: 'valorant',
      map: 'Haven',
      agent: 'Jett',
    })

    const snap = getPostGameSessionSnapshot()
    expect(snap?.phase).toBe('uploading')
    expect(snap?.game).toBe('valorant')
  })

  it('binds an uploading modal to its recording for live worker progress', () => {
    resetPostGameSession('valorant', 'Haven', 'Jett', 7)
    applyPostGameChannelEvent('post-game:prep-step', {
      recordingId: 'onboarding-vod',
      game: 'valorant',
      map: 'Haven',
      agent: 'Jett',
    })

    expect(getPostGameSessionSnapshot()?.recordingId).toBe('onboarding-vod')
    expect(isPostGameSessionForRecording('onboarding-vod')).toBe(true)
    expect(isPostGameSessionForRecording('older-queued-vod')).toBe(false)

    applyPostGameChannelEvent('post-game:upload-progress', 47)
    expect(getPostGameSessionSnapshot()?.recordingId).toBe('onboarding-vod')
    expect(getPostGameSessionSnapshot()?.uploadProgress).toBe(47)
  })

  it('buffers compression progress without switching to upload state', () => {
    resetPostGameSession('valorant', 'Haven', 'Jett', 7, 'onboarding-vod')
    applyPostGameChannelEvent('post-game:compress-start', { sizeGB: '1.2' })
    applyPostGameChannelEvent('post-game:compress-progress', 42)

    const snap = getPostGameSessionSnapshot()
    expect(snap?.phase).toBe('uploading')
    expect(snap?.compressing).toBe(true)
    expect(snap?.uploadProgress).toBe(42)
  })

  it('rejects state changes from another recording or account', () => {
    resetPostGameSession('valorant', 'Haven', 'Jett', 7, 'current-vod')

    expect(sendPostGameEventForRecording(
      null,
      'older-vod',
      'post-game:analysis-progress',
      { progress: 88 },
      7,
    )).toBe(false)
    expect(sendPostGameEventForRecording(
      null,
      'current-vod',
      'post-game:analysis-progress',
      { progress: 77 },
      8,
    )).toBe(false)
    expect(getPostGameSessionSnapshot()?.analysisProgress).toBe(0)
  })

  it('buffers complete analysis progress, result, and error payloads', () => {
    resetPostGameSession('valorant', 'Haven', 'Jett', 7, 'current-vod')
    expect(sendPostGameEventForRecording(
      null,
      'current-vod',
      'post-game:analysis-progress',
      { progress: 63, current_step: 'Reviewing duels', status: 'processing', elapsed_ms: 12_000 },
      7,
    )).toBe(true)
    let snap = getPostGameSessionSnapshot()
    expect(snap?.analysisProgress).toBe(63)
    expect(snap?.analysisStep).toBe('Reviewing duels')
    expect(snap?.analysisElapsedMs).toBe(12_000)

    const ready = { recording_id: 'current-vod', analysis_id: 91, overall_score: 74 }
    sendPostGameEventForRecording(null, 'current-vod', 'post-game:analysis-ready', ready, 7)
    snap = getPostGameSessionSnapshot()
    expect(snap?.phase).toBe('ready')
    expect(snap?.analysisResult).toEqual(ready)

    const error = {
      recordingId: 'current-vod',
      title: 'Analysis failed',
      message: 'Try again',
      hint: null,
      creditRefunded: true,
      canRetry: true,
      kind: 'refunded_generic' as const,
    }
    sendPostGameEventForRecording(null, 'current-vod', 'post-game:upload-error', error, 7)
    snap = getPostGameSessionSnapshot()
    expect(snap?.phase).toBe('error')
    expect(snap?.analysisError).toEqual(error)
  })

  it('does not reset phase to preparing after pending', () => {
    resetPostGameSession('valorant', 'Ascent', 'Sage')
    applyPostGameChannelEvent('post-game:pending', {
      recordingId: 'rec-1',
      game: 'valorant',
      map: 'Ascent',
      agent: 'Sage',
      analysisReadiness: { ready: false, state: 'syncing', message: 'Fetching match stats…' },
    })
    expect(getPostGameSessionSnapshot()?.phase).toBe('pending')

    applyPostGameChannelEvent('post-game:preparing', {
      game: 'valorant',
      map: 'Bind',
      agent: 'Reyna',
    })

    const snap = getPostGameSessionSnapshot()
    expect(snap?.phase).toBe('pending')
    expect(snap?.recordingId).toBe('rec-1')
    // Late preparing may refresh labels without wiping pending state
    expect(snap?.map).toBe('Bind')
    expect(snap?.agent).toBe('Reyna')
  })

  it('still applies preparing when session is preparing', () => {
    resetPostGameSession('valorant', null, null)
    applyPostGameChannelEvent('post-game:preparing', {
      game: 'valorant',
      map: 'Lotus',
      agent: 'Omen',
    })
    const snap = getPostGameSessionSnapshot()
    expect(snap?.phase).toBe('preparing')
    expect(snap?.map).toBe('Lotus')
    expect(snap?.agent).toBe('Omen')
  })
})


describe('intentional coaching skips', () => {
  it('clears loading without showing a failure and preserves the reason on remount', () => {
    resetPostGameSession('valorant', 'Ascent', 'Omen')
    applyPostGameChannelEvent('post-game:debrief-loading', undefined)
    applyPostGameChannelEvent('post-game:debrief', { skipped: true, reason: 'daily_limit' })
    expect(getPostGameSessionSnapshot()).toMatchObject({
      debriefLoading: false, debriefFailed: false, debriefText: null, debriefSkipReason: 'daily_limit',
    })
    applyPostGameChannelEvent('post-game:debrief-loading', undefined)
    expect(getPostGameSessionSnapshot()?.debriefSkipReason).toBeNull()
  })
})


describe('post-match async session ownership', () => {
  it('does not recreate preparing after the user closes a saved manual match', () => {
    resetPostGameSession('valorant', 'Ascent', 'Fade', 1)
    const flow = capturePostGameSession()
    flow.send(null, 'post-game:pending', { recordingId: 'saved', game: 'valorant' })
    clearPostGameSession()
    flow.send(null, 'post-game:analysis-readiness', { ready: true, state: 'ready', message: '' })
    expect(getPostGameSessionSnapshot()).toBeNull()
    expect(flow.isCurrent()).toBe(false)
  })

  it('ignores old readiness, failures and close callbacks after a new match starts', () => {
    resetPostGameSession('valorant', 'Ascent', 'Fade', 1)
    const oldFlow = capturePostGameSession()
    resetPostGameSession('valorant', 'Haven', 'Jett', 1)
    oldFlow.send(null, 'post-game:upload-error', 'old failure')
    oldFlow.clear()
    expect(oldFlow.isCurrent()).toBe(false)
    expect(getPostGameSessionSnapshot()).toMatchObject({ phase: 'preparing', map: 'Haven', analysisError: null })
  })

  it('buffers current events even without a results window', () => {
    resetPostGameSession('valorant', 'Ascent', 'Fade', 1)
    const flow = capturePostGameSession()
    flow.send(null, 'post-game:pending', { recordingId: 'saved', game: 'valorant' })
    expect(flow.isCurrent()).toBe(true)
    expect(getPostGameSessionSnapshot()).toMatchObject({ phase: 'pending', recordingId: 'saved' })
  })
})
