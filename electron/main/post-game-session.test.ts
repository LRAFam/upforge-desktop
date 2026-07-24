import { beforeEach, describe, expect, it } from 'vitest'
import {
  applyPostGameChannelEvent,
  clearPostGameSession,
  getPostGameSessionSnapshot,
  isPostGamePastPreparing,
  resetPostGameSession,
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
