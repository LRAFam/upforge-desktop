import { describe, expect, it } from 'vitest'
import type { PendingRecording } from '../env.d.ts'
import {
  pendingMatchActionLabel,
  pendingMatchLifecycleState,
  pendingMatchPrimaryAction,
  pendingMatchStatusLabel,
} from './match-lifecycle'

function rec(overrides: Partial<PendingRecording> = {}): PendingRecording {
  return {
    id: 'r1',
    path: '/tmp/match.mp4',
    game: 'valorant',
    map: 'Bind',
    agent: 'Jett',
    gameMode: 'COMPETITIVE',
    recordedAt: Date.now(),
    analysed: false,
    hasLocalFile: true,
    ...overrides,
  } as PendingRecording
}

describe('deadlock has one analysis path (Review replay)', () => {
  const ready = { ready: true, state: 'ready' as const, message: '', duelMomentCount: 0 }
  it('never offers Analyse or a .dem attach for Deadlock', () => {
    expect(pendingMatchPrimaryAction(rec({ game: 'deadlock', timeline: null, analysisReadiness: ready }))).toBeNull()
    expect(pendingMatchPrimaryAction(rec({ game: 'deadlock', lastAnalysisError: 'x' }))).toBeNull()
    expect(pendingMatchActionLabel(rec({ game: 'deadlock' }))).toBeNull()
  })
  it('labels the replay state instead', () => {
    expect(pendingMatchStatusLabel(rec({ game: 'deadlock' }))).toBe('Replay not reviewed')
    expect(pendingMatchStatusLabel(rec({ game: 'deadlock', deadlockReviewJobId: 'job-1' }))).toBe('Replay review in progress')
    expect(pendingMatchStatusLabel(rec({ game: 'deadlock', analysisReadiness: { ready: false, state: 'mode_unsupported', message: '', duelMomentCount: 0 } }))).toBe('Replay reviewed')
  })
})

describe('pending match lifecycle', () => {
  it('separates background work from action-required matches', () => {
    const preparing = rec({
      analysisReadiness: { ready: false, state: 'syncing', message: '', duelMomentCount: 0 },
    })
    expect(pendingMatchLifecycleState(preparing)).toBe('preparing')
    expect(pendingMatchPrimaryAction(preparing)).toBeNull()

    const paused = rec({
      matchStatsSyncPaused: true,
      analysisReadiness: { ready: false, state: 'syncing', message: '', duelMomentCount: 0 },
    })
    expect(pendingMatchLifecycleState(paused)).toBe('action_required')
    expect(pendingMatchPrimaryAction(paused)).toBe('retry_stats')
    expect(pendingMatchActionLabel(paused)).toBe('Retry stats sync')
  })

  it('labels ready, failed, demo-required, and in-flight sessions', () => {
    const ready = rec({ analysisReadiness: { ready: true, state: 'ready', message: '', duelMomentCount: 2 } })
    expect(pendingMatchStatusLabel(ready)).toBe('Ready for coaching')
    expect(pendingMatchPrimaryAction(rec({ lastAnalysisError: 'failed' }))).toBe('retry_analysis')
    expect(pendingMatchPrimaryAction(rec({ game: 'cs2', timeline: null }))).toBe('attach_replay')
    expect(pendingMatchLifecycleState(rec({ pipelineStatus: 'analysing' }))).toBe('analysing')
  })
})
