import { EventEmitter } from 'node:events'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AuthManager } from './auth-manager'

const mocks = vi.hoisted(() => ({ request: vi.fn(), get: vi.fn() }))
vi.mock('http', () => ({ default: { request: mocks.request, get: mocks.get } }))
vi.mock('https', () => ({ default: { request: mocks.request, get: mocks.get, Agent: class {} } }))
vi.mock('electron', () => ({ app: { getPath: () => '/tmp', getAppPath: () => '/tmp', isPackaged: false } }))
vi.mock('./pipeline-errors', () => ({ reportPipelineError: vi.fn() }))
import { UploadManager, type UploadOptions } from './upload-manager'
import { UploadRequestError, apiRequestTimeout } from './upload-request-errors'
import { classifyActivationError } from './activation-error-codes'
import { classifyAnalysisFailure } from '../../src/lib/analysis-failure-messages'
import { isLikelyNetworkFailure } from './network-diagnostics'

const completeUrl = 'https://api.upforge.gg/api/desktop-submissions/complete'
type Internals = {
  _apiPost(url: string, body: string, token: string): Promise<Record<string, unknown>>
  _apiPostOnce(url: string, body: string, token: string): Promise<Record<string, unknown>>
  _isRetryableUploadError(error: unknown): boolean
  _normalizeUploadError(error: unknown): Error
  _doUpload(options: UploadOptions): Promise<unknown>
  _doUploadOnce(options: UploadOptions, attempt: number): Promise<{ job_id: string }>
  _putPartToS3(url: string, body: Buffer): Promise<string>
  _putPartToS3Once(url: string, body: Buffer, signal: AbortSignal): Promise<string>
}

class Request extends EventEmitter {
  write = vi.fn()
  end = vi.fn()
  timeout?: () => void
  setTimeout(_ms: number, callback: () => void) { this.timeout = callback; return this }
  destroy(error: Error) { this.emit('error', error); this.emit('close'); return this }
}

let manager: UploadManager
let internal: Internals
let activeToken: string
let requests: Request[]
let responses: Array<(res: EventEmitter & { statusCode: number; headers: Record<string, string> }) => void>

beforeEach(() => {
  vi.clearAllMocks()
  activeToken = 'account-a'
  manager = new UploadManager({ getToken: () => activeToken, handleSessionRejection: vi.fn() } as unknown as AuthManager)
  internal = manager as unknown as Internals
  requests = []
  responses = []
  const request = (_options: unknown, callback: typeof responses[number]) => {
    const req = new Request()
    requests.push(req)
    responses.push(callback)
    return req
  }
  mocks.request.mockImplementation(request)
  mocks.get.mockImplementation(request)
})
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers() })

