import fs from 'fs'
import http from 'http'
import https from 'https'
import type { ClientRequest } from 'http'
import path from 'path'
import { app } from 'electron'
import { AuthManager } from './auth-manager'
import { MatchData } from './riot-local-api'
import { UpgradeRequiredError } from './errors'
import { prepareMatchDataForUpload, submissionContextFromTimeline, gameModeForApi } from './match-data-payload'
import type { CoachingSubmissionExtras } from './match-coaching-context'
import type { DuelMomentManifest } from './moment-picker'
import { reportPipelineError } from './pipeline-errors'

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
  /** Skill profile, rank snapshot, etc. for coaching continuity. */
  coachingExtras?: CoachingSubmissionExtras
  /** Skip heavy match_data on presign — sent at complete() instead. */
  deferMatchDataOnPresign?: boolean
  /** Latest coaching extras (e.g. after parallel Riot enrich). Used at complete(). */
  getCoachingExtras?: () => CoachingSubmissionExtras | undefined
  /** Duel windows for coaching — may gain clip_s3_key after prepareDuelClips. */
  duelMoments?: DuelMomentManifest[]
  /** Runs after presign, in parallel with full VOD upload. */
  prepareDuelClips?: (jobId: string, videoPath: string) => Promise<DuelMomentManifest[]>
}

export interface DuelClipPresign {
  moment_id: string
  s3_key: string
  upload_url: string
}

/** Larger read buffer for S3 PUT streaming (default fs stream is 64 KB). */
const S3_UPLOAD_READ_HIGH_WATER_MARK = 1024 * 1024

/** Parallel part uploads — balances throughput vs home-router bufferbloat. */
const S3_MULTIPART_CONCURRENCY = 4

interface PresignMultipartPart {
  part_number: number
  upload_url: string
}

interface PresignResponse {
  job_id: string
  multipart?: boolean
  upload_url?: string
  upload_id?: string
  part_size?: number
  parts?: PresignMultipartPart[]
}

interface UploadedPart {
  part_number: number
  etag: string
}

export interface UploadResult {
  job_id: string
  duel_moments?: DuelMomentManifest[]
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
  private _s3Request: ClientRequest | null = null
  private _s3PartRequests = new Set<ClientRequest>()
  private _uploadAborted = false
  /** Recently completed upload hashes (videoPath hash) to detect double-submits */
  private _recentUploads = new Set<string>()

  constructor(private auth: AuthManager) {}

