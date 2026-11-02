/**
 * Fetch the parsed replay of a match for the 2D viewer. Runs in the main process because the page's
 * Content-Security-Policy only allows the UpForge API, not the storage host behind the short-lived link.
 */
import zlib from 'zlib'
import { getApiBaseUrl } from './api-base'
import { httpsGet, type HttpGet } from './valorant-replay-download'

export type ViewerReplayResult =
  | { ok: true; status: 'parsed'; compact: unknown }
  | { ok: false; status: string; error?: string }

const MATCH_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const cache = new Map<string, unknown>()

export async function fetchViewerReplay(matchId: string, token: string | null, get: HttpGet = httpsGet, apiBase = getApiBaseUrl()): Promise<ViewerReplayResult> {
  if (!MATCH_ID.test(matchId)) return { ok: false, status: 'none', error: 'invalid_match_id' }
  if (!token) return { ok: false, status: 'none', error: 'not_signed_in' }
  const id = matchId.toLowerCase()
  if (cache.has(id)) return { ok: true, status: 'parsed', compact: cache.get(id) }
  try {
    const meta = await get(`${apiBase}/api/valorant/replays/${id}`, { Authorization: `Bearer ${token}`, Accept: 'application/json' })
    if (meta.status !== 200) return { ok: false, status: 'none', error: `api_http_${meta.status}` }
    const info = JSON.parse(meta.body.toString('utf8')) as { status?: string; compact_url?: string | null }
    if (info.status !== 'parsed' || !info.compact_url) return { ok: false, status: info.status ?? 'none' }
    const file = await get(info.compact_url, {})
    if (file.status !== 200) return { ok: false, status: 'parsed', error: `storage_http_${file.status}` }
    const raw = file.body[0] === 0x1f && file.body[1] === 0x8b ? zlib.gunzipSync(file.body) : file.body
    const compact = JSON.parse(raw.toString('utf8'))
    cache.set(id, compact)
    if (cache.size > 3) cache.delete(cache.keys().next().value as string)
    return { ok: true, status: 'parsed', compact }
  } catch (err) {
    return { ok: false, status: 'none', error: err instanceof Error ? err.message.slice(0, 80) : 'network_error' }
  }
}

export function clearViewerReplayCache(): void {
  cache.clear()
}
