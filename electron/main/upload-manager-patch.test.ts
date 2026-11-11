import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ app: { isPackaged: false, getAppPath: () => process.cwd(), getPath: () => process.cwd() } }))

describe('match-data backfill', () => {
  // Real job 0a96c380: a blocked (wiped) backfill overwrote the server's rebuilt scoreboard and spikes.
  it('does not send a backfill whose facts the quality check removed', async () => {
    const { shouldPatchMatchData } = await import('./upload-manager')
    expect(shouldPatchMatchData({ dataQuality: { status: 'blocked' } })).toBe(false)
    expect(shouldPatchMatchData(null)).toBe(false)
    expect(shouldPatchMatchData({ dataQuality: { status: 'verified_fields_only' } })).toBe(true)
    expect(shouldPatchMatchData({})).toBe(true)
  })
})
