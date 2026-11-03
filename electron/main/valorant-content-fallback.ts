/**
 * Fallback names for Valorant agents and maps the static tables in riot-lookup-tables.ts
 * don't know yet (a new agent or map released after this build).
 *
 * Fetches valorant-api.com once, keeps only uuid → name and map codename → name, and caches
 * that to userData. Lookups are synchronous and never block: a miss starts a background
 * refresh (rate-limited) and the next lookup gets the name.
 */
import fs from 'fs'
import path from 'path'

const AGENTS_URL = 'https://valorant-api.com/v1/agents?isPlayableCharacter=true'
const MAPS_URL = 'https://valorant-api.com/v1/maps'
const CACHE_FILE = 'valorant-content-names.json'
const FETCH_TIMEOUT_MS = 8_000
/** Hard cap on each response body; the real ones are well under 1 MB. */
const MAX_RESPONSE_BYTES = 4 * 1024 * 1024
/** Cap on stored entries per table so a bad response can't grow the cache file. */
const MAX_ENTRIES = 300
const MAX_NAME_LENGTH = 40
/** Refresh a cache older than this. */
const STALE_AFTER_MS = 7 * 24 * 60 * 60 * 1000
/** Never fetch more often than this, even on repeated misses or failures. */
const MIN_RETRY_MS = 30 * 60 * 1000

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export interface ValorantContentNames {
  fetchedAt: number
  /** Lower-case agent uuid → display name. */
  agents: Record<string, string>
  /** Lower-case map codename (last mapUrl segment) → display name. */
  maps: Record<string, string>
}

type FetchLike = (url: string, init?: { signal?: AbortSignal }) => Promise<{
  ok: boolean
  headers: { get(name: string): string | null }
  text(): Promise<string>
}>

let cache: ValorantContentNames | null = null
let cachePath: string | null = null
let inflight: Promise<void> | null = null
let lastAttemptAt = 0
let fetchImpl: FetchLike = (url, init) => fetch(url, init)
let now: () => number = () => Date.now()

function cleanName(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const name = value.trim()
  return name && name.length <= MAX_NAME_LENGTH ? name : null
}

/** valorant-api /v1/agents body → { uuid: name }. */
export function parseAgentNames(body: unknown): Record<string, string> {
  const out: Record<string, string> = {}
  const rows = (body as { data?: unknown })?.data
  if (!Array.isArray(rows)) return out
  for (const row of rows) {
    if (Object.keys(out).length >= MAX_ENTRIES) break
    const uuid = (row as { uuid?: unknown })?.uuid
    const name = cleanName((row as { displayName?: unknown })?.displayName)
    if (typeof uuid === 'string' && UUID_RE.test(uuid) && name) out[uuid.toLowerCase()] = name
  }
  return out
}

/** valorant-api /v1/maps body → { codename: name } (codename = last segment of mapUrl). */
export function parseMapNames(body: unknown): Record<string, string> {
  const out: Record<string, string> = {}
  const rows = (body as { data?: unknown })?.data
  if (!Array.isArray(rows)) return out
  for (const row of rows) {
    if (Object.keys(out).length >= MAX_ENTRIES) break
    const mapUrl = (row as { mapUrl?: unknown })?.mapUrl
    const name = cleanName((row as { displayName?: unknown })?.displayName)
    if (typeof mapUrl !== 'string' || !name) continue
    const codename = mapUrl.split('/').filter(Boolean).pop()?.toLowerCase()
    if (codename && /^[a-z0-9_]{1,40}$/.test(codename)) out[codename] = name
  }
  return out
}

async function fetchJson(url: string): Promise<unknown> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const res = await fetchImpl(url, { signal: controller.signal })
    if (!res.ok) throw new Error(`HTTP error from ${url}`)
    const declared = Number(res.headers.get('content-length') ?? 0)
    if (declared > MAX_RESPONSE_BYTES) throw new Error('Response too large')
    const text = await res.text()
    if (text.length > MAX_RESPONSE_BYTES) throw new Error('Response too large')
    return JSON.parse(text)
  } finally {
    clearTimeout(timer)
  }
}

function readCacheFile(file: string): ValorantContentNames | null {
  try {
    const raw = fs.readFileSync(file, 'utf8')
    if (raw.length > MAX_RESPONSE_BYTES) return null
    const parsed = JSON.parse(raw) as Partial<ValorantContentNames>
    if (typeof parsed.fetchedAt !== 'number') return null
    return {
      fetchedAt: parsed.fetchedAt,
      agents: parseAgentNames({ data: Object.entries(parsed.agents ?? {}).map(([uuid, displayName]) => ({ uuid, displayName })) }),
      maps: parseMapNames({ data: Object.entries(parsed.maps ?? {}).map(([code, displayName]) => ({ mapUrl: code, displayName })) }),
    }
  } catch {
    return null
  }
}

/** Fetch fresh names now (deduped and rate-limited). Never throws. */
export function refreshValorantContentNames(): Promise<void> {
  if (inflight) return inflight
  if (now() - lastAttemptAt < MIN_RETRY_MS) return Promise.resolve()
  lastAttemptAt = now()
  inflight = (async () => {
    try {
      const [agentsBody, mapsBody] = await Promise.all([fetchJson(AGENTS_URL), fetchJson(MAPS_URL)])
      const agents = parseAgentNames(agentsBody)
      const maps = parseMapNames(mapsBody)
      if (!Object.keys(agents).length && !Object.keys(maps).length) return
      cache = { fetchedAt: now(), agents, maps }
      if (cachePath) {
        try {
          fs.writeFileSync(cachePath, JSON.stringify(cache))
        } catch { /* cache stays in memory */ }
      }
    } catch (err) {
      console.warn('[ValorantContent] name refresh failed:', err instanceof Error ? err.message : err)
    } finally {
      inflight = null
    }
  })()
  return inflight
}

/** Load the cached names from userData and refresh in the background when stale. */
export function initValorantContentFallback(userDataDir: string): void {
  cachePath = path.join(userDataDir, CACHE_FILE)
  cache = readCacheFile(cachePath) ?? cache
  if (!cache || now() - cache.fetchedAt > STALE_AFTER_MS) void refreshValorantContentNames()
}

/** Agent display name from the fetched cache; a miss queues a refresh and returns null. */
export function fallbackAgentName(uuid: string): string | null {
  const name = cache?.agents[uuid.toLowerCase()]
  if (name) return name
  if (UUID_RE.test(uuid)) void refreshValorantContentNames()
  return null
}

/** Map display name from the fetched cache; a miss queues a refresh and returns null. */
export function fallbackMapName(codename: string): string | null {
  const name = cache?.maps[codename.toLowerCase()]
  if (name) return name
  void refreshValorantContentNames()
  return null
}

/** Test hooks. */
export function __setValorantContentTestHooks(hooks: { fetch?: FetchLike; now?: () => number; reset?: boolean }): void {
  if (hooks.fetch) fetchImpl = hooks.fetch
  if (hooks.now) now = hooks.now
  if (hooks.reset) {
    cache = null
    cachePath = null
    inflight = null
    lastAttemptAt = 0
  }
}
