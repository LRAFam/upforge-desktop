import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ app: { isPackaged: false, getPath: () => '/tmp', getVersion: () => '0.0.0', getAppPath: () => '/tmp' } }))
vi.mock('electron-log', () => ({ default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))

import { attachDemoFileToRecording } from './recording-demo-attach'
import { deadlockModule } from './analyse-modules/deadlock'
import { DEADLOCK_REVIEW_REPLAY_HINT, deadlockDemoSyncMessage, demoAttachHint } from './match-data-quality'
import type { RecordingsStore } from './recordings-store'

describe('Deadlock: no "attach the .dem" dead end', () => {
  it('attaching a .dem to a Deadlock recording says to use Review replay, not a CS2 error', async () => {
    const store = { getById: () => ({ id: 'r1', game: 'deadlock', recordedAt: 0, timeline: null }) } as unknown as RecordingsStore
    const res = await attachDemoFileToRecording({ store, recordingId: 'r1', demoPath: 'C:/x/123.dem' })
    expect(res.ok).toBe(false)
    expect(res.error).toBe(DEADLOCK_REVIEW_REPLAY_HINT)
    expect(res.error).not.toMatch(/CS2/)
  })

  it('the lock text and wait copy point to Review replay', () => {
    const readiness = deadlockModule.isReady({ game: 'deadlock', recordedAt: Date.now() - 3 * 60 * 60_000, timeline: null } as never)
    expect(readiness.state).toBe('waiting_match_data')
    expect(readiness.message).toContain('Review replay')
    expect(readiness.message).not.toMatch(/\.dem/)
    expect(demoAttachHint('deadlock')).toBe(DEADLOCK_REVIEW_REPLAY_HINT)
    for (const min of [2, 10, 20, 40]) expect(deadlockDemoSyncMessage(min * 60_000)).not.toMatch(/\.dem/)
  })
})
