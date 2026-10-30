import { describe, expect, it, vi } from 'vitest'

vi.mock('electron-log', () => ({ default: { debug: vi.fn(), info: vi.fn(), warn: vi.fn() } }))

import { initFunnelEvents, trackFirstMatchSynced, trackPostgameOpened, trackRecordingSetupPassed } from './funnel-events'

function fakeAuth() {
  const post = vi.fn().mockResolvedValue({ data: { success: true } })
  return { post, auth: { getToken: () => 'tok', getApi: () => ({ post }) } }
}
const events = (post: ReturnType<typeof vi.fn>) => post.mock.calls.map(c => (c[1] as { event: string }).event)

describe('board 11b desktop funnel events', () => {
  it('sends postgame_opened with the game', async () => {
    const { post, auth } = fakeAuth()
    initFunnelEvents(auth as never, '9.9.9')
    trackPostgameOpened('valorant')
    await Promise.resolve()
    expect(events(post)).toEqual(['postgame_opened'])
    expect(post.mock.calls[0][1]).toMatchObject({ channel: 'desktop', properties: { game: 'valorant' } })
  })

  it('sends first_match_synced only when something was uploaded', async () => {
    const { post, auth } = fakeAuth()
    initFunnelEvents(auth as never, '9.9.9')
    trackFirstMatchSynced(0)
    trackFirstMatchSynced(2)
    await Promise.resolve()
    expect(events(post)).toEqual(['first_match_synced'])
  })

  it('a passed recording check also counts as recording_enabled', async () => {
    const { post, auth } = fakeAuth()
    initFunnelEvents(auth as never, '9.9.9')
    trackRecordingSetupPassed('cs2')
    await Promise.resolve()
    expect(events(post)).toEqual(['recording_setup_passed', 'recording_enabled'])
  })
})
