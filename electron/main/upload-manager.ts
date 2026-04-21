import fs from 'fs'
import path from 'path'
import FormData from 'form-data'
import http from 'http'
import https from 'https'
import { AuthManager } from './auth-manager'
import { MatchTimeline } from './riot-local-api'

export interface UploadOptions {
  videoPath: string
  riotName: string
  riotTag: string
  game: string
  map: string | null
  agent: string | null
  timeline: MatchTimeline | null
  onProgress: (pct: number) => void
}

export interface UploadResult {
  job_id: string
}

export class UploadManager {
  constructor(private auth: AuthManager) {}

  async upload(opts: UploadOptions): Promise<UploadResult> {
    const apiUrl = process.env['VITE_API_URL'] || 'https://api.upforge.gg'
    const token = this.auth.getToken()
    if (!token) throw new Error('Not authenticated')

    if (!fs.existsSync(opts.videoPath)) {
      throw new Error(`Recording file not found: ${opts.videoPath}. The recording may have failed to start or was deleted before upload.`)
    }
    const stat = fs.statSync(opts.videoPath)
    const totalBytes = stat.size
    let uploaded = 0

    const form = new FormData()
    const stream = fs.createReadStream(opts.videoPath)
    stream.on('data', (chunk: Buffer | string) => {
      uploaded += typeof chunk === 'string' ? chunk.length : chunk.length
      const pct = Math.round((uploaded / totalBytes) * 100)
      opts.onProgress(Math.min(pct, 99))
    })

    form.append('video', stream, {
      filename: path.basename(opts.videoPath),
      contentType: 'video/mp4',
      knownLength: totalBytes
    })
    form.append('riot_name', opts.riotName)
    form.append('riot_tag', opts.riotTag)
    form.append('game', opts.game)
    if (opts.map) form.append('map', opts.map)
    if (opts.agent) form.append('agent', opts.agent)
    if (opts.timeline) form.append('match_timeline', JSON.stringify(opts.timeline))

    return new Promise((resolve, reject) => {
      const url = new URL(`${apiUrl}/api/desktop-submissions`)
      const options = {
        method: 'POST',
        hostname: url.hostname,
        port: url.port || (url.protocol === 'https:' ? 443 : 80),
        path: url.pathname,
        headers: {
          ...form.getHeaders(),
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/json'
        }
      }

      const proto = url.protocol === 'https:' ? https : http
      const req = proto.request(options, (res) => {
        let body = ''
        res.on('data', (chunk) => body += chunk)
        res.on('end', () => {
          opts.onProgress(100)
          try {
            const data = JSON.parse(body)
            if (res.statusCode && res.statusCode >= 400) {
              reject(new Error(data.message || `Upload failed: ${res.statusCode}`))
            } else {
              resolve({ job_id: data.job_id })
            }
          } catch {
            reject(new Error('Invalid response from server'))
          }
        })
      })

      req.on('error', reject)
      form.pipe(req)
    })
  }

  async pollStatus(jobId: string): Promise<{ status: string; result?: Record<string, unknown> }> {
    const apiUrl = process.env['VITE_API_URL'] || 'https://api.upforge.gg'
    const token = this.auth.getToken()
    if (!token) throw new Error('Not authenticated')

    return new Promise((resolve, reject) => {
      const url = new URL(`${apiUrl}/api/desktop-submissions/${jobId}/status`)
      const proto = url.protocol === 'https:' ? https : http
      const options = {
        hostname: url.hostname,
        port: url.port || (url.protocol === 'https:' ? 443 : 80),
        path: url.pathname,
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/json'
        }
      }
      proto.get(options, (res) => {
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
