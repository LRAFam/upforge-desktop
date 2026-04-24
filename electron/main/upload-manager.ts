import fs from 'fs'
import http from 'http'
import https from 'https'
import { AuthManager } from './auth-manager'
import { MatchData } from './riot-local-api'

export interface UploadOptions {
  videoPath: string
  riotName: string
  riotTag: string
  game: string
  map: string | null
  agent: string | null
  timeline: MatchData | null
  onProgress: (pct: number) => void
}

export interface UploadResult {
  job_id: string
}

export class UploadManager {
  constructor(private auth: AuthManager) {}

  /**
   * Upload a recording using the two-step direct-S3 flow:
   *   1. POST /presign  → get a presigned S3 PUT URL (tiny JSON request)
   *   2. PUT <s3-url>   → stream the file directly to S3 (bypasses nginx)
   *   3. POST /complete → confirm upload and queue analysis (tiny JSON request)
   */
  async upload(opts: UploadOptions): Promise<UploadResult> {
    const apiUrl = process.env['VITE_API_URL'] || 'https://api.upforge.gg'
    const token = this.auth.getToken()
    if (!token) throw new Error('Not authenticated')

    if (!fs.existsSync(opts.videoPath)) {
      throw new Error(`Recording file not found: ${opts.videoPath}`)
    }
    const totalBytes = fs.statSync(opts.videoPath).size

    // ── Step 1: get presigned URL ──────────────────────────────────────────
    opts.onProgress(0)
    const presignBody = JSON.stringify({
      riot_name:  opts.riotName,
      riot_tag:   opts.riotTag,
      game:       opts.game,
      map:        opts.map,
      agent:      opts.agent,
      match_data: opts.timeline ? JSON.stringify(opts.timeline) : undefined,
    })
    const { job_id, upload_url } = await this._apiPost(
      `${apiUrl}/api/desktop-submissions/presign`,
      presignBody,
      token
    )

    // ── Step 2: stream file directly to S3 ────────────────────────────────
    await this._putToS3(upload_url, opts.videoPath, totalBytes, opts.onProgress)

    // ── Step 3: confirm and queue analysis ────────────────────────────────
    await this._apiPost(
      `${apiUrl}/api/desktop-submissions/complete`,
      JSON.stringify({ job_id }),
      token
    )
    opts.onProgress(100)

    return { job_id }
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
            if (status >= 400) reject(new Error(json.message || `Request failed (${status})`))
            else resolve(json)
          } catch {
            const preview = data.slice(0, 200).replace(/\n/g, ' ').trim()
            console.error(`[UploadManager] Non-JSON HTTP ${status}: ${preview}`)
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
          const status = res.statusCode ?? 0
          if (status >= 200 && status < 300) resolve()
          else reject(new Error(`S3 upload failed (HTTP ${status}): ${body.slice(0, 200)}`))
        })
      })

      req.on('error', reject)
      // 30-minute hard cap — large files over slow connections
      req.setTimeout(30 * 60 * 1000, () => req.destroy(new Error('S3 upload timed out after 30 minutes')))

      let uploaded = 0
      const stream = fs.createReadStream(filePath)
      stream.on('data', (chunk: Buffer | string) => {
        uploaded += typeof chunk === 'string' ? chunk.length : chunk.length
        onProgress(Math.min(Math.round((uploaded / totalBytes) * 99), 99))
      })
      stream.on('error', reject)
      stream.pipe(req)
    })
  }

  async pollStatus(jobId: string): Promise<{ status: string; result?: Record<string, unknown> }> {
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
          try { resolve(JSON.parse(body)) }
          catch { reject(new Error('Invalid JSON')) }
        })
      }).on('error', reject)
    })
  }
}

