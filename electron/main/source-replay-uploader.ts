import fs from 'fs'
import http from 'http'
import https from 'https'
import path from 'path'
import { AuthManager } from './auth-manager'
import type { SourceGame } from './source-replay-finder'
import { getApiBaseUrl } from './api-base'
import { clientVersionHeaders, noteAnalysisJob } from './analysis-trace'
import { ReplayTooLargeError, replayApiError, replayTooLargeMessage } from './errors'

export interface SourceReplayUploadOptions {
  game: SourceGame
  demoPath: string
  steamId?: string | null
  matchId?: number | null
  matchStartedAt?: number | null
  heroId?: number | null
  /** Deadlock: 'auto' for uploads nobody tapped Analyse for (the API keeps those Ranked-only). */
  trigger?: 'auto' | 'manual'
  queue?: string | null
  onProgress: (pct: number) => void
}

export interface SourceReplayUploadResult {
  jobId: string
  /** The match was already analysed: no upload happened and no credit was spent; jobId is the first analysis. */
  alreadyAnalysed?: boolean
}

/** A status GET that has sent nothing for this long is abandoned; the poll loop tries again later. */
export const STATUS_REQUEST_TIMEOUT_MS = 30_000

/** Same cap as the API's AI_DEMO_UPLOAD_MAX_MB default (the AI service refuses bigger uploads). */
export const DEADLOCK_REPLAY_MAX_MB = 400

const API_PREFIX: Record<SourceGame, string> = {
  cs2: '/api/cs2/demo',
  deadlock: '/api/deadlock/demo',
}

/** Upload a Source-engine .dem for cloud analysis (CS2 or Deadlock API). */
export class SourceReplayUploader {
  constructor(private auth: AuthManager) {}

  async upload(opts: SourceReplayUploadOptions): Promise<SourceReplayUploadResult> {
    const apiUrl = getApiBaseUrl()
    const token = this.auth.getToken()
    if (!token) throw new Error('Not authenticated')

    if (!fs.existsSync(opts.demoPath)) {
      throw new Error(`Demo file not found: ${opts.demoPath}`)
    }

    const prefix = API_PREFIX[opts.game]
    const totalBytes = fs.statSync(opts.demoPath).size
    const filename = path.basename(opts.demoPath)

    // Tell the player before uploading anything: an oversized replay can only fail later.
    if (opts.game === 'deadlock' && totalBytes > DEADLOCK_REPLAY_MAX_MB * 1024 * 1024) {
      throw new ReplayTooLargeError(replayTooLargeMessage(DEADLOCK_REPLAY_MAX_MB, Math.ceil(totalBytes / (1024 * 1024))))
    }

    opts.onProgress(0)
    const presignBody: Record<string, unknown> = { filename }
    if (opts.game === 'deadlock') {
      // The API refuses sizes over its own cap at presign (413) before any upload or charge.
      presignBody.file_size_bytes = totalBytes
      if (opts.steamId) presignBody.steam_id = opts.steamId
      if (opts.matchId) presignBody.match_id = opts.matchId
      if (opts.matchStartedAt) presignBody.match_started_at = opts.matchStartedAt
      if (opts.heroId) presignBody.hero_id = opts.heroId
      if (opts.trigger) presignBody.trigger = opts.trigger
      if (opts.queue) presignBody.queue = opts.queue
    } else if (opts.steamId) {
      presignBody.player_steam_id = opts.steamId
    }
    const presignResult = await this._apiPost(`${apiUrl}${prefix}/presign`, JSON.stringify(presignBody), token)
    const jobId = presignResult['job_id']
    if (typeof jobId !== 'string' || jobId === 'undefined' || !/^[A-Za-z0-9-]{8,64}$/.test(jobId)) {
      throw new Error('Invalid replay job ID in presign response')
    }
    const uploadUrl = presignResult['upload_url'] as string
    noteAnalysisJob({ jobId, game: opts.game })

    // The API returns the first analysis for a match that was already analysed (no charge): treat it as done.
    if (presignResult['already_analysed'] === true) {
      opts.onProgress(100)
      return { jobId, alreadyAnalysed: true }
    }

    await this._putToS3(uploadUrl, opts.demoPath, totalBytes, opts.onProgress)

    const confirmBody: Record<string, unknown> = { job_id: jobId }
    if (opts.game === 'deadlock') {
      if (opts.matchId) confirmBody.match_id = opts.matchId
      if (opts.matchStartedAt) confirmBody.match_started_at = opts.matchStartedAt
      if (opts.heroId) confirmBody.hero_id = opts.heroId
    }
    await this._apiPost(
      `${apiUrl}${prefix}/confirm`,
      JSON.stringify(confirmBody),
      token,
    )
    opts.onProgress(100)

    return { jobId }
  }

  /** Per status request: a connection that never answers is aborted after this long. */
  statusTimeoutMs = STATUS_REQUEST_TIMEOUT_MS

  async pollStatus(game: SourceGame, jobId: string): Promise<{ status: string; error?: string | null }> {
    const apiUrl = getApiBaseUrl()
    const token = this.auth.getToken()
    if (!token) throw new Error('Not authenticated')

    const prefix = API_PREFIX[game]
    return new Promise((resolve, reject) => {
      const url = new URL(`${apiUrl}${prefix}/${jobId}/status`)
      const proto = url.protocol === 'https:' ? https : http
      let done = false
      const finish = (fn: () => void) => { if (!done) { done = true; fn() } }
      const req = proto.get({
        hostname: url.hostname,
        port: url.port || (url.protocol === 'https:' ? 443 : 80),
        path: url.pathname,
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      }, (res) => {
        let body = ''
        res.on('data', (chunk) => { body += chunk })
        // A reset after the headers ends the body without 'end': fail instead of waiting forever.
        res.on('aborted', () => finish(() => reject(new Error('Status response was cut off'))))
        res.on('error', (err) => finish(() => reject(err)))
        res.on('close', () => { if (!res.complete) finish(() => reject(new Error('Status response was cut off'))) })
        res.on('end', () => {
          finish(() => {
            try {
              const json = JSON.parse(body)
              resolve({ status: json.status ?? 'unknown', error: json.error ?? null })
            } catch {
              reject(new Error('Invalid JSON from status endpoint'))
            }
          })
        })
      })
      req.setTimeout(this.statusTimeoutMs, () => {
        finish(() => reject(new Error(`Status request timed out after ${this.statusTimeoutMs} ms`)))
        req.destroy()
      })
      req.on('error', (err) => finish(() => reject(err)))
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
          ...clientVersionHeaders(),
        },
      }, (res) => {
        let data = ''
        res.on('data', (c) => { data += c })
        res.on('end', () => {
          const status = res.statusCode ?? 0
          try {
            const json = JSON.parse(data)
            if (status >= 400) reject(replayApiError(status, json))
            else resolve(json)
          } catch {
            reject(status === 402 ? replayApiError(402, null) : new Error(`Unexpected server response (HTTP ${status})`))
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
