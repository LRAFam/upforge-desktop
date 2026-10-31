import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ app: { isPackaged: false, getAppPath: () => process.cwd(), getPath: () => process.cwd() } }))
import { EMPTY_SYNC_STATE, planUploads, syncMatchReports, type SyncState } from './match-report-sync'
import type { RecentMatchFetchResult } from './recent-match-export'
import type { Focus, FocusUpdate } from '../../src/lib/focus'

const T = (id: string, start: number | null, ok = true) => ({ matchId: id, gameStartTimeMs: start, ok })
const focus: Focus = {
  id: 1, label: 'Deaths traded', metric: 'traded_death_rate', better: 'higher', baseline: 0, target: 0.15,
  checks: [], progress: { games_played: 0, hits: 0, games_required: 3, hits_required: 2, status: 'active' },
  started_at: null, completed_at: null,
}
const cached: FocusUpdate = {
  match_id: 'old', focus, focus_event: 'created',
  report: { notes: { headline: { finding_id: 'trade', text: 'Trade together.' }, next_action: { finding_id: 'trade', text: 'Wait for a teammate.' } } },
}

describe('planUploads', () => {
  it('first sync: newest match is live, older ones are history', () => {
    expect(planUploads([T('b', 200), T('a', 100), T('c', 300)], EMPTY_SYNC_STATE)).toEqual([
      { matchId: 'a', startMs: 100, history: true },
      { matchId: 'b', startMs: 200, history: true },
      { matchId: 'c', startMs: 300, history: false },
    ])
  })

  it('later syncs: only matches newer than the last sync count; failed and done ones are skipped', () => {
    const state: SyncState = { synced: ['a', 'c'], newestSyncedStartMs: 300 }
    expect(planUploads([T('a', 100), T('b', 200), T('c', 300), T('d', 400), T('e', 500, false)], state)).toEqual([
      { matchId: 'b', startMs: 200, history: true },
      { matchId: 'd', startMs: 400, history: false },
    ])
  })
})

function fetched(ids: Array<[string, number]>): RecentMatchFetchResult {
  return { ok: true, matches: ids.map(([id, start]) => ({ matchId: id, gameStartTimeMs: start, fetchMs: 1, timeline: { id } as never })) }
}

function harness(result: RecentMatchFetchResult, post: (body: any) => { status: number; data: any } | Promise<never>, state = EMPTY_SYNC_STATE) {
  let saved: SyncState | null = null
  const posts: any[] = []
  const deps = {
    fetchRecent: vi.fn().mockResolvedValue(result),
    post: vi.fn(async (body: any) => { posts.push(body); return post(body) }),
    loadState: vi.fn().mockResolvedValue(state),
    saveState: vi.fn(async (s: SyncState) => { saved = s }),
    serialize: (t: any) => JSON.stringify({ match_data: { puuid: 'me', roundSummaries: [{}], id: t.id } }),
  }
  return { deps, posts, saved: () => saved }
}