describe('upload API timeout safety', () => {
  it('identifies the timed-out stage and host without replaying a potentially accepted presign', async () => {
    const pending = internal._apiPost('https://api.upforge.gg/api/desktop-submissions/presign?token=secret', '{}', activeToken).catch(error => error)
    requests[0]!.timeout!()
    const error = await pending
    expect(error).toMatchObject({ code: 'ETIMEDOUT', diagnostics: { stage: 'presign', hostname: 'api.upforge.gg' } })
    expect(isLikelyNetworkFailure(error.message)).toBe(true)
    expect(mocks.request).toHaveBeenCalledOnce()
  })

  it.each([
    ['/api/desktop-submissions/presign', 'ECONNRESET'],
    ['/api/desktop-submissions/presign', 'EPIPE'],
    ['/api/recordings/archive/owned-archive/analyse', 'ECONNRESET'],
    ['/api/recordings/archive/owned-archive/analyse', 'EPIPE'],
    ['/api/desktop-submissions/owned-job/retry', 'ECONNRESET'],
    ['/api/desktop-submissions/owned-job/retry', 'EPIPE'],
  ])('sends %s only once after a potentially accepted %s response is lost', async (route, code) => {
    const pending = internal._apiPost(`https://api.upforge.gg${route}`, '{}', activeToken).catch(error => error)
    // A response-stream reset can occur after the server has already committed.
    const res = Object.assign(new EventEmitter(), { statusCode: 200, headers: {} })
    responses[0]!(res)
    res.emit('data', '{')
    res.emit('error', Object.assign(new Error('aborted'), { code }))
    const error = await pending
    expect(error).toMatchObject({ code, diagnostics: { hostname: 'api.upforge.gg' } })
    expect(internal._isRetryableUploadError(error)).toBe(false)
    expect(classifyActivationError(error.message).definition).toMatchObject({ recoveryAction: 'open_dashboard', retryable: false })
    expect(classifyAnalysisFailure(error.message)).toMatchObject({ canRetry: false, creditRefunded: false })
    expect(mocks.request).toHaveBeenCalledOnce()
  })

  it('does not start another full upload after socket hangup and retains the original recording', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'upload-uncertain-'))
    const videoPath = path.join(dir, 'match.mp4')
    fs.writeFileSync(videoPath, 'original recording')
    try {
      const once = vi.spyOn(internal, '_doUploadOnce').mockImplementation(async () => {
        await internal._apiPost('https://api.upforge.gg/api/desktop-submissions/presign', '{}', activeToken)
        return { job_id: 'unused' }
      })
      const pending = internal._doUpload({ videoPath, onProgress: vi.fn() } as unknown as UploadOptions)
      const assertion = expect(pending).rejects.toBeInstanceOf(UploadRequestError)
      requests[0]!.destroy(new Error('socket hang up'))
      await assertion
      expect(once).toHaveBeenCalledOnce()
      expect(mocks.request).toHaveBeenCalledOnce()
      expect(fs.readFileSync(videoPath, 'utf8')).toBe('original recording')
    } finally { fs.rmSync(dir, { recursive: true, force: true }) }
  })

  it('reconciles a malformed HTTP200 complete response instead of advertising another upload', async () => {
    const poll = vi.spyOn(manager, 'pollStatus').mockResolvedValue({ job_id: 'owned-job', status: 'queued' })
    const pending = internal._apiPost(completeUrl, '{"job_id":"owned-job"}', activeToken)
    const res = Object.assign(new EventEmitter(), { statusCode: 200, headers: {} })
    responses[0]!(res)
    res.emit('data', '<html>response lost</html>')
    res.emit('end')
    await expect(pending).resolves.toEqual({ job_id: 'owned-job', status: 'queued' })
    expect(poll).toHaveBeenCalledOnce()
    expect(mocks.request).toHaveBeenCalledOnce()
  })

  it.each([{}, null, { job_id: 'another-job', status: 'queued' }, { job_id: 'owned-job', status: 'failed' }])(
    'requires an accepted matching job in a parsed HTTP200 response: %j', async payload => {
      for (const status of ['uploading', 'failed']) {
        const post = vi.spyOn(internal, '_apiPostOnce').mockResolvedValue(payload as unknown as Record<string, unknown>)
        const poll = vi.spyOn(manager, 'pollStatus').mockResolvedValue({ job_id: 'owned-job', status })
        await expect(internal._apiPost(completeUrl, '{"job_id":"owned-job"}', activeToken)).rejects.toMatchObject({ code: 'COMPLETION_UNCONFIRMED' })
        expect(post).toHaveBeenCalledOnce()
        expect(poll).toHaveBeenCalledWith('owned-job')
        post.mockRestore()
        poll.mockRestore()
      }
    },
  )

  it('accepts the normal complete response contract without polling', async () => {
    const payload = { job_id: 'owned-job', status: 'queued', message: 'Analysis queued' }
    const post = vi.spyOn(internal, '_apiPostOnce').mockResolvedValue(payload)
    const poll = vi.spyOn(manager, 'pollStatus')
    await expect(internal._apiPost(completeUrl, '{"job_id":"owned-job"}', activeToken)).resolves.toEqual(payload)
    expect(post).toHaveBeenCalledOnce()
    expect(poll).not.toHaveBeenCalled()
  })

  it('retains safe retries for an S3 part reset', async () => {
    vi.useFakeTimers()
    const put = vi.spyOn(internal, '_putPartToS3Once').mockRejectedValueOnce(new Error('socket hang up')).mockResolvedValueOnce('etag')
    const pending = internal._putPartToS3('https://bucket.s3.amazonaws.com/object', Buffer.from('part'))
    await vi.advanceTimersByTimeAsync(2_000)
    await expect(pending).resolves.toBe('etag')
    expect(put).toHaveBeenCalledTimes(2)
  })

  it.each(['queued', 'processing', 'completed'])('reconciles lost complete success in %s without resending the POST', async status => {
    const post = vi.spyOn(internal, '_apiPostOnce').mockRejectedValue(apiRequestTimeout(completeUrl))
    const poll = vi.spyOn(manager, 'pollStatus').mockResolvedValue({ job_id: 'owned-job', status })
    await expect(internal._apiPost(completeUrl, JSON.stringify({ job_id: 'owned-job' }), activeToken))
      .resolves.toEqual({ job_id: 'owned-job', status })
    expect(post).toHaveBeenCalledOnce()
    expect(poll).toHaveBeenCalledWith('owned-job')
  })

  it.each(['uploading', 'failed', 'wrong-job', 'status-offline'])('does not invent success or retry the full upload when reconciliation is %s', async outcome => {
    const post = vi.spyOn(internal, '_apiPostOnce').mockRejectedValue(new Error('socket hang up'))
    const poll = vi.spyOn(manager, 'pollStatus')
    if (outcome === 'status-offline') poll.mockRejectedValue(new Error('offline'))
    else poll.mockResolvedValue({ job_id: outcome === 'wrong-job' ? 'other-job' : 'owned-job', status: ['uploading', 'failed'].includes(outcome) ? outcome : 'queued' })
    const error = await internal._apiPost(completeUrl, JSON.stringify({ job_id: 'owned-job' }), activeToken).catch(error => error)
    expect(error).toBeInstanceOf(UploadRequestError)
    expect(error.code).toBe('COMPLETION_UNCONFIRMED')
    expect(internal._isRetryableUploadError(error)).toBe(false)
    expect(internal._normalizeUploadError(error)).toBe(error)
    expect(classifyActivationError(error.message).definition).toMatchObject({ recoveryAction: 'open_dashboard', retryable: false })
    expect(classifyAnalysisFailure(error.message)).toMatchObject({ canRetry: false, creditRefunded: false })
    expect(post).toHaveBeenCalledOnce()
  })

  it('does not accept reconciliation after the account changes', async () => {
    vi.spyOn(internal, '_apiPostOnce').mockRejectedValue(apiRequestTimeout(completeUrl))
    vi.spyOn(manager, 'pollStatus').mockImplementation(async () => { activeToken = 'account-b'; return { job_id: 'owned-job', status: 'queued' } })
    await expect(internal._apiPost(completeUrl, '{"job_id":"owned-job"}', activeToken)).rejects.toMatchObject({ code: 'COMPLETION_UNCONFIRMED' })
  })

  it('honors cancellation while reconciliation is in flight', async () => {
    vi.spyOn(internal, '_apiPostOnce').mockRejectedValue(apiRequestTimeout(completeUrl))
    vi.spyOn(manager, 'pollStatus').mockImplementation(async () => { manager.abort(); return { job_id: 'owned-job', status: 'queued' } })
    await expect(internal._apiPost(completeUrl, '{"job_id":"owned-job"}', activeToken)).rejects.toMatchObject({ failureCode: 'upload_aborted_by_user' })
  })

  it('keeps rate limits and validation errors out of completion reconciliation', async () => {
    const expected = Object.assign(new Error('Invalid match data'), { statusCode: 422 })
    vi.spyOn(internal, '_apiPostOnce').mockRejectedValue(expected)
    const poll = vi.spyOn(manager, 'pollStatus')
    await expect(internal._apiPost(completeUrl, '{"job_id":"owned-job"}', activeToken)).rejects.toBe(expected)
    expect(poll).not.toHaveBeenCalled()
  })

  it('bounds the status read used by reconciliation', async () => {
    vi.useFakeTimers()
    const pending = manager.pollStatus('owned-job')
    const assertion = expect(pending).rejects.toThrow('Upload status request timed out')
    await vi.advanceTimersByTimeAsync(30_000)
    await assertion
  })
})

