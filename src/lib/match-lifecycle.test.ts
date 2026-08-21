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