describe('syncMatchReports', () => {
  it('sends history first, returns the live match focus, and remembers what was sent', async () => {
    const ok = (body: any) => ({ status: 200, data: { success: true, focus: body.history ? null : { label: 'Opening deaths' }, focus_event: body.history ? null : 'created', report: { notes: {} } } })
    const h = harness(fetched([['new', 300], ['old', 100]]), ok)
    const res = await syncMatchReports(h.deps)
    expect(h.posts.map(p => [p.match_id, p.history, p.played_at_ms])).toEqual([['old', true, 100], ['new', false, 300]])
    expect(h.posts[0].match_data).toEqual({ puuid: 'me', roundSummaries: [{}], id: 'old' })
    expect(res).toMatchObject({ ok: true, uploaded: 2, skipped: 0, latest: { match_id: 'new', focus_event: 'created' } })
    expect(h.saved()).toEqual({ synced: ['old', 'new'], newestSyncedStartMs: 300, latest: res.latest })
  })

  it('keeps whether the match was played on the main account or an alt', async () => {
    const alt = () => ({ status: 200, data: { success: true, focus: null, focus_event: null, account: { is_main: false }, report: { notes: {} } } })
    const h = harness(fetched([['new', 300]]), alt)
    const res = await syncMatchReports(h.deps)
    expect(res.latest).toMatchObject({ match_id: 'new', focus_event: null, account: { is_main: false } })
  })

  it('skips matches the API rejects for good, and stops (to retry later) on server errors', async () => {
    const h = harness(fetched([['a', 100], ['b', 200], ['c', 300]]), (body: any) =>
      body.match_id === 'a' ? { status: 422, data: { error: 'not_your_match' } } : { status: 502, data: {} })
    const res = await syncMatchReports(h.deps)
    expect(res).toMatchObject({ uploaded: 0, skipped: 1 })
    expect(res).toMatchObject({ ok: false, reason: 'http_502' })
    expect(h.posts).toHaveLength(2)
    expect(h.saved()?.synced).toEqual(['a'])
  })

  it('does nothing when Riot history is unavailable', async () => {
    const h = harness({ ok: false, reason: 'riot_client_unavailable', matches: [] }, () => ({ status: 200, data: {} }))
    expect(await syncMatchReports(h.deps)).toMatchObject({ ok: false, reason: 'riot_client_unavailable' })
    expect(h.deps.post).not.toHaveBeenCalled()
  })

  it('normalizes the Riot authentication failure for the dashboard', async () => {
    const h = harness({ ok: false, reason: 'riot_auth_missing — open the Riot Client and sign in', matches: [] }, () => ({ status: 200, data: {} }))
    expect(await syncMatchReports(h.deps)).toMatchObject({ ok: false, reason: 'riot_client_unavailable' })
  })

  it('never re-tries matches that fail the data-quality gate', async () => {
    const h = harness(fetched([['bad', 100]]), () => ({ status: 200, data: { success: true } }))
    h.deps.serialize = () => { throw new Error('coaching_validation_failed') }
    expect(await syncMatchReports(h.deps)).toMatchObject({ uploaded: 0, skipped: 1 })
    expect(h.saved()?.synced).toEqual(['bad'])
  })

  it('preserves coach notes when there are no new matches, including after reloading saved state', async () => {
    const h = harness(fetched([['old', 100]]), () => ({ status: 200, data: {} }), { synced: ['old'], newestSyncedStartMs: 100, latest: cached })
    expect(await syncMatchReports(h.deps)).toMatchObject({ ok: true, uploaded: 0, latest: null })
    expect(h.saved()?.latest).toEqual(cached)
    const restarted = harness(fetched([['old', 100]]), () => ({ status: 200, data: {} }), JSON.parse(JSON.stringify(h.saved())))
    await syncMatchReports(restarted.deps)
    expect(restarted.saved()?.latest?.report?.notes?.next_action?.text).toBe('Wait for a teammate.')
  })

  it('retains an observed completed focus when a later match starts a new focus', async () => {
    const completed = { ...focus, progress: { ...focus.progress, status: 'achieved', hits: 2, games_played: 2 } }
    const h = harness(fetched([['old', 100], ['done', 200], ['new', 300]]), body => ({
      status: 200, data: { success: true, focus: body.match_id === 'done' ? completed : { ...focus, id: 2 }, focus_event: body.match_id === 'done' ? 'achieved' : 'created', report: cached.report },
    }), { synced: ['old'], newestSyncedStartMs: 100, latest: cached })
    const onReport = vi.fn()
    const result = await syncMatchReports({ ...h.deps, onReport })
    expect(onReport).toHaveBeenCalledTimes(2)
    expect(result.latest?.previous_focus).toEqual(completed)
    expect(h.saved()?.latest).toEqual(result.latest)
  })

  it('keeps a successfully uploaded report when a subsequent upload fails and remains retryable', async () => {
    const h = harness(fetched([['first', 200], ['failed', 300]]), body => body.match_id === 'first'
      ? { status: 200, data: { success: true, focus, report: cached.report } }
      : { status: 500, data: {} }, { synced: ['old'], newestSyncedStartMs: 100, latest: cached })
    expect(await syncMatchReports(h.deps)).toMatchObject({ ok: false, reason: 'http_500', uploaded: 1, latest: { match_id: 'first' } })
    expect(h.saved()?.synced).toEqual(['old', 'first'])
    expect(h.saved()?.latest?.match_id).toBe('first')
  })

  it('reports network and account mismatch failures instead of a successful empty sync', async () => {
    const network = harness(fetched([['new', 200]]), async () => { throw new Error('private transport details') })
    expect(await syncMatchReports(network.deps)).toMatchObject({ ok: false, reason: 'network_error', uploaded: 0 })
    expect(network.saved()?.synced).toEqual([])
    const rejected = harness(fetched([['new', 200]]), () => ({ status: 422, data: { error: 'not_your_match' } }))
    expect(await syncMatchReports(rejected.deps)).toMatchObject({ ok: false, reason: 'not_your_match', skipped: 1 })
  })
})
