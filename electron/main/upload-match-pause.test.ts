import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import http from 'http'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { backgroundWork } from './background-work'
import type { AuthManager } from './auth-manager'
vi.mock('electron', () => ({ app: { getPath: () => os.tmpdir(), getAppPath: () => os.tmpdir(), isPackaged: false } }))
import { UploadManager, type UploadOptions } from './upload-manager'

type Internals = {
  _apiPost: (url: string, body: string, token: string) => Promise<Record<string, unknown>>
  _putToS3Multipart: (file: string, size: number, parts: { part_number: number; upload_url: string }[], partSize: number, progress: (n: number) => void, concurrency: number) => Promise<unknown>
}
let playing = false
let dir: string
let server: http.Server
let url: string
let handle: (req: http.IncomingMessage, res: http.ServerResponse) => void
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))
async function until(check: () => boolean) {
  for (let i = 0; i < 100 && !check(); i++) await delay(10)
  expect(check()).toBe(true)
}
beforeEach(async () => {
  playing = false
  backgroundWork.configure(() => playing)
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'upforge-pause-test-'))
  server = http.createServer((req, res) => handle(req, res))
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  url = `http://127.0.0.1:${(server.address() as { port: number }).port}`
})
afterEach(async () => {
  backgroundWork.cancel()
  backgroundWork.configure(() => false)
  server.closeAllConnections()
  await new Promise<void>(resolve => server.close(() => resolve()))
  fs.rmSync(dir, { recursive: true, force: true })
})
function setupArchive() {
  const file = path.join(dir, 'vod.mp4')
  fs.writeFileSync(file, Buffer.alloc(1024 * 1024))
  const manager = new UploadManager({ getToken: () => 'test-token' } as AuthManager)
  const internal = manager as unknown as Internals
  const api = vi.fn(async (endpoint: string) => endpoint.endsWith('/presign')
    ? { archive_id: 'archive', upload_url: `${url}/vod` }
    : {})
  internal._apiPost = api
  const opts: UploadOptions = { videoPath: file, riotName: 'Test', riotTag: 'EU', game: 'valorant', map: null, agent: null, timeline: null, onProgress: vi.fn() }
  return { manager, internal, api, opts, file }
}
describe('VOD cloud transfer match protection', () => {
  it('cancels failed multipart siblings and preserves another upload on the same manager', async () => {
    const { internal, file } = setupArchive()
    const requests: string[] = []
    let firstResponse: http.ServerResponse | undefined
    let safeResponse: http.ServerResponse | undefined
    let siblingClosed = false
    let safeClosed = false
    handle = (req, res) => {
      requests.push(req.url!)
      req.resume()
      if (req.url === '/bad1') firstResponse = res
      if (req.url === '/bad2') res.on('close', () => { siblingClosed = true })
      if (req.url === '/safe') {
        safeResponse = res
        res.on('close', () => { safeClosed = true })
      }
    }
    const safe = internal._putToS3Multipart(file, 100, [{ part_number: 1, upload_url: `${url}/safe` }], 100, () => {}, 1)
    const bad = internal._putToS3Multipart(file, 300, [1, 2, 3].map(n => ({ part_number: n, upload_url: `${url}/bad${n}` })), 100, () => {}, 2)
    const rejected = expect(bad).rejects.toThrow('HTTP 400')
    await until(() => requests.includes('/bad2') && !!firstResponse && !!safeResponse)
    firstResponse!.statusCode = 400
    firstResponse!.end('invalid upload')
    await rejected
    await until(() => siblingClosed)
    expect(requests).not.toContain('/bad3')
    expect(safeClosed).toBe(false)
    safeResponse!.setHeader('ETag', 'safe-etag')
    safeResponse!.end()
    await expect(safe).resolves.toHaveLength(1)
  })

  it('interrupts an archive PUT and automatically restarts it between matches without failing the backup', async () => {
    const { manager, api, opts } = setupArchive()
    let requests = 0
    let closed = false
    handle = (req, res) => {
      requests++
      req.resume()
      if (requests === 1) {
        res.on('close', () => { closed = true })
        playing = true
        backgroundWork.pause()
      } else req.on('end', () => res.end())
    }
    const upload = manager.archiveUpload(opts)
    await until(() => closed)
    await delay(300)
    expect(requests).toBe(1)
    expect(api).toHaveBeenCalledTimes(1)
    playing = false
    await expect(upload).resolves.toMatchObject({ archive_id: 'archive' })
    expect(requests).toBe(2)
    expect(api).toHaveBeenCalledTimes(2)
  })

  it('blocks a backup that reaches the transfer after a match starts during presigning', async () => {
    const { manager, internal, opts } = setupArchive()
    let requests = 0
    internal._apiPost = vi.fn(async endpoint => {
      if (endpoint.endsWith('/presign')) { playing = true; return { archive_id: 'a', upload_url: url } }
      return {}
    })
    handle = (req, res) => { requests++; req.resume(); req.on('end', () => res.end()) }
    const upload = manager.archiveUpload(opts)
    await until(() => playing)
    await delay(300)
    expect(requests).toBe(0)
    playing = false
    await upload
    expect(requests).toBe(1)
  })

  it('honours explicit cancellation while paused even if another upload resets the shared flag', async () => {
    const { manager, opts } = setupArchive()
    playing = true
    const upload = manager.archiveUpload(opts)
    const rejected = expect(upload).rejects.toThrow('cancelled')
    manager.abort()
    const second = manager.archiveUpload(opts)
    const secondRejected = expect(second).rejects.toThrow('cancelled')
    manager.abort()
    await rejected
    await secondRejected
  })

  it('keeps completed multipart parts when the next part is interrupted', async () => {
    const { internal, file } = setupArchive()
    const counts = new Map<string, number>()
    handle = (req, res) => {
      const key = req.url!
      counts.set(key, (counts.get(key) ?? 0) + 1)
      req.resume()
      if (key === '/2' && counts.get(key) === 1) { playing = true; backgroundWork.pause() }
      else req.on('end', () => { res.setHeader('ETag', `etag-${key}`); res.end() })
    }
    const upload = internal._putToS3Multipart(file, 1024 * 1024, [1, 2].map(n => ({ part_number: n, upload_url: `${url}/${n}` })), 512 * 1024, () => {}, 1)
    await until(() => playing)
    await delay(300)
    expect(counts.get('/1')).toBe(1)
    expect(counts.get('/2')).toBe(1)
    playing = false
    await expect(upload).resolves.toHaveLength(2)
    expect(counts.get('/1')).toBe(1)
    expect(counts.get('/2')).toBe(2)
  })

  it('refreshes an archive URL that expires during a match', async () => {
    const { manager, internal, opts } = setupArchive()
    let presigns = 0
    let requests = 0
    internal._apiPost = vi.fn(async endpoint => {
      if (!endpoint.endsWith('/presign')) return {}
      presigns++
      if (presigns === 1) playing = true
      return { archive_id: `archive-${presigns}`, upload_url: `${url}/${presigns}` }
    })
    handle = (req, res) => {
      requests++
      req.resume()
      req.on('end', () => {
        res.statusCode = req.url === '/1' ? 403 : 200
        res.end(req.url === '/1' ? 'Request has expired' : '')
      })
    }
    const upload = manager.archiveUpload(opts)
    await until(() => playing)
    expect(requests).toBe(0)
    playing = false
    await expect(upload).resolves.toMatchObject({ archive_id: 'archive-2' })
    expect(presigns).toBe(2)
  })
})