describe('TLS upload diagnostics', () => {
  it.each(['api', 's3_part'])('identifies %s failures without disabling verification or leaking credentials', async stage => {
    const signedUrl = 'https://bucket.s3.amazonaws.com/private-key?X-Amz-Signature=secret'
    const pending = stage === 'api'
      ? internal._apiPost('https://api.upforge.gg/api/desktop-submissions/presign', '{}', activeToken)
      : internal._putPartToS3Once(signedUrl, Buffer.from('video'), new AbortController().signal)
    const caught = pending.catch(error => error)
    requests[0]!.destroy(Object.assign(new Error(`write EPROTO SSL_HANDSHAKE_FAILURE ${signedUrl}`), { code: 'EPROTO' }))
    const error = await caught
    expect(error).toBeInstanceOf(UploadRequestError)
    expect(error.diagnostics).toMatchObject({ stage: stage === 'api' ? 'presign' : 's3_part', code: 'EPROTO' })
    expect(JSON.stringify(error)).not.toContain('secret')
    expect(JSON.stringify(error)).not.toContain('private-key')
    expect(internal._isRetryableUploadError(error)).toBe(false)
    expect(mocks.request).toHaveBeenCalledOnce()
    expect(mocks.request.mock.calls[0]![0]).not.toHaveProperty('rejectUnauthorized', false)
  })
})
