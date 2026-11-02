/**
 * Download the player's own VALORANT replay (.vrf) for a finished match, the way the game client does.
 *
 * Riot's match data only has positions at kills, plants and defuses. The replay has everyone's movement for
 * the whole match, so post-game coaching can see the decisions between kills. Flow (from the community
 * ValorantReplayViewer project, MIT):
 *   1. GET https://shared.{shard}.a.pvp.net/v1/config/{region} -> Collapsed.SERVICEURL_GAME_AGNOSTIC_MATCH_HISTORY
 *   2. GET {base}match-history-query/v3/product/valorant/matchId/{id}/infoType/summary -> { GameVersion, Checksum }
 *   3. GET {base}match-history-query/v3/product/valorant/matchId/{id}/infoType/replay  -> raw .vrf bytes
 *   4. SHA-256 (hex) of the bytes must equal Checksum.
 * Same auth headers as the PD match-details call in riot-local-api.ts. Undocumented Riot endpoints: post-game
 * only, the player's own matches only.
 */
import crypto from 'crypto'
import fs from 'fs'
import https from 'https'
import path from 'path'
import { riotPdShard } from './riot-pd-shard'

export const CLIENT_PLATFORM =
  'ew0KCSJwbGF0Zm9ybVR5cGUiOiAiUEMiLA0KCSJwbGF0Zm9ybU9TIjogIldpbmRvd3MiLA0KCSJwbGF0Zm9ybU9TVmVyc2lvbiI6ICIxMC4wLjE5MDQyLjEuMjU2LjY0Yml0IiwNCgkicGxhdGZvcm1DaGlwc2V0IjogIlVua25vd24iDQp9'

const MATCH_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const SERVICE_KEY = 'SERVICEURL_GAME_AGNOSTIC_MATCH_HISTORY'
const MAX_REPLAY_BYTES = 300 * 1024 * 1024

export interface ReplayAuth {
  region: string
  accessToken: string
  entitlementsToken: string
  clientVersion: string
}

export interface HttpResult {
  status: number
  body: Buffer
}

export type HttpGet = (url: string, headers: Record<string, string>) => Promise<HttpResult>

export type ReplayDownloadResult =
  | { ok: true; bytes: Buffer; gameVersion: string; checksum: string }
  | { ok: false; error: string }

export function replayHeaders(auth: ReplayAuth): Record<string, string> {
  return {
    Authorization: `Bearer ${auth.accessToken}`,
    'X-Riot-Entitlements-JWT': auth.entitlementsToken,
    'X-Riot-ClientPlatform': CLIENT_PLATFORM,
    'X-Riot-ClientVersion': auth.clientVersion,
  }
}

/** The Valorant region id the config endpoint expects (na, latam, br, eu, ap, kr). */
export function configRegion(region: string | null | undefined): string | null {
  if (!region) return null
  const key = region.replace(/\d+$/, '').toLowerCase()
  if (key === 'euw' || key === 'eun') return 'eu'
  if (key === 'ko') return 'kr'
  return /^[a-z]+$/.test(key) ? key : null
}

export function sharedConfigUrl(region: string | null | undefined): string | null {
  const shard = riotPdShard(region)
  const r = configRegion(region)
  return shard && r ? `https://shared.${shard}.a.pvp.net/v1/config/${r}` : null
}

const baseCache = new Map<string, string>()

export function clearReplayBaseCache(): void {
  baseCache.clear()
}

