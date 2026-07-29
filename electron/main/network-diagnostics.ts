/**
 * In-app network evidence for support: DNS probes for Riot PD + UpForge API,
 * plus last known Riot/upload failure context.
 */
import dns from 'dns'
import { promisify } from 'util'
import { riotPdHostname } from './riot-pd-shard'

export { riotPdHostname } from './riot-pd-shard'

const lookupAsync = promisify(dns.lookup)

export type HostRole = 'riot_pd' | 'upforge_api' | 'other'

export interface DnsLookupResult {
  ok: boolean
  address?: string
  family?: number
  error?: string
  ms: number
}

export interface HostProbe {
  hostname: string
  role: HostRole
  lookupAny: DnsLookupResult
  lookupV4: DnsLookupResult
}

export interface MatchDetailsFetchSnapshot {
  at: number
  statusCode?: number
  error?: string
}

export interface UploadErrorSnapshot {
  at: number
  message: string
}

export interface NetworkDiagnosticsSnapshot {
  at: number
  trigger: string
  region: string | null
  apiBase: string
  hosts: HostProbe[]
  lastRiotMatchDetails: MatchDetailsFetchSnapshot | null
  lastUploadError: UploadErrorSnapshot | null
  node: { version: string; platform: string; arch: string }
}

export interface RunNetworkDiagnosticsOptions {
  trigger: string
  region?: string | null
  apiBase?: string
  lastRiotMatchDetails?: MatchDetailsFetchSnapshot | null
  lastUploadError?: UploadErrorSnapshot | null
}

let lastSnapshot: NetworkDiagnosticsSnapshot | null = null
let lastUploadError: UploadErrorSnapshot | null = null

export function getLastNetworkDiagnostics(): NetworkDiagnosticsSnapshot | null {
  return lastSnapshot
}

export function getLastUploadNetworkError(): UploadErrorSnapshot | null {
  return lastUploadError
}

export function noteUploadNetworkFailure(message: string): void {
  lastUploadError = { at: Date.now(), message: message.slice(0, 500) }
}

export function hostnameFromUrl(url: string): string | null {
  try {
    const host = new URL(url).hostname
    return host || null
  } catch {
    return null
  }
}

export function isLikelyNetworkFailure(message: string): boolean {
  return /ENOTFOUND|EAI_AGAIN|getaddrinfo|ECONNRESET|ECONNABORTED|ETIMEDOUT|EPIPE|socket hang up|network/i.test(
    message,
  )
}

async function lookupOnce(
  hostname: string,
  family: 0 | 4 | 6,
): Promise<DnsLookupResult> {
  const started = Date.now()
  try {
    const result = await lookupAsync(hostname, { family })
    const entry = Array.isArray(result) ? result[0] : result
    return {
      ok: true,
      address: entry.address,
      family: entry.family,
      ms: Date.now() - started,
    }
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      ms: Date.now() - started,
    }
  }
}

export async function probeHost(hostname: string, role: HostRole): Promise<HostProbe> {
  const [lookupAny, lookupV4] = await Promise.all([
    lookupOnce(hostname, 0),
    lookupOnce(hostname, 4),
  ])
  return { hostname, role, lookupAny, lookupV4 }
}

export async function runNetworkDiagnostics(
  opts: RunNetworkDiagnosticsOptions,
): Promise<NetworkDiagnosticsSnapshot> {
  const apiBase = opts.apiBase || process.env['VITE_API_URL'] || 'https://api.upforge.gg'
  const region = opts.region ?? null
  const hosts: HostProbe[] = []

  const riotHost = riotPdHostname(region)
  if (riotHost) {
    hosts.push(await probeHost(riotHost, 'riot_pd'))
  }

  const apiHost = hostnameFromUrl(apiBase)
  if (apiHost) {
    hosts.push(await probeHost(apiHost, 'upforge_api'))
  }

  const snapshot: NetworkDiagnosticsSnapshot = {
    at: Date.now(),
    trigger: opts.trigger,
    region,
    apiBase,
    hosts,
    lastRiotMatchDetails: opts.lastRiotMatchDetails ?? null,
    lastUploadError: opts.lastUploadError ?? lastUploadError,
    node: {
      version: process.versions.node,
      platform: process.platform,
      arch: process.arch,
    },
  }
  lastSnapshot = snapshot
  return snapshot
}

