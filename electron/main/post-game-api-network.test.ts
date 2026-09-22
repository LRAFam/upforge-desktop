import { EventEmitter } from 'node:events'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { MatchData } from './riot-types'

const mocks = vi.hoisted(() => ({ request: vi.fn(), reportError: vi.fn() }))
vi.mock('http', () => ({ default: { request: mocks.request } }))
vi.mock('electron-log', () => ({ default: { warn: vi.fn(), info: vi.fn() } }))
vi.mock('./error-reporter', () => ({ reportError: mocks.reportError }))
vi.mock('./match-data-payload', () => ({
  submissionContextFromTimeline: () => ({ match_data: { matchId: 'match-1' } }),
  prepareMatchDataForUpload: vi.fn(),
}))
import log from 'electron-log'
import { requestPregameBrief, requestPostGameDebrief } from './post-game-api'

class Request extends EventEmitter {
  write = vi.fn()
  end = vi.fn()
  timeout?: () => void
  setTimeout(_ms: number, callback: () => void) { this.timeout = callback }
  destroy(error: Error) { this.emit('error', error) }
}

describe('debrief network recovery', () => {
  let requests: Request[]
  let respond: ((res: EventEmitter & { statusCode: number }) => void)[]
  let send: ReturnType<typeof vi.fn>
  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
    requests = []
    respond = []
    send = vi.fn()
    mocks.request.mockImplementation((_options, callback) => {
      const req = new Request()
      requests.push(req)
      respond.push(callback)
      return req
    })
  })
  afterEach(() => vi.useRealTimers())
  async function start(token: string | null = 'test-token') {
    const pending = requestPostGameDebrief({
      riotName: 'Player', riotTag: 'EU', agent: 'Sage', map: 'Ascent',
      timeline: {} as MatchData, sendToWindow: send, getToken: () => token,
      apiUrl: 'http://localhost',
    })
    await vi.advanceTimersByTimeAsync(0)
    return { pending }
  }
  function response(index: number, status: number, body: string) {
    const res = Object.assign(new EventEmitter(), { statusCode: status })
    respond[index](res)
    res.emit('data', body)
    res.emit('end')
    return res
  }
  it('keeps loading after a reset and delivers the successful retry', async () => {
    const { pending } = await start()
    requests[0].emit('error', Object.assign(new Error('read ECONNRESET'), { code: 'ECONNRESET' }))
    expect(send).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(2000)
    response(1, 200, JSON.stringify({ debrief_text: 'Your debrief' }))
    await pending
    expect(send).toHaveBeenCalledTimes(1)
    expect(send).toHaveBeenCalledWith('post-game:debrief', expect.objectContaining({ debrief: 'Your debrief' }))
    expect(mocks.reportError).not.toHaveBeenCalled()
  })
  it('handles a reset during the response and ignores duplicate error events', async () => {
    const { pending } = await start()
    const res = Object.assign(new EventEmitter(), { statusCode: 200 })
    respond[0](res)
    res.emit('data', '{')
    res.emit('error', Object.assign(new Error('aborted'), { code: 'ECONNRESET' }))
    requests[0].emit('error', new Error('socket hang up'))
    expect(send).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(2000)
    requests[1].emit('error', Object.assign(new Error('read ECONNRESET'), { code: 'ECONNRESET' }))
    requests[1].emit('error', new Error('duplicate'))
    await pending
    expect(send).toHaveBeenCalledTimes(1)
    expect(send).toHaveBeenCalledWith('post-game:debrief', null)
    expect(mocks.reportError).toHaveBeenCalledTimes(1)
    expect(mocks.reportError).toHaveBeenCalledWith(expect.objectContaining({
      extra: expect.objectContaining({ code: 'ECONNRESET', attempt: 2 }),
    }))
  })
  it('settles timeouts once and fails only after both attempts', async () => {
    const { pending } = await start()
    requests[0].timeout?.()
    expect(send).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(2000)
    requests[1].timeout?.()
    await pending
    expect(send).toHaveBeenCalledTimes(1)
    expect(mocks.reportError).toHaveBeenCalledTimes(1)
  })
  it('keeps loading across gateway errors, including non-JSON responses', async () => {
    const { pending } = await start()
    response(0, 502, '<html>Bad gateway</html>')
    expect(send).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(2000)
    response(1, 200, JSON.stringify({ skipped: true, reason: 'no_new_evidence' }))
    await pending
    expect(send).toHaveBeenCalledTimes(1)
    expect(send).toHaveBeenCalledWith('post-game:debrief', { skipped: true, reason: 'no_new_evidence' })
  })
  it.each([400, 401, 403, 422, 500])('reports terminal HTTP %i without retrying', async (status) => {
    const { pending } = await start()
    response(0, status, JSON.stringify({ message: 'Request rejected' }))
    await pending
    expect(send).toHaveBeenCalledTimes(1)
    expect(mocks.reportError).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(2000)
    expect(requests).toHaveLength(1)
  })
  it('reports exhausted gateway errors once', async () => {
    const { pending } = await start()
    response(0, 503, JSON.stringify({ message: 'Unavailable' }))
    expect(send).not.toHaveBeenCalled()
    expect(mocks.reportError).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(2000)
    response(1, 504, '<html>Gateway timeout</html>')
    await pending
    expect(send).toHaveBeenCalledTimes(1)
    expect(mocks.reportError).toHaveBeenCalledWith(expect.objectContaining({
      extra: expect.objectContaining({ statusCode: 504, attempt: 2 }),
    }))
  })
  it.each(['{"message":"limit"}', '<html>Too many requests</html>'])('does not retry or report rate limits: %s', async (body) => {
    const { pending } = await start()
    response(0, 429, body)
    await vi.advanceTimersByTimeAsync(2000)
    expect(requests).toHaveLength(1)
    await pending
    expect(send).toHaveBeenCalledTimes(1)
    expect(mocks.reportError).not.toHaveBeenCalled()
  })
  it.each(['null', '{}', '{"debrief_text":42}', '{"debrief_text":" "}', '{"skipped":"yes"}', 'invalid'])('rejects invalid response contracts: %s', async (body) => {
    const { pending } = await start()
    response(0, 200, body)
    expect(send).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(2000)
    response(1, 200, body)
    await pending
    expect(send).toHaveBeenCalledTimes(1)
    expect(send).toHaveBeenCalledWith('post-game:debrief', null)
    expect(mocks.reportError).toHaveBeenCalledTimes(1)
  })

  it('ends loading immediately when the login token is missing', async () => {
    const { pending } = await start(null)
    await pending
    expect(requests).toHaveLength(0)
    expect(send).toHaveBeenCalledWith('post-game:debrief', null)
  })
  it('handles pregame response resets without an unhandled error', async () => {
    requestPregameBrief(() => 'test-token', vi.fn(), undefined, 'http://localhost')
    await vi.advanceTimersByTimeAsync(0)
    const res = Object.assign(new EventEmitter(), { statusCode: 200 })
    respond[0](res)
    res.emit('error', Object.assign(new Error('aborted'), { code: 'ECONNRESET' }))
    await vi.advanceTimersByTimeAsync(0)
    expect(log.warn).toHaveBeenCalledWith(
      '[PregameBrief] API request failed; browser fallback suppressed during game:', 'aborted',
    )
  })

})
