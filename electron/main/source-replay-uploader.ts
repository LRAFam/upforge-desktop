import fs from 'fs'
import http from 'http'
import https from 'https'
import path from 'path'
import { AuthManager } from './auth-manager'
import type { SourceGame } from './source-replay-finder'

export interface SourceReplayUploadOptions {
  game: SourceGame
  demoPath: string
  steamId?: string | null
  onProgress: (pct: number) => void
}

export interface SourceReplayUploadResult {
  jobId: string
}

const API_PREFIX: Record<SourceGame, string> = {
  cs2: '/api/cs2/demo',
  deadlock: '/api/deadlock/demo',
}

/** Upload a Source-engine .dem for cloud analysis (CS2 or Deadlock API). */
export class SourceReplayUploader {
  constructor(private auth: AuthManager) {}

  async upload(opts: SourceReplayUploadOptions): Promise<SourceReplayUploadResult> {
    const apiUrl = process.env['VITE_API_URL'] || 'https://api.upforge.gg'
    const token = this.auth.getToken()
    if (!token) throw new Error('Not authenticated')

    if (!fs.existsSync(opts.demoPath)) {
      throw new Error(`Demo file not found: ${opts.demoPath}`)
    }

    const prefix = API_PREFIX[opts.game]
    const totalBytes = fs.statSync(opts.demoPath).size
    const filename = path.basename(opts.demoPath)

    opts.onProgress(0)
    const presignBody = JSON.stringify({
      filename,
      player_steam_id: opts.steamId ?? undefined,
    })
    const presignResult = await this._apiPost(`${apiUrl}${prefix}/presign`, presignBody, token)
    const jobId = presignResult['job_id'] as string
    const uploadUrl = presignResult['upload_url'] as string

    await this._putToS3(uploadUrl, opts.demoPath, totalBytes, opts.onProgress)

    await this._apiPost(
      `${apiUrl}${prefix}/confirm`,
      JSON.stringify({ job_id: jobId }),
      token,
    )
    opts.onProgress(100)

    return { jobId }
  }

  async pollStatus(game: SourceGame, jobId: string): Promise<{ status: string; error?: string | null }> {
    const apiUrl = process.env['VITE_API_URL'] || 'https://api.upforge.gg'
    const token = this.auth.getToken()
    if (!token) throw new Error('Not authenticated')

    const prefix = API_PREFIX[game]
    return new Promise((resolve, reject) => {
      const url = new URL(`${apiUrl}${prefix}/${jobId}/status`)
      const proto = url.protocol === 'https:' ? https : http
      proto.get({
        hostname: url.hostname,
        port: url.port || (url.protocol === 'https:' ? 443 : 80),
        path: url.pathname,
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      }, (res) => {
        let body = ''
        res.on('data', (chunk) => { body += chunk })
        res.on('end', () => {
          try {
            const json = JSON.parse(body)
            resolve({ status: json.status ?? 'unknown', error: json.error ?? null })
          } catch {
            reject(new Error('Invalid JSON from status endpoint'))
          }
        })
      }).on('error', reject)
    })
  }

  private _apiPost(url: string, body: string, token: string): Promise<Record<string, unknown>> {
    return new Promise((resolve, reject) => {
      const parsed = new URL(url)
      const proto = parsed.protocol === 'https:' ? https : http
      const req = proto.request({
        method: 'POST',
        hostname: parsed.hostname,
        port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
        path: parsed.pathname,
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
        },
      }, (res) => {
        let data = ''
        res.on('data', (c) => { data += c })
        res.on('end', () => {
          const status = res.statusCode ?? 0
          try {
            const json = JSON.parse(data)
            if (status >= 400) reject(new Error(json.message || `Request failed (${status})`))
            else resolve(json)
          } catch {
            reject(new Error(`Unexpected server response (HTTP ${status})`))
          }
        })
      })
      req.on('error', reject)
      req.setTimeout(30_000, () => req.destroy(new Error('API request timed out')))
      req.write(body)
      req.end()
    })
  }

  private _putToS3(
    uploadUrl: string,
    filePath: string,
    totalBytes: number,
    onProgress: (pct: number) => void,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const parsed = new URL(uploadUrl)
      const proto = parsed.protocol === 'https:' ? https : http
      const req = proto.request({
        method: 'PUT',
        hostname: parsed.hostname,
        port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
        path: parsed.pathname + parsed.search,
        headers: {
          'Content-Type': 'application/octet-stream',
          'Content-Length': totalBytes,
        },
      }, (res) => {
        let body = ''
        res.on('data', (c) => { body += c })
        res.on('end', () => {
          clearInterval(stallCheck)
          const status = res.statusCode ?? 0
          if (status >= 200 && status < 300) resolve()
          else reject(new Error(`S3 upload failed (HTTP ${status}): ${body.slice(0, 200)}`))
        })
      })

      req.on('error', (err) => { clearInterval(stallCheck); reject(err) })
      req.setTimeout(30 * 60 * 1000, () => req.destroy(new Error('S3 upload timed out')))

      let uploaded = 0
      let lastProgressAt = Date.now()
      const stallCheck = setInterval(() => {
        if (Date.now() - lastProgressAt > 60_000) {
          clearInterval(stallCheck)
          req.destroy(new Error('S3 upload stalled — no progress for 60 seconds'))
        }
      }, 5_000)

      const stream = fs.createReadStream(filePath)
      stream.on('data', (chunk: Buffer | string) => {
        uploaded += typeof chunk === 'string' ? chunk.length : chunk.length
        lastProgressAt = Date.now()
        onProgress(Math.min(Math.round((uploaded / totalBytes) * 99), 99))
      })
      stream.on('error', (err) => { clearInterval(stallCheck); reject(err) })
      stream.pipe(req)
    })
  }
}