async function replayBaseUrl(auth: ReplayAuth, get: HttpGet): Promise<string | { error: string }> {
  const url = sharedConfigUrl(auth.region)
  if (!url) return { error: 'missing_region' }
  const cached = baseCache.get(url)
  if (cached) return cached
  const res = await get(url, replayHeaders(auth))
  if (res.status !== 200) return { error: `config_http_${res.status}` }
  let base: unknown
  try {
    base = (JSON.parse(res.body.toString('utf8')) as { Collapsed?: Record<string, unknown> }).Collapsed?.[SERVICE_KEY]
  } catch {
    return { error: 'config_invalid_json' }
  }
  if (typeof base !== 'string' || !/^https:\/\//.test(base)) return { error: 'config_missing_replay_service' }
  const normalised = base.endsWith('/') ? base : `${base}/`
  baseCache.set(url, normalised)
  return normalised
}

export async function downloadReplay(matchId: string, auth: ReplayAuth, get: HttpGet = httpsGet): Promise<ReplayDownloadResult> {
  if (!MATCH_ID.test(matchId)) return { ok: false, error: 'invalid_match_id' }
  if (!auth.accessToken || !auth.entitlementsToken) return { ok: false, error: 'missing_auth' }
  try {
    const base = await replayBaseUrl(auth, get)
    if (typeof base !== 'string') return { ok: false, error: base.error }
    const prefix = `${base}match-history-query/v3/product/valorant/matchId/${matchId}/infoType/`
    const headers = replayHeaders(auth)
    const summaryRes = await get(`${prefix}summary`, headers)
    if (summaryRes.status === 404) return { ok: false, error: 'no_replay' }
    if (summaryRes.status !== 200) return { ok: false, error: `summary_http_${summaryRes.status}` }
    let summary: { GameVersion?: unknown; Checksum?: unknown }
    try {
      summary = JSON.parse(summaryRes.body.toString('utf8'))
    } catch {
      return { ok: false, error: 'summary_invalid_json' }
    }
    if (typeof summary.Checksum !== 'string' || !summary.Checksum) return { ok: false, error: 'summary_missing_checksum' }
    const replayRes = await get(`${prefix}replay`, headers)
    if (replayRes.status === 404) return { ok: false, error: 'no_replay' }
    if (replayRes.status !== 200) return { ok: false, error: `replay_http_${replayRes.status}` }
    const hash = crypto.createHash('sha256').update(replayRes.body).digest('hex')
    if (hash !== summary.Checksum.trim().toLowerCase()) return { ok: false, error: 'checksum_mismatch' }
    return { ok: true, bytes: replayRes.body, gameVersion: String(summary.GameVersion ?? ''), checksum: hash }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

/** Save as `<dir>/<matchId>.vrf` (written to a temp name first so a crash never leaves half a file). */
export function saveReplay(dir: string, matchId: string, bytes: Buffer): string {
  if (!MATCH_ID.test(matchId)) throw new Error('invalid_match_id')
  fs.mkdirSync(dir, { recursive: true })
  const target = path.join(dir, `${matchId.toLowerCase()}.vrf`)
  const tmp = `${target}.part`
  fs.writeFileSync(tmp, bytes)
  fs.renameSync(tmp, target)
  return target
}

export function httpsGet(url: string, headers: Record<string, string>, redirects = 3): Promise<HttpResult> {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers, family: 4 }, (res) => {
      const status = res.statusCode ?? 0
      if (status >= 300 && status < 400 && res.headers.location && redirects > 0) {
        res.resume()
        // Riot may hand the file off to a CDN; auth headers stay on Riot hosts only.
        const next = new URL(res.headers.location, url)
        const keep = /\.pvp\.net$|\.riotgames\.com$/.test(next.hostname) ? headers : {}
        httpsGet(next.toString(), keep, redirects - 1).then(resolve, reject)
        return
      }
      const chunks: Buffer[] = []
      let size = 0
      res.on('data', (c: Buffer) => {
        size += c.length
        if (size > MAX_REPLAY_BYTES) {
          req.destroy(new Error('replay_too_large'))
          return
        }
        chunks.push(c)
      })
      res.on('end', () => resolve({ status, body: Buffer.concat(chunks) }))
      res.on('error', reject)
    })
    req.on('error', reject)
    req.setTimeout(120_000, () => req.destroy(new Error('timeout')))
  })
}
