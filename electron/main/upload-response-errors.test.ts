import http from 'http'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AuthManager } from './auth-manager'
vi.mock('electron', () => ({ app: { getPath: () => os.tmpdir(), getAppPath: () => os.tmpdir(), isPackaged: false } }))
import { UploadManager } from './upload-manager'

afterEach(() => vi.unstubAllEnvs())

describe('interrupted upload responses', () => {
  it.each(['api', 'status', 'single upload', 'multipart upload'] as const)('rejects a truncated %s response', async (operation) => {
    const server = http.createServer((req, res) => {
      req.resume()
      req.on('end', () => {
        res.writeHead(200, { 'Content-Length': '100', ETag: 'test-etag' })
        res.write('{')
        setTimeout(() => res.destroy(), 20)
      })
    })
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject)
      server.listen(0, '127.0.0.1', resolve)
    })
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'upload-response-'))
    try {
      const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`
      vi.stubEnv('VITE_API_URL', origin)
      const manager = new UploadManager({ getToken: () => 'test-token' } as AuthManager)
      const internal = manager as unknown as {
        _apiPost: (url: string, body: string, token: string) => Promise<unknown>
        _putToS3Once: (url: string, file: string, size: number, progress: () => void, signal: AbortSignal) => Promise<void>
        _putPartToS3Once: (url: string, body: Buffer, signal: AbortSignal) => Promise<string>
      }
      const file = path.join(dir, 'video.mp4')
      fs.writeFileSync(file, 'video')
      const signal = new AbortController().signal
      const pending = operation === 'api' ? internal._apiPost(origin, '{}', 'test-token')
        : operation === 'status' ? manager.pollStatus('test-job')
        : operation === 'single upload' ? internal._putToS3Once(origin, file, 5, () => {}, signal)
        : internal._putPartToS3Once(origin, Buffer.from('video'), signal)
      await expect(pending).rejects.toMatchObject({ code: 'ECONNRESET' })
    } finally {
      server.closeAllConnections()
      await new Promise<void>(resolve => server.close(() => resolve()))
      fs.rmSync(dir, { recursive: true, force: true })
    }
  }, 2000)
})
