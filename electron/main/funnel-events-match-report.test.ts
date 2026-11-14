import { describe, expect, it, vi } from 'vitest'

vi.mock('electron-log', () => ({ default: { debug: vi.fn(), info: vi.fn(), warn: vi.fn() } }))

import { initFunnelEvents, trackMatchReportOpened, trackMatchReportVideoClicked } from './funnel-events'

function fakeAuth() {
  const post = vi.fn().mockResolvedValue({ data: { success: true } })
  return { post, auth: { getToken: () => 'tok', getApi: () => ({ post }) } }
}
const events = (post: ReturnType<typeof vi.fn>) => post.mock.calls.map(c => (c[1] as { event: string }).event)

describe('free match report funnel events', () => {
  it('sends match_report_opened with the game and what the report offered for the recording', async () => {
    const { post, auth } = fakeAuth()
    initFunnelEvents(auth as never, '9.9.9')
    trackMatchReportOpened({ game: 'valorant', video: 'start' })
    await Promise.resolve()
    expect(events(post)).toEqual(['match_report_opened'])
    expect(post.mock.calls[0][1]).toMatchObject({ channel: 'desktop', properties: { game: 'valorant', video: 'start' } })
  })

  it('sends match_report_video_clicked when a video action is pressed', async () => {
    const { post, auth } = fakeAuth()
    initFunnelEvents(auth as never, '9.9.9')
    trackMatchReportVideoClicked({ game: 'valorant', video: 'upgrade' })
    await Promise.resolve()
    expect(events(post)).toEqual(['match_report_video_clicked'])
    expect(post.mock.calls[0][1]).toMatchObject({ properties: { game: 'valorant', video: 'upgrade' } })
  })

  it('keeps the old video-report event name out of it', async () => {
    const { post, auth } = fakeAuth()
    initFunnelEvents(auth as never, '9.9.9')
    trackMatchReportOpened({ game: 'lol', video: 'none' })
    await Promise.resolve()
    expect(events(post)).not.toContain('report_opened')
  })

  it('sends only the two known fields, and nothing at all for unknown values', async () => {
    const { post, auth } = fakeAuth()
    initFunnelEvents(auth as never, '9.9.9')
    trackMatchReportOpened({ game: 'valorant', video: 'open', match_id: 'abc', note: 'x' })
    trackMatchReportOpened({ game: 'chess', video: 'open' })
    trackMatchReportVideoClicked({ game: 'valorant', video: 'anything' })
    trackMatchReportVideoClicked(undefined)
    await Promise.resolve()
    expect(post).toHaveBeenCalledTimes(1)
    expect((post.mock.calls[0][1] as { properties: unknown }).properties).toEqual({ game: 'valorant', video: 'open' })
  })
})