  /** Abort any in-progress S3 upload immediately. */
  abort(): void {
    this._uploadAborted = true
    this._s3Request?.destroy(new Error('Upload aborted'))
    this._s3Request = null
    for (const req of this._s3PartRequests) {
      req.destroy(new Error('Upload aborted'))
    }
    this._s3PartRequests.clear()
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
  async analyseArchive(
    archiveId: string,
    game: string,
    timeline?: MatchData | null,
    coachingExtras?: CoachingSubmissionExtras,
  ): Promise<UploadResult> {
    const apiUrl = process.env['VITE_API_URL'] || 'https://api.upforge.gg'
    const token = this.auth.getToken()
    if (!token) throw new Error('Not authenticated')

    const ctx = submissionContextFromTimeline(timeline ?? null, coachingExtras)
    const body = JSON.stringify({
      game,
      map: ctx.map,
      agent: ctx.agent,
      game_mode: ctx.game_mode,
      match_data: ctx.match_data,
      duel_moments: ctx.duel_moments,
      ally_agents: ctx.ally_agents,
      enemy_agents: ctx.enemy_agents,
      skill_profile: ctx.skill_profile,
      rank_snapshot: ctx.rank_snapshot,
    })

    const response = await this._apiPost(
      `${apiUrl}/api/recordings/archive/${archiveId}/analyse`,
      body,
      token,
    )
    return { job_id: String(response.job_id) }
  }

  private async _doUpload(opts: UploadOptions): Promise<UploadResult> {
    const apiUrl = process.env['VITE_API_URL'] || 'https://api.upforge.gg'
    const token = this.auth.getToken()
    if (!token) throw new Error('Not authenticated')

    if (!fs.existsSync(opts.videoPath)) {
      throw new Error(`Recording file not found: ${opts.videoPath}`)
    }
    const totalBytes = fs.statSync(opts.videoPath).size
    this._uploadAborted = false

    // ── Step 1: get presigned URL ──────────────────────────────────────────
    opts.onProgress(3)
    const submissionCtx = submissionContextFromTimeline(opts.timeline ?? null, opts.coachingExtras)
    const presignBody = JSON.stringify({
      riot_name:  opts.riotName,
      riot_tag:   opts.riotTag,
      game:       opts.game,
      map:        submissionCtx.map ?? opts.map,
      agent:      submissionCtx.agent ?? opts.agent,
      game_mode:  submissionCtx.game_mode,
      file_size_bytes: totalBytes,
      ...(opts.deferMatchDataOnPresign ? {} : {
        match_data: submissionCtx.match_data,
        duel_moments: submissionCtx.duel_moments,
        ally_agents: submissionCtx.ally_agents,
        enemy_agents: submissionCtx.enemy_agents,
        skill_profile: submissionCtx.skill_profile,
        rank_snapshot: submissionCtx.rank_snapshot,
      }),
    })
    const presign = await this._apiPost(
      `${apiUrl}/api/desktop-submissions/presign`,
      presignBody,
      token,
    ) as PresignResponse
    const job_id = String(presign.job_id ?? '')
    if (!job_id) throw new Error('Presign response missing job_id')

    // Persist job_id immediately — if the app crashes during upload or
    // analysis, the user can resume polling from the next launch.
    savePendingJob(job_id, { agent: opts.agent ?? undefined, map: opts.map ?? undefined, game: opts.game })

    // ── Step 2: stream file directly to S3 ────────────────────────────────
    opts.onProgress(8)
    let uploadParts: UploadedPart[] | undefined
    if (presign.multipart && presign.parts?.length && presign.part_size) {
      uploadParts = await this._putToS3Multipart(
        opts.videoPath,
        totalBytes,
        presign.parts,
        presign.part_size,
        opts.onProgress,
      )
    } else if (presign.upload_url) {
      await this._putToS3(presign.upload_url, opts.videoPath, totalBytes, opts.onProgress)
    } else {
      throw new Error('Presign response missing upload_url or multipart parts')
    }

    if (opts.beforeComplete) {
      await opts.beforeComplete()
    }

    // ── Step 3: confirm and queue analysis ────────────────────────────────
    // Re-send match context at complete() time so it can override/supplement
    // presign-time data (e.g. if Riot MatchDetails arrived late).
    const completeExtras = opts.getCoachingExtras?.() ?? opts.coachingExtras
    const completeCtx = submissionContextFromTimeline(opts.timeline ?? null, completeExtras)
    let duelMomentsPayload = opts.duelMoments
    if (opts.prepareDuelClips) {
      try {
        duelMomentsPayload = await opts.prepareDuelClips(job_id, opts.videoPath)
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        console.error('[UploadManager] Duel clip upload failed:', err)
        reportPipelineError('duel-clips', `Duel clip upload failed during complete(): ${msg}`, {
          jobId: job_id,
          videoPath: opts.videoPath,
          stack: err instanceof Error ? err.stack?.slice(0, 2000) : undefined,
        })
        throw err
      }
    }
    await this._apiPost(
      `${apiUrl}/api/desktop-submissions/complete`,
      JSON.stringify({
        job_id,
        agent:      completeCtx.agent ?? opts.agent ?? undefined,
        map:        completeCtx.map ?? opts.map ?? undefined,
        game_mode:  completeCtx.game_mode ?? gameModeForApi(opts.timeline?.gameMode) ?? undefined,
        match_data: completeCtx.match_data ?? prepareMatchDataForUpload(opts.timeline ?? null, completeExtras),
        duel_moments: duelMomentsPayload ?? completeCtx.duel_moments,
        ally_agents: completeCtx.ally_agents,
        enemy_agents: completeCtx.enemy_agents,
        skill_profile: completeCtx.skill_profile,
        rank_snapshot: completeCtx.rank_snapshot,
        ...(uploadParts ? { upload_parts: uploadParts } : {}),
      }),
      token
    )
    opts.onProgress(100)

    return { job_id, duel_moments: duelMomentsPayload }
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
    const submissionCtx = submissionContextFromTimeline(opts.timeline ?? null, opts.coachingExtras)
    const presignBody = JSON.stringify({
      riot_name:  opts.riotName,
      riot_tag:   opts.riotTag,
      game:       opts.game,
      map:        submissionCtx.map ?? opts.map,
      agent:      submissionCtx.agent ?? opts.agent,
      game_mode:  submissionCtx.game_mode,
      match_data: submissionCtx.match_data,
      ally_agents: submissionCtx.ally_agents,
      enemy_agents: submissionCtx.enemy_agents,
      skill_profile: submissionCtx.skill_profile,
      rank_snapshot: submissionCtx.rank_snapshot,
    })
    const archivePresign = await this._apiPost(
      `${apiUrl}/api/recordings/archive/presign`,
      presignBody,
      token,
    )
    const archive_id = String(archivePresign.archive_id ?? '')
    const upload_url = String(archivePresign.upload_url ?? '')
    if (!archive_id || !upload_url) {
      throw new Error('Archive presign response missing archive_id or upload_url')
    }

    opts.onProgress(8)
    await this._putToS3(upload_url, opts.videoPath, totalBytes, opts.onProgress)

    const completeCtx = submissionContextFromTimeline(opts.timeline ?? null, opts.coachingExtras)
    const complete = await this._apiPost(
      `${apiUrl}/api/recordings/archive/complete`,
      JSON.stringify({
        archive_id:      archive_id,
        agent:           completeCtx.agent ?? opts.agent ?? undefined,
        map:             completeCtx.map ?? opts.map ?? undefined,
        game_mode:       completeCtx.game_mode ?? gameModeForApi(opts.timeline?.gameMode) ?? undefined,
        match_data:      completeCtx.match_data ?? prepareMatchDataForUpload(opts.timeline ?? null, opts.coachingExtras),
        ally_agents:     completeCtx.ally_agents,
        enemy_agents:    completeCtx.enemy_agents,
        skill_profile:   completeCtx.skill_profile,
        rank_snapshot:   completeCtx.rank_snapshot,
        file_size_bytes: totalBytes,
        training_consent: opts.trainingConsent === true,
      }),
      token,
    )
    opts.onProgress(100)

    return {
      archive_id,
      playback_url: typeof complete.playback_url === 'string' ? complete.playback_url : undefined,
    }
  }

  /** Backfill match_data on a queued/processing job when Riot stats arrive after upload started. */
  async patchMatchData(
    jobId: string,
    timeline: MatchData | null,
    coachingExtras?: CoachingSubmissionExtras,
  ): Promise<void> {
    const token = this.auth.getToken()
    if (!token || !timeline) return
    const match_data = prepareMatchDataForUpload(timeline, coachingExtras)
    if (!match_data) return

    const apiUrl = process.env['VITE_API_URL'] || 'https://api.upforge.gg'
    const ctx = submissionContextFromTimeline(timeline, coachingExtras)
    await this._apiPost(
      `${apiUrl}/api/desktop-submissions/${jobId}/match-data`,
      JSON.stringify({
        match_data,
        duel_moments: ctx.duel_moments,
        ally_agents: ctx.ally_agents,
        enemy_agents: ctx.enemy_agents,
        skill_profile: ctx.skill_profile,
        rank_snapshot: ctx.rank_snapshot,
      }),
      token,
    )
  }

  /** Presigned PUT URLs for pre-extracted duel clip MP4s. */
  async presignDuelClips(jobId: string, momentIds: string[]): Promise<DuelClipPresign[]> {
    const token = this.auth.getToken()
    if (!token) throw new Error('Not authenticated')
    const apiUrl = process.env['VITE_API_URL'] || 'https://api.upforge.gg'
    const response = await this._apiPost(
      `${apiUrl}/api/desktop-submissions/${jobId}/duel-clips/presign`,
      JSON.stringify({ moments: momentIds.map((moment_id) => ({ moment_id })) }),
      token,
    )
    const clips = response.clips
    if (!Array.isArray(clips) || clips.length === 0) {
      throw new Error('Duel clip presign returned no clips')
    }
    return clips as DuelClipPresign[]
  }

  /** PUT a small file (duel clip) to a presigned S3 URL. */
  putFileToS3(uploadUrl: string, filePath: string): Promise<void> {
    const totalBytes = fs.statSync(filePath).size
    return this._putToS3(uploadUrl, filePath, totalBytes, () => {})
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

      const stream = fs.createReadStream(filePath, { highWaterMark: S3_UPLOAD_READ_HIGH_WATER_MARK })
      stream.on('data', (chunk: Buffer | string) => {
        uploaded += typeof chunk === 'string' ? chunk.length : chunk.length
        lastProgressAt = Date.now()
        onProgress(Math.min(8 + Math.round((uploaded / totalBytes) * 91), 99))
      })
      stream.on('error', (err) => { clearInterval(stallCheck); reject(err) })
      stream.pipe(req)
    })
  }

  private async _readFileSlice(filePath: string, start: number, length: number): Promise<Buffer> {
    const fd = await fs.promises.open(filePath, 'r')
    try {
      const buffer = Buffer.alloc(length)
      const { bytesRead } = await fd.read(buffer, 0, length, start)
      return bytesRead === length ? buffer : buffer.subarray(0, bytesRead)
    } finally {
      await fd.close()
    }
  }

  private _putPartToS3(uploadUrl: string, body: Buffer): Promise<string> {
    if (this._uploadAborted) {
      return Promise.reject(new Error('Upload aborted'))
    }

    return new Promise((resolve, reject) => {
      const parsed = new URL(uploadUrl)
      const proto = parsed.protocol === 'https:' ? https : http
      const req = proto.request({
        method:   'PUT',
        hostname: parsed.hostname,
        port:     parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
        path:     parsed.pathname + parsed.search,
        headers:  { 'Content-Length': body.length },
      }, (res) => {
        let responseBody = ''
        res.on('data', (c) => { responseBody += c })
        res.on('end', () => {
          this._s3PartRequests.delete(req)
          const status = res.statusCode ?? 0
          const etag = res.headers.etag
          if (status >= 200 && status < 300 && etag) {
            resolve(String(etag).replace(/"/g, ''))
          } else {
            reject(new Error(`S3 part upload failed (HTTP ${status}): ${responseBody.slice(0, 200)}`))
          }
        })
      })

      req.on('error', (err) => {
        this._s3PartRequests.delete(req)
        reject(err)
      })
      req.setTimeout(30 * 60 * 1000, () => {
        req.destroy(new Error('S3 part upload timed out after 30 minutes'))
      })

      this._s3PartRequests.add(req)
      req.write(body)
      req.end()
    })
  }

  private async _putToS3Multipart(
    filePath: string,
    totalBytes: number,
    parts: PresignMultipartPart[],
    partSize: number,
    onProgress: (pct: number) => void,
  ): Promise<UploadedPart[]> {
    const sortedParts = [...parts].sort((a, b) => a.part_number - b.part_number)
    const results: UploadedPart[] = new Array(sortedParts.length)
    let uploaded = 0
    let nextIndex = 0
    let lastProgressAt = Date.now()

    const STALL_TIMEOUT_MS = 60_000
    const stallCheck = setInterval(() => {
      if (Date.now() - lastProgressAt > STALL_TIMEOUT_MS) {
        this.abort()
      }
    }, 5_000)

    const uploadOne = async (index: number): Promise<void> => {
      const part = sortedParts[index]!
      const offset = (part.part_number - 1) * partSize
      const length = Math.min(partSize, totalBytes - offset)
      const buffer = await this._readFileSlice(filePath, offset, length)
      const etag = await this._putPartToS3(part.upload_url, buffer)
      results[index] = { part_number: part.part_number, etag }
      uploaded += length
      lastProgressAt = Date.now()
      onProgress(Math.min(8 + Math.round((uploaded / totalBytes) * 91), 99))
    }

    try {
      const workers = Array.from(
        { length: Math.min(S3_MULTIPART_CONCURRENCY, sortedParts.length) },
        async () => {
          while (nextIndex < sortedParts.length) {
            if (this._uploadAborted) {
              throw new Error('Upload aborted')
            }
            const index = nextIndex++
            await uploadOne(index)
          }
        },
      )
      await Promise.all(workers)
      return results
    } catch (err) {
      if (!this._uploadAborted) this.abort()
      throw err
    } finally {
      clearInterval(stallCheck)
      this._s3PartRequests.clear()
    }
  }

  async pollStatus(jobId: string): Promise<{
    status: string
    progress?: number
    current_step?: string | null
    result?: Record<string, unknown>
    error?: string | null
    job_id?: string
    failure_diagnostics?: Record<string, unknown> | null
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
              let msg = (json.error as string) || (json.message as string) || `Request failed (${httpStatus})`
              if (httpStatus >= 500 || /sqlstate|connection refused|queryexception/i.test(msg)) {
                msg = `Request failed (${httpStatus})`
              }
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

