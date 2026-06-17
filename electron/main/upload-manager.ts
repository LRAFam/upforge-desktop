import fs from 'fs'
import http from 'http'
import https from 'https'
import path from 'path'
import { app } from 'electron'
import { AuthManager } from './auth-manager'
import { MatchData } from './riot-local-api'
import { UpgradeRequiredError } from './errors'
import { prepareMatchDataForUpload, submissionContextFromTimeline, gameModeForApi } from './match-data-payload'

export interface UploadOptions {
  videoPath: string
  riotName: string
  riotTag: string
  game: string
  map: string | null
  agent: string | null
  timeline: MatchData | null
  onProgress: (pct: number) => void
  /** Awaited after S3 upload, before complete() — e.g. wait for Riot enrich. */
  beforeComplete?: () => Promise<void>
  /** Opt-in for anonymised training use of archived VODs (storage is separate). */
  trainingConsent?: boolean
}

export interface UploadResult {
  job_id: string
}

export interface ArchiveUploadResult {
  archive_id: string
  playback_url?: string
}

import { userPendingJobPath } from './user-data-paths'

let pendingJobUserId: number | null = null

export function setPendingJobUserScope(userId: number | null): void {
  pendingJobUserId = userId
}

function pendingJobPath(): string {
  if (pendingJobUserId != null) {
    return userPendingJobPath(pendingJobUserId)
  }
  return path.join(app.getPath('userData'), 'pending-job.json')
}

/** Persist a job_id to disk immediately after presign, so polling can resume on restart. */
export function savePendingJob(jobId: string, context?: { agent?: string | null; map?: string | null; game?: string }): void {
  try {
    const filePath = pendingJobPath()
    fs.mkdirSync(path.dirname(filePath), { recursive: true })
    fs.writeFileSync(
      filePath,
      JSON.stringify({ job_id: jobId, savedAt: Date.now(), ...context }),
      'utf-8',
    )
  } catch { /* non-critical */ }
}

/** Clear the persisted job_id once the job is finished (completed, failed, or timed out). */
export function clearPendingJob(): void {
  clearPendingJobForUser(pendingJobUserId)
}

export function clearPendingJobForUser(userId: number | null): void {
  try {
    const filePath = userId != null ? userPendingJobPath(userId) : path.join(app.getPath('userData'), 'pending-job.json')
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath)
  } catch { /* non-critical */ }
}

/** Read any orphaned job_id saved from a previous session. Returns null if none. */
export function readPendingJob(): { job_id: string; savedAt: number; agent?: string; map?: string; game?: string } | null {
  return readPendingJobForUser(pendingJobUserId)
}

export function readPendingJobForUser(
  userId: number | null,
): { job_id: string; savedAt: number; agent?: string; map?: string; game?: string } | null {
  const paths = userId != null
    ? [userPendingJobPath(userId)]
    : [path.join(app.getPath('userData'), 'pending-job.json')]

  for (const filePath of paths) {
    try {
      const raw = fs.readFileSync(filePath, 'utf-8')
      const parsed = JSON.parse(raw)
      if (parsed?.job_id) return parsed
    } catch { /* try next */ }
  }
  return null
}

export class UploadManager {
  private _s3Request: ReturnType<typeof http.request> | null = null
  /** Recently completed upload hashes (videoPath hash) to detect double-submits */
  private _recentUploads = new Set<string>()

  constructor(private auth: AuthManager) {}

  /** Abort any in-progress S3 upload immediately. */
  abort(): void {
    this._s3Request?.destroy(new Error('Upload aborted'))
    this._s3Request = null
  }

  /**
   * Upload a recording using the two-step direct-S3 flow:
   *   1. POST /presign  → get a presigned S3 PUT URL (tiny JSON request)
   *   2. PUT <s3-url>   → stream the file directly to S3 (bypasses nginx)
   *   3. POST /complete → confirm upload and queue analysis (tiny JSON request)
   */
  async upload(opts: UploadOptions): Promise<UploadResult> {
    if (this._recentUploads.has(opts.videoPath)) {
      throw new Error('This recording was already uploaded recently')
    }
    const result = await this._doUpload(opts)
    this._recentUploads.add(opts.videoPath)
    // Keep the set small — only remember the last 20 uploads
    if (this._recentUploads.size > 20) {
      const [first] = this._recentUploads
      this._recentUploads.delete(first)
    }
    return result
  }

