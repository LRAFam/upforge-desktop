import { beforeEach, describe, expect, it } from 'vitest'
import {
  applyPostGameChannelEvent,
  clearPostGameSession,
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