function formatLookup(label: string, result: DnsLookupResult): string {
  if (result.ok) {
    return `${label}=OK ${result.address} (v${result.family ?? '?'}, ${result.ms}ms)`
  }
  return `${label}=FAIL ${result.error ?? 'unknown'} (${result.ms}ms)`
}

export function formatNetworkProbeSummary(snapshot: NetworkDiagnosticsSnapshot): string {
  if (!snapshot.hosts.length) {
    return `no hosts to probe (region=${snapshot.region ?? 'null'})`
  }
  return snapshot.hosts
    .map((h) => {
      const primary = h.lookupV4.ok || !h.lookupAny.ok ? h.lookupV4 : h.lookupAny
      const status = primary.ok ? `OK ${primary.address}` : `FAIL ${primary.error ?? 'unknown'}`
      return `${h.hostname} ${status}`
    })
    .join('; ')
}

export function formatSupportBundle(opts: {
  version: string
  network: NetworkDiagnosticsSnapshot
  activityLog: Array<{ time: number; message: string; game?: string }>
  riot: {
    lockfileFound: boolean
    region: string | null
    accessTokenPresent: boolean
    entitlementsTokenPresent: boolean
    currentMatchId: string | null
    lastSessionLoopState: string
    clientVersion: string
    lastMatchDetailsFetch?: MatchDetailsFetchSnapshot | null
  }
}): string {
  const { version, network, activityLog, riot } = opts
  const lines: string[] = [
    `UpForge Support Bundle v${version}`,
    `Generated: ${new Date().toISOString()}`,
    '',
    '=== NETWORK ===',
    `Trigger: ${network.trigger}`,
    `Probed at: ${new Date(network.at).toISOString()}`,
    `Region: ${network.region ?? 'null'}`,
    `API base: ${network.apiBase}`,
    `Node: ${network.node.version} / ${network.node.platform}-${network.node.arch}`,
  ]

  for (const host of network.hosts) {
    lines.push(
      '',
      `Host [${host.role}]: ${host.hostname}`,
      `  ${formatLookup('any', host.lookupAny)}`,
      `  ${formatLookup('v4', host.lookupV4)}`,
    )
  }

  const lastRiot = network.lastRiotMatchDetails ?? riot.lastMatchDetailsFetch ?? null
  lines.push('', '=== LAST RIOT MATCH DETAILS ===')
  if (!lastRiot) {
    lines.push('No MatchDetails attempt this session.')
  } else {
    lines.push(`At: ${new Date(lastRiot.at).toISOString()}`)
    if (lastRiot.statusCode != null) lines.push(`Status: ${lastRiot.statusCode}`)
    if (lastRiot.error) lines.push(`Error: ${lastRiot.error}`)
  }

  lines.push('', '=== LAST UPLOAD ERROR ===')
  if (!network.lastUploadError) {
    lines.push('None recorded this session.')
  } else {
    lines.push(`At: ${new Date(network.lastUploadError.at).toISOString()}`)
    lines.push(`Message: ${network.lastUploadError.message}`)
  }

  lines.push(
    '',
    '=== RIOT CLIENT ===',
    `Lockfile: ${riot.lockfileFound}`,
    `Region: ${riot.region ?? 'null'}`,
    `Access token: ${riot.accessTokenPresent}`,
    `Entitlements: ${riot.entitlementsTokenPresent}`,
    `Match ID: ${riot.currentMatchId ?? 'null'}`,
    `Session: ${riot.lastSessionLoopState}`,
    `Client version: ${riot.clientVersion}`,
    '',
    '=== ACTIVITY LOG ===',
  )

  if (!activityLog.length) {
    lines.push('(empty)')
  } else {
    for (const entry of activityLog) {
      lines.push(`[${new Date(entry.time).toISOString()}] ${entry.message}`)
    }
  }

  return lines.join('\n')
}