  /** Save a recording to cloud without queuing analysis (archive quota, not analysis quota). */
  async archiveUpload(opts: UploadOptions): Promise<ArchiveUploadResult> {
    if (this._recentUploads.has(`archive:${opts.videoPath}`)) {
      throw new Error('This recording was already archived recently')
    }
    const result = await this._doArchiveUpload(opts)
    this._recentUploads.add(`archive:${opts.videoPath}`)
    if (this._recentUploads.size > 20) {
      const [first] = this._recentUploads
      this._recentUploads.delete(first)
    }
    return result
  }

  /** Queue analysis for a recording already saved to cloud. */
  async analyseArchive(archiveId: string, game: string): Promise<UploadResult> {
    const apiUrl = process.env['VITE_API_URL'] || 'https://api.upforge.gg'
    const token = this.auth.getToken()
    if (!token) throw new Error('Not authenticated')

    const { job_id } = await this._apiPost(
      `${apiUrl}/api/recordings/archive/${archiveId}/analyse`,
      JSON.stringify({ game }),
      token,
    )
    return { job_id }
  }

  private async _doUpload(opts: UploadOptions): Promise<UploadResult> {
    const apiUrl = process.env['VITE_API_URL'] || 'https://api.upforge.gg'
    const token = this.auth.getToken()
    if (!token) throw new Error('Not authenticated')

    if (!fs.existsSync(opts.videoPath)) {
      throw new Error(`Recording file not found: ${opts.videoPath}`)
    }
    const totalBytes = fs.statSync(opts.videoPath).size

    // ── Step 1: get presigned URL ──────────────────────────────────────────
    opts.onProgress(3)
    const submissionCtx = submissionContextFromTimeline(opts.timeline ?? null)
    const presignBody = JSON.stringify({
      riot_name:  opts.riotName,
      riot_tag:   opts.riotTag,
      game:       opts.game,
      map:        submissionCtx.map ?? opts.map,
      agent:      submissionCtx.agent ?? opts.agent,
      game_mode:  submissionCtx.game_mode,
      match_data: submissionCtx.match_data,
    })
    const { job_id, upload_url } = await this._apiPost(
      `${apiUrl}/api/desktop-submissions/presign`,
      presignBody,
      token
    )

    // Persist job_id immediately — if the app crashes during upload or
    // analysis, the user can resume polling from the next launch.
    savePendingJob(job_id, { agent: opts.agent ?? undefined, map: opts.map ?? undefined, game: opts.game })

    // ── Step 2: stream file directly to S3 ────────────────────────────────
    opts.onProgress(8)
    await this._putToS3(upload_url, opts.videoPath, totalBytes, opts.onProgress)

    if (opts.beforeComplete) {
      await opts.beforeComplete()
    }

    // ── Step 3: confirm and queue analysis ────────────────────────────────
    // Re-send match context at complete() time so it can override/supplement
    // presign-time data (e.g. if Riot MatchDetails arrived late).
    const completeCtx = submissionContextFromTimeline(opts.timeline ?? null)
    await this._apiPost(
      `${apiUrl}/api/desktop-submissions/complete`,
      JSON.stringify({
        job_id,
        agent:      completeCtx.agent ?? opts.agent ?? undefined,
        map:        completeCtx.map ?? opts.map ?? undefined,
        game_mode:  completeCtx.game_mode ?? gameModeForApi(opts.timeline?.gameMode) ?? undefined,
        match_data: completeCtx.match_data ?? prepareMatchDataForUpload(opts.timeline ?? null),
      }),
      token
    )
    opts.onProgress(100)

    return { job_id }
  }

