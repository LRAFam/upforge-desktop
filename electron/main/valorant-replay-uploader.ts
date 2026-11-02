/**
 * Upload a VALORANT replay to UpForge (presign → PUT to storage → confirm), and report final failures.
 *
 * API contract (upforge-api):
 *   POST /api/valorant/replays/presign {match_id, game_version, checksum, size_bytes, queue_id}
 *        → {upload_id, upload_url} | {already_uploaded: true}
 *   PUT  upload_url (raw .vrf bytes)
 *   POST /api/valorant/replays/confirm {upload_id}
 *   POST /api/valorant/replays/report  {match_id, error, game_version, attempts, queue_id, app_version}
 */
import http from 'http'
import https from 'https'
import { getApiBaseUrl } from './api-base'
import type { UploadResult } from './valorant-replay-sync'

export interface RawResponse {
  status: number
  body: string
}

export type Send = (method: string, url: string, headers: Record<string, string>, body: Buffer | string) => Promise<RawResponse>

export class ValorantReplayUploader {
  constructor(
    private getToken: () => string | null,
    private appVersion: string,
    private send: Send = sendHttp,
    private apiBase: () => string = getApiBaseUrl,
  ) {}

  async upload(matchId: string, bytes: Buffer, meta: { gameVersion: string; checksum: string; queueId?: string }): Promise<UploadResult> {
    const token = this.getToken()
    if (!token) return { ok: false, error: 'not_signed_in' }
    try {
      const pre = await this.post('/api/valorant/replays/presign', token, {
        match_id: matchId, game_version: meta.gameVersion, checksum: meta.checksum, size_bytes: bytes.length, queue_id: meta.queueId ?? null,
      })
      if (pre.status !== 200) return { ok: false, error: `presign_http_${pre.status}` }
      const data = JSON.parse(pre.body) as { already_uploaded?: boolean; upload_id?: string; upload_url?: string }
      if (data.already_uploaded) return { ok: true }
      if (!data.upload_id || !data.upload_url) return { ok: false, error: 'presign_invalid' }
      const put = await this.send('PUT', data.upload_url, { 'Content-Type': 'application/octet-stream', 'Content-Length': String(bytes.length) }, bytes)
      if (put.status < 200 || put.status >= 300) return { ok: false, error: `storage_http_${put.status}` }
      const conf = await this.post('/api/valorant/replays/confirm', token, { upload_id: data.upload_id })
      if (conf.status !== 200) return { ok: false, error: `confirm_http_${conf.status}` }
      return { ok: true }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message.slice(0, 80) : 'network_error' }
    }
  }

  async report(matchId: string, error: string, meta: { gameVersion?: string; attempts: number; queueId?: string }): Promise<void> {
    const token = this.getToken()
    if (!token) return
    try {
      await this.post('/api/valorant/replays/report', token, {
        match_id: matchId, error, game_version: meta.gameVersion ?? null, attempts: meta.attempts,
        queue_id: meta.queueId ?? null, app_version: this.appVersion,
      })
    } catch {
      // Monitoring must never break the sync; the local state still records the failure.
    }
  }

  private post(path: string, token: string, body: Record<string, unknown>): Promise<RawResponse> {
    return this.send('POST', `${this.apiBase()}${path}`, {
      Authorization: `Bearer ${token}`, Accept: 'application/json', 'Content-Type': 'application/json',
    }, JSON.stringify(body))
  }
}

export function sendHttp(method: string, url: string, headers: Record<string, string>, body: Buffer | string): Promise<RawResponse> {
  return new Promise((resolve, reject) => {
    const u = new URL(url)
    const req = (u.protocol === 'https:' ? https : http).request(u, { method, headers, family: 4 }, (res) => {
      let text = ''
      res.on('data', (c: Buffer) => { if (text.length < 4000) text += c.toString('utf8') })
      res.on('end', () => resolve({ status: res.statusCode ?? 0, body: text }))
      res.on('error', reject)
    })
    req.on('error', reject)
    req.setTimeout(300_000, () => req.destroy(new Error('timeout')))
    req.end(body)
  })
}
