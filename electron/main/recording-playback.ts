import log from 'electron-log'
import { AuthManager } from './auth-manager'

function parseHttpsUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return /^https?:\/\//i.test(trimmed) ? trimmed : null
}

/** Chromium/Electron `<video>` reliably plays these local extensions; OBS often writes `.mkv`. */
export function isLikelyBrowserPlayableLocal(path: string): boolean {
  if (/^https?:\/\//i.test(path)) return true
  return /\.(mp4|webm|m4v|mov)$/i.test(path.replace(/\\/g, '/'))
}

/** Fetch a fresh presigned S3 URL for an analysed desktop recording. */
export async function fetchRecordingPlaybackUrl(
  auth: AuthManager,
  analysisId: number,
): Promise<string | null> {
  try {
    const api = auth.getApi()
    if (!api) return null
    const res = await api.get(`/api/analysis/${analysisId}`)
    const analysis = res.data?.analysis
    const url = parseHttpsUrl(analysis?.recording_url)
    if (url) return url
    return null
  } catch (err) {
    log.warn(`[Playback] Failed to fetch analysis playback URL (${analysisId}):`, err)
    return null
  }
}

/** Fetch playback URL for a cloud-archived recording (no analysis). */
export async function fetchArchivePlaybackUrl(
  auth: AuthManager,
  archiveId: string,
): Promise<string | null> {
  try {
    const api = auth.getApi()
    if (!api) return null
    const res = await api.get(`/api/recordings/archive/${archiveId}/playback`)
    const body = res.data as { playback_url?: unknown; url?: unknown } | undefined
    const url = parseHttpsUrl(body?.playback_url) ?? parseHttpsUrl(body?.url)
    if (url) return url
    return null
  } catch (err) {
    log.warn(`[Playback] Failed to fetch archive playback URL (${archiveId}):`, err)
    return null
  }
}
