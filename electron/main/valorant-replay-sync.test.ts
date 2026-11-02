import { describe, expect, it, vi } from 'vitest'
import { MATCHES_PER_RUN, RETRY_AFTER_MS, ValorantReplaySync, type ReplayMatch, type ReplaySyncDeps, type ReplaySyncState } from './valorant-replay-sync'

const NOW = 1_800_000_000_000
const comp = (id: string, agoMin = 30, queueId = 'competitive'): ReplayMatch => ({ matchId: id, gameStartTimeMs: NOW - agoMin * 60_000, queueId })

function setup(over: Partial<ReplaySyncDeps> = {}, history: ReplayMatch[] = [comp('m1')]) {
  let state: ReplaySyncState = {}
  const deps: ReplaySyncDeps = {
    enabled: () => true,
    isMatchActive: async () => false,
    listRecentMatches: async () => history,
    download: vi.fn(async () => ({ ok: true as const, bytes: Buffer.from('vrf'), gameVersion: 'release-13.09', checksum: 'abc' })),
    upload: vi.fn(async () => ({ ok: true as const })),
    report: vi.fn(async () => {}),
    loadState: () => state,
    saveState: (s) => { state = { ...s } },
    now: () => NOW,
    ...over,
  }
  return { sync: new ValorantReplaySync(deps), deps, state: () => state }
}

describe('ValorantReplaySync', () => {
  it('downloads and uploads a new competitive replay once', async () => {
    const { sync, deps, state } = setup()
    expect((await sync.run()).uploaded).toEqual(['m1'])
    expect(deps.upload).toHaveBeenCalledWith('m1', Buffer.from('vrf'), { gameVersion: 'release-13.09', checksum: 'abc', queueId: 'competitive' })
    expect(state().m1).toMatchObject({ status: 'uploaded', attempts: 1, sizeBytes: 3 })
    await sync.run()
    expect(deps.download).toHaveBeenCalledTimes(1)
  })

  it('skips modes without replays and matches older than a week', async () => {
    const { sync, deps } = setup({}, [comp('custom', 30, ''), comp('range', 30, 'range'), comp('old', 8 * 24 * 60), comp('sp', 30, 'swiftplay')])
    expect((await sync.run()).uploaded).toEqual(['sp'])
    expect(deps.download).toHaveBeenCalledTimes(1)
  })

  it('never runs during a match, when switched off, or before the Riot client is ready', async () => {
    expect((await setup({ isMatchActive: async () => true }).sync.run()).reason).toBe('match_in_progress')
    expect((await setup({ enabled: () => false }).sync.run()).reason).toBe('disabled')
    expect((await setup({ listRecentMatches: async () => null }).sync.run()).reason).toBe('riot_client_not_ready')
  })

  it('limits work per run', async () => {
    const { sync } = setup({}, [comp('a'), comp('b'), comp('c')])
    expect((await sync.run()).uploaded).toHaveLength(MATCHES_PER_RUN)
  })

  it('retries a replay Riot has not made available yet, then reports it as failed', async () => {
    let t = NOW
    const { sync, deps, state } = setup({ download: vi.fn(async () => ({ ok: false as const, error: 'no_replay' })), now: () => t })
    await sync.run()
    expect(state().m1).toMatchObject({ status: 'pending', attempts: 1, error: 'no_replay' })
    await sync.run()                                   // too soon: not retried
    expect(deps.download).toHaveBeenCalledTimes(1)
    for (let i = 0; i < 5; i++) { t += RETRY_AFTER_MS; await sync.run() }
    expect(state().m1).toMatchObject({ status: 'failed', attempts: 6 })
    expect(deps.report).toHaveBeenCalledWith('m1', 'no_replay', { gameVersion: undefined, attempts: 6, queueId: 'competitive' })
    t += RETRY_AFTER_MS; await sync.run()
    expect(deps.download).toHaveBeenCalledTimes(6)     // failed is final
  })

  it('keeps the game version when the upload fails, for the failure report', async () => {
    let t = NOW
    const { sync, deps, state } = setup({ upload: vi.fn(async () => ({ ok: false as const, error: 'http_500' })), now: () => t })
    for (let i = 0; i < 4; i++) { await sync.run(); t += RETRY_AFTER_MS }
    expect(state().m1).toMatchObject({ status: 'failed', error: 'upload:http_500', gameVersion: 'release-13.09' })
    expect(deps.report).toHaveBeenCalledTimes(1)
  })

  it('a failing report never breaks the sync', async () => {
    let t = NOW
    const { sync, state } = setup({ download: vi.fn(async () => ({ ok: false as const, error: 'checksum_mismatch' })),
      report: async () => { throw new Error('offline') }, now: () => t })
    for (let i = 0; i < 4; i++) { await sync.run(); t += RETRY_AFTER_MS }
    expect(state().m1.status).toBe('failed')
  })
})
