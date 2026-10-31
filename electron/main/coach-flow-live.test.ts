import { describe, expect, it, vi } from 'vitest'
import { foundCount, momentsToRequest, runLiveCoachFlow, type LiveDeps, type LiveUpdate } from './coach-flow-live'

const win = (id: string, s: number) => ({ moment_id: id, window_start_ms: s, window_end_ms: s + 8000, kind: 'death' })

function deps(over: Partial<LiveDeps> & { allowance?: unknown; plan?: unknown; polls?: unknown[] } = {}) {
  const emitted: LiveUpdate[] = []
  const polls = [...(over.polls ?? [])]
  const d: LiveDeps = {
    get: vi.fn(async (url: string) => {
      if (url === '/api/coach/allowances') return { status: 200, data: over.allowance ?? { key_moments: { enabled: true, remaining: 4 } } }
      return { status: 200, data: { moments: polls.length > 1 ? polls.shift() : polls[0] } }
    }),
    postJson: vi.fn(async () => ({ status: 200, data: over.plan ?? { moments: [{ round_number: 4, window: win('a', 1000) }, { round_number: 10, window: win('b', 50_000) }, { round_number: 11, window: win('c', 90_000) }] } })),
    postForm: vi.fn(async () => ({ status: 202, data: { moments: [{ id: 1, status: 'queued' }, { id: 2, status: 'queued' }] } })),
    cut: vi.fn(async () => {}),
    readFile: vi.fn(async () => new Uint8Array([1, 2, 3])),
    makeTempDir: vi.fn(async () => '/tmp/x'),
    removeDir: vi.fn(async () => {}),
    emit: (u: LiveUpdate) => { emitted.push(u) },
    sleep: vi.fn(async () => {}),
    pollBudgetMs: 60_000,
    ...over,
  }
  return { d, emitted }
}

const done = [
  { id: 1, status: 'completed', fixes: [{ title: 'Play with Omen' }] },
  { id: 2, status: 'hidden', fixes: [] },
]

describe('runLiveCoachFlow', () => {
  it('plans, cuts only the chosen windows from the local file, uploads, and reports what the coach found', async () => {
    const { d, emitted } = deps({ polls: [[{ id: 1, status: 'processing' }, { id: 2, status: 'queued' }], done] })
    const res = await runLiveCoachFlow(d, { matchId: 'abc-123-def', videoPath: '/rec/match.mp4', matchData: { killEvents: [] } })
    expect(res.state).toBe('done')
    expect(res.found).toBe(1)
    expect(d.cut).toHaveBeenCalledTimes(2) // per-match cap of 2, even though 3 were planned
    expect((d.cut as any).mock.calls[0]).toEqual(['/rec/match.mp4', 1000, 9000, '/tmp/x/moment-0.mp4'])
    expect((d.postForm as any).mock.calls[0][0]).toBe('/api/coach-flow/abc-123-def/moments')
    expect(d.removeDir).toHaveBeenCalledWith('/tmp/x')
    expect(emitted.map(e => e.state)).toEqual(['planning', 'cutting', 'uploading', 'reviewing', 'done'])
  })

  it('skips silently when the allowance is used up or key moments are off (no plan, no cut, no upload)', async () => {
    for (const allowance of [{ key_moments: { enabled: true, remaining: 0 } }, { key_moments: { enabled: false, remaining: 4 } }]) {
      const { d } = deps({ allowance })
      const res = await runLiveCoachFlow(d, { matchId: 'abc-123-def', videoPath: '/rec.mp4', matchData: {} })
      expect(res.state).toBe('skipped')
      expect(d.postJson).not.toHaveBeenCalled()
      expect(d.cut).not.toHaveBeenCalled()
      expect(d.postForm).not.toHaveBeenCalled()
    }
  })

  it('never requests more moments than the remaining allowance', async () => {
    const { d } = deps({ allowance: { key_moments: { enabled: true, remaining: 1 } }, polls: [[done[0]]] })
    await runLiveCoachFlow(d, { matchId: 'abc-123-def', videoPath: '/rec.mp4', matchData: {} })
    expect(d.cut).toHaveBeenCalledTimes(1)
  })

  it('skips bad match ids and invalid windows, and cleans up when nothing could be cut', async () => {
    const bad = deps()
    expect((await runLiveCoachFlow(bad.d, { matchId: '../x', videoPath: '/r.mp4', matchData: {} })).state).toBe('skipped')
    const { d } = deps({ cut: vi.fn(async () => { throw new Error('ffmpeg') }) })
    const res = await runLiveCoachFlow(d, { matchId: 'abc-123-def', videoPath: '/r.mp4', matchData: {} })
    expect(res).toMatchObject({ state: 'error', reason: 'clip_cut_failed' })
    expect(d.postForm).not.toHaveBeenCalled()
    expect(d.removeDir).toHaveBeenCalled()
  })

  it('times out honestly when reviews never settle', async () => {
    const { d } = deps({ polls: [[{ id: 1, status: 'processing' }]], pollBudgetMs: 10_000 })
    const res = await runLiveCoachFlow(d, { matchId: 'abc-123-def', videoPath: '/r.mp4', matchData: {} })
    expect(res).toMatchObject({ state: 'error', reason: 'timeout' })
  })
})

describe('helpers', () => {
  it('counts only coached moments with a fix and caps requests', () => {
    expect(foundCount(done as any)).toBe(1)
    expect(momentsToRequest(3, 4)).toBe(2)
    expect(momentsToRequest(3, 1)).toBe(1)
    expect(momentsToRequest(0, 4)).toBe(0)
  })
})
