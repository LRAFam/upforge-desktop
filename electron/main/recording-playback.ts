import fs from 'fs'
import log from 'electron-log'
import { AuthManager } from './auth-manager'
import { MIN_RECORDING_FILE_BYTES } from './recording-limits'
import { recordingPathVariants } from './vod-compressor'

function parseHttpsUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return /^https?:\/\//i.test(trimmed) ? trimmed : null
}

/**
 * Best on-disk recording for local VOD playback — prefers remuxed `_upforge.mp4` siblings
 * when the store still points at raw OBS `.mkv`.
 */
export function resolveLocalRecordingFile(storedPath: string | null | undefined): string | null {
  if (!storedPath?.trim()) return null
  let fallback: string | null = null
  for (const candidate of recordingPathVariants(storedPath)) {
    try {
      if (!fs.existsSync(candidate)) continue
      const size = fs.statSync(candidate).size
      if (size < MIN_RECORDING_FILE_BYTES) continue
      if (isLikelyBrowserPlayableLocal(candidate)) return candidate
      if (!fallback) fallback = candidate
    } catch {
      continue
    }
  }
  return fallback
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

/** Prefer cloud HTTPS playback; only use local path when Chromium can play it. */
export async function resolveCloudFirstPlaybackUrl(opts: {
  auth: AuthManager
  analysisId?: number | null
  archiveId?: string | null
  inlineRecordingUrl?: unknown
  localPath?: string | null
}): Promise<{ url: string | null; archiveId: string | null }> {
  const { auth, analysisId, archiveId, inlineRecordingUrl, localPath } = opts
  let url: string | null = null
  let resolvedArchiveId = typeof archiveId === 'string' && archiveId ? archiveId : null

  url = parseHttpsUrl(inlineRecordingUrl)
  if (!url && resolvedArchiveId) {
    url = await fetchArchivePlaybackUrl(auth, resolvedArchiveId)
  }
  if (!url && analysisId != null) {
    url = await fetchRecordingPlaybackUrl(auth, analysisId)
  }
  if (!url && localPath) {
    url = resolveLocalRecordingFile(localPath)
  }

  return { url, archiveId: resolvedArchiveId }
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
