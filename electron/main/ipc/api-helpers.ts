/**
 * api-helpers.ts
 * Shared utilities for IPC handlers: polling state, in-flight locks,
 * HTTP helper, clip analysis polling, and desktop capture source tracking.
 */

import https from 'https'
import http from 'http'
import log from 'electron-log'
import { BrowserWindow } from 'electron'
import { ClipStore } from '../clip-store'
import { UpgradeRequiredError } from '../errors'

// ── Polling state ─────────────────────────────────────────────────────────────

/** Tracks all active clip-analysis polling timers so they can be cancelled on logout/quit. */
export const _activePollingTimers = new Set<ReturnType<typeof setTimeout>>()

/** Cancel all in-flight clip analysis polling timers. Called on logout and app quit. */
export function cancelAllPollingTimers(): void {
  for (const timer of _activePollingTimers) clearTimeout(timer)
  _activePollingTimers.clear()
}

// ── Per-clip in-flight lock ───────────────────────────────────────────────────

/** Prevents concurrent trim/upload/delete operations on the same clip file. */
export const _clipInFlight = new Set<string>()

// ── Desktop capture source tracking ──────────────────────────────────────────

let _pendingCaptureSourceId: string | null = null

export function setPendingCaptureSourceId(id: string): void {
  _pendingCaptureSourceId = id
}

export function consumePendingCaptureSourceId(): string | null {
  const id = _pendingCaptureSourceId
  _pendingCaptureSourceId = null
  return id
}

// ── HTTP helper ───────────────────────────────────────────────────────────────

/** POST JSON to an API endpoint with Bearer auth. */
export function apiPost(base: string, pathname: string, body: string, token: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const url = new URL(`${base}${pathname}`)
    const proto = url.protocol === 'https:' ? https : http
    const req = proto.request({
      method: 'POST',
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname + url.search,
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json',
      },
    }, (res) => {
      let data = ''
      res.on('data', (c: Buffer) => { data += c.toString() })
      res.on('end', () => {
        let json: Record<string, unknown> = {}
        try {
          json = JSON.parse(data)
        } catch {
          reject(new Error(`Invalid response (HTTP ${res.statusCode})`))
          return
        }
        if (res.statusCode === 402) {
          reject(new UpgradeRequiredError(
            (json.message as string) || 'Upgrade required',
            (json.error as string) || 'upgrade_required',
            (json.upgrade_url as string) || 'https://upforge.gg/pricing',
            (json.ppa_url as string) || 'https://upforge.gg/valorant/analyze',
          ))
        } else if ((res.statusCode ?? 0) >= 400) {
          reject(new Error((json.message as string) || `Request failed (${res.statusCode})`))
        } else {
          resolve(json)
        }
      })
    })
    req.on('error', reject)
    req.setTimeout(30_000, () => req.destroy(new Error('Request timed out')))
    req.write(body)
    req.end()
  })
}

// ── Clip analysis polling ─────────────────────────────────────────────────────

/** Poll the API for clip analysis completion, updating the local store when done. */
export function pollClipAnalysis(
  localClipId: string,
  apiClipId: number,
  token: string,
  clipStore: ClipStore,
  apiBase: string,
  attempt = 0
): void {
  const delay = Math.min(5000 * Math.pow(1.4, attempt), 30_000)
  const timer = setTimeout(async () => {
    _activePollingTimers.delete(timer)
    if (attempt > 30) {
      clipStore.update(localClipId, { analysisStatus: 'failed' })
      BrowserWindow.getAllWindows().forEach(w => {
        if (!w.isDestroyed()) w.webContents.send('analysis:timeout', localClipId)
      })
      return
    }
    try {
      const url = new URL(`${apiBase}/api/clips/${apiClipId}/analysis`)
      const proto = url.protocol === 'https:' ? https : http
      const result = await new Promise<Record<string, unknown>>((resolve, reject) => {
        proto.get({
          hostname: url.hostname,
          port: url.port || (url.protocol === 'https:' ? 443 : 80),
          path: url.pathname,
          headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' },
        }, (res) => {
          let data = ''
          res.on('data', (c: Buffer) => { data += c.toString() })
          res.on('end', () => {
            try { resolve(JSON.parse(data) as Record<string, unknown>) }
            catch { reject(new Error('Invalid JSON')) }
          })
        }).on('error', reject)
      })

      const status = result.status as string
      if (status === 'completed') {
        clipStore.update(localClipId, {
          analysisStatus: 'completed',
          verdict: result.verdict as string ?? null,
          suggestion: result.suggestion as string ?? null,
          coachingTags: (result.coaching_tags as string[]) ?? [],
          overallScore: result.overall_score as number ?? null,
        })
      } else if (status === 'failed') {
        clipStore.update(localClipId, { analysisStatus: 'failed' })
      } else {
        clipStore.update(localClipId, { analysisStatus: 'processing' })
        pollClipAnalysis(localClipId, apiClipId, token, clipStore, apiBase, attempt + 1)
      }
    } catch {
      pollClipAnalysis(localClipId, apiClipId, token, clipStore, apiBase, attempt + 1)
    }
  }, delay)
  _activePollingTimers.add(timer)
}