  private async _doArchiveUpload(opts: UploadOptions): Promise<ArchiveUploadResult> {
    const apiUrl = process.env['VITE_API_URL'] || 'https://api.upforge.gg'
    const token = this.auth.getToken()
    if (!token) throw new Error('Not authenticated')

    if (!fs.existsSync(opts.videoPath)) {
      throw new Error(`Recording file not found: ${opts.videoPath}`)
    }
    const totalBytes = fs.statSync(opts.videoPath).size

    opts.onProgress(3)
    const submissionCtx = submissionContextFromTimeline(opts.timeline ?? null)
    const presignBody = JSON.stringify({
      riot_name:  opts.riotName,
      riot_tag:   opts.riotTag,
      game:       opts.game,
      map:        submissionCtx.map ?? opts.map,
      agent:      submissionCtx.agent ?? opts.agent,
      game_mode:  submissionCtx.game_mode,
      match_data: submissionCtx.match_data,
    })
    const { archive_id, upload_url } = await this._apiPost(
      `${apiUrl}/api/recordings/archive/presign`,
      presignBody,
      token,
    )

    opts.onProgress(8)
    await this._putToS3(upload_url, opts.videoPath, totalBytes, opts.onProgress)

    const completeCtx = submissionContextFromTimeline(opts.timeline ?? null)
    const complete = await this._apiPost(
      `${apiUrl}/api/recordings/archive/complete`,
      JSON.stringify({
        archive_id:      archive_id,
        agent:           completeCtx.agent ?? opts.agent ?? undefined,
        map:             completeCtx.map ?? opts.map ?? undefined,
        game_mode:       completeCtx.game_mode ?? gameModeForApi(opts.timeline?.gameMode) ?? undefined,
        match_data:      completeCtx.match_data ?? prepareMatchDataForUpload(opts.timeline ?? null),
        file_size_bytes: totalBytes,
        training_consent: opts.trainingConsent === true,
      }),
      token,
    )
    opts.onProgress(100)

    return {
      archive_id,
      playback_url: complete.playback_url,
    }
  }

  /** Backfill match_data on a queued/processing job when Riot stats arrive after upload started. */
  async patchMatchData(jobId: string, timeline: MatchData | null): Promise<void> {
    const token = this.auth.getToken()
    if (!token || !timeline) return
    const match_data = prepareMatchDataForUpload(timeline)
    if (!match_data) return

    const apiUrl = process.env['VITE_API_URL'] || 'https://api.upforge.gg'
    await this._apiPost(
      `${apiUrl}/api/desktop-submissions/${jobId}/match-data`,
      JSON.stringify({ match_data }),
      token,
    )
  }

  /** Upload pre-extracted scout moment thumbnails for fast Smart Review. */
  async uploadScoutMoments(
    jobId: string,
    moments: Array<{
      timestamp_sec: number
      trigger: string
      round: number | null
      image_base64: string
    }>,
  ): Promise<void> {
    const token = this.auth.getToken()
    if (!token || moments.length === 0) return

    const apiUrl = process.env['VITE_API_URL'] || 'https://api.upforge.gg'
    await this._apiPost(
      `${apiUrl}/api/desktop-submissions/${jobId}/scout-moments`,
      JSON.stringify({ moments }),
      token,
    )
  }

  /** POST JSON to an API endpoint with Bearer auth. Returns parsed response body. */
  private _apiPost(url: string, body: string, token: string): Promise<Record<string, string>> {
    return new Promise((resolve, reject) => {
      const parsed = new URL(url)
      const proto = parsed.protocol === 'https:' ? https : http
      const req = proto.request({
        method: 'POST',
        hostname: parsed.hostname,
        port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
        path: parsed.pathname,
        headers: {
          'Content-Type':  'application/json',
          'Content-Length': Buffer.byteLength(body),
          'Authorization': `Bearer ${token}`,
          'Accept':        'application/json',
        },
      }, (res) => {
        let data = ''
        res.on('data', (c) => data += c)
        res.on('end', () => {
          const status = res.statusCode ?? 0
          try {
            const json = JSON.parse(data)
            if (status === 402) reject(new UpgradeRequiredError(
              json.message || 'Quota limit reached. Upgrade to continue.',
              json.error || 'analysis_limit_reached',
              json.upgrade_url || 'https://upforge.gg/pricing',
              json.ppa_url || 'https://upforge.gg/valorant/analyze',
            ))
            else if (status >= 400) reject(new Error(json.message || `Request failed (${status})`))
            else resolve(json)
          } catch {
            const preview = data.slice(0, 200).replace(/\n/g, ' ').trim()
            console.error(`[UploadManager] Non-JSON HTTP ${status}: ${preview}`)
            if (status === 402) reject(new UpgradeRequiredError('Analysis limit reached. Upgrade to continue.'))
            else reject(new Error(`Unexpected server response (HTTP ${status})`))
          }
        })
      })
      req.on('error', reject)
      req.setTimeout(30_000, () => req.destroy(new Error('API request timed out')))
      req.write(body)
      req.end()
    })
  }

  /** Stream a local file via HTTP PUT to a presigned S3 URL. */
  private _putToS3(
    uploadUrl: string,
    filePath: string,
    totalBytes: number,
    onProgress: (pct: number) => void
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const parsed = new URL(uploadUrl)
      const proto = parsed.protocol === 'https:' ? https : http
      const req = proto.request({
        method:   'PUT',
        hostname: parsed.hostname,
        port:     parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
        path:     parsed.pathname + parsed.search,
        headers: {
          'Content-Type':   'video/mp4',
          'Content-Length': totalBytes,
        },
      }, (res) => {
        let body = ''
        res.on('data', (c) => body += c)
        res.on('end', () => {
          clearInterval(stallCheck)
          this._s3Request = null
          const status = res.statusCode ?? 0
          if (status >= 200 && status < 300) resolve()
          else reject(new Error(`S3 upload failed (HTTP ${status}): ${body.slice(0, 200)}`))
        })
      })

      req.on('error', reject)
      // 60-minute cap — ~2.5 GB files at the fixed 720p preset
      req.setTimeout(60 * 60 * 1000, () => req.destroy(new Error('S3 upload timed out after 60 minutes')))

      this._s3Request = req

      let uploaded = 0
      let lastProgressAt = Date.now()
      const STALL_TIMEOUT_MS = 60_000
      const stallCheck = setInterval(() => {
        if (Date.now() - lastProgressAt > STALL_TIMEOUT_MS) {
          clearInterval(stallCheck)
          req.destroy(new Error('S3 upload stalled — no progress for 60 seconds'))
        }
      }, 5_000)

      const stream = fs.createReadStream(filePath)
      stream.on('data', (chunk: Buffer | string) => {
        uploaded += typeof chunk === 'string' ? chunk.length : chunk.length
        lastProgressAt = Date.now()
        onProgress(Math.min(8 + Math.round((uploaded / totalBytes) * 91), 99))
      })
      stream.on('error', (err) => { clearInterval(stallCheck); reject(err) })
      stream.pipe(req)
    })
  }

  async pollStatus(jobId: string): Promise<{
    status: string
    progress?: number
    current_step?: string | null
    result?: Record<string, unknown>
    error?: string | null
    job_id?: string
  }> {
    const apiUrl = process.env['VITE_API_URL'] || 'https://api.upforge.gg'
    const token = this.auth.getToken()
    if (!token) throw new Error('Not authenticated')

    return new Promise((resolve, reject) => {
      const url = new URL(`${apiUrl}/api/desktop-submissions/${jobId}/status`)
      const proto = url.protocol === 'https:' ? https : http
      proto.get({
        hostname: url.hostname,
        port: url.port || (url.protocol === 'https:' ? 443 : 80),
        path: url.pathname,
        headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' }
      }, (res) => {
        let body = ''
        res.on('data', (chunk) => body += chunk)
        res.on('end', () => {
          const httpStatus = res.statusCode ?? 0
          try {
            const json = JSON.parse(body) as Record<string, unknown>
            if (httpStatus === 404) {
              reject(new Error('Job not found'))
              return
            }
            if (httpStatus >= 400) {
              const msg = (json.error as string) || (json.message as string) || `Request failed (${httpStatus})`
              reject(new Error(msg))
              return
            }
            resolve(json as {
              status: string
              progress?: number
              current_step?: string | null
              result?: Record<string, unknown>
              error?: string | null
              job_id?: string
            })
          } catch {
            reject(new Error(httpStatus >= 400 ? `Request failed (${httpStatus})` : 'Invalid JSON'))
          }
        })
      }).on('error', reject)
    })
  }
}

