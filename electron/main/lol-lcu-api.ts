/**
 * League Client Update (LCU) local API probe.
 * Used by Developer diagnostics to verify queue detection before we wire recording filters.
 *
 * Lockfile format: Name:PID:Port:Password:Protocol
 * Typical Windows path: C:\Riot Games\League of Legends\lockfile
 */

import fs from 'fs'
import https from 'https'
import path from 'path'
import { LoLLiveClientApi } from './lol-live-client-api'

const tlsAgent = new https.Agent({ rejectUnauthorized: false })

export interface LolLcuLockfile {
  path: string
  port: number
  /** Never log or return this from IPC. */
  password: string
}

export interface LolLcuProbeResult {
  ok: boolean
  platform: string
  lockfileFound: boolean
  lockfilePath: string | null
  port: number | null
  phase: string | null
  queueId: number | null
  queueLabel: string | null
  /** Normalized mode key for recording filters (RANKED_SOLO, ARAM, …). */
  gameMode: string | null
  mapId: number | null
  summonerName: string | null
  liveClient: {
    reachable: boolean
    inMatch: boolean
    gameMode: string | null
  } | null
  error: string | null
  probedAt: number
}

/** Exported for unit tests. */
export function candidateLolLockfilePaths(
  platform: NodeJS.Platform = process.platform,
  env: NodeJS.ProcessEnv = process.env,
): string[] {
  const paths: string[] = []
  if (platform === 'win32') {
    const pf = env['ProgramFiles'] || 'C:\\Program Files'
    const pf86 = env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)'
    paths.push(
      path.join(pf, 'Riot Games', 'League of Legends', 'lockfile'),
      path.join(pf86, 'Riot Games', 'League of Legends', 'lockfile'),
      'C:\\Riot Games\\League of Legends\\lockfile',
      'D:\\Riot Games\\League of Legends\\lockfile',
    )
    // Some installs keep a copy under Local AppData Riot Client — not the LCU lockfile,
    // but we do not use it for LCU (wrong process). Listed only if present for diagnostics elsewhere.
  } else if (platform === 'darwin') {
    const home = env.HOME || ''
    paths.push(
      '/Applications/League of Legends.app/Contents/LoL/lockfile',
      path.join(home, 'Applications', 'League of Legends.app', 'Contents', 'LoL', 'lockfile'),
    )
  }
  return paths
}

/** Exported for unit tests. */
export function parseLolLockfileContent(content: string, filePath: string): LolLcuLockfile | null {
  const parts = content.trim().split(':')
  if (parts.length < 5) return null
  const port = parseInt(parts[2]!, 10)
  const password = parts[3]
  if (!Number.isFinite(port) || !password) return null
  return { path: filePath, port, password }
}

export function findLolLockfile(
  platform: NodeJS.Platform = process.platform,
  env: NodeJS.ProcessEnv = process.env,
): LolLcuLockfile | null {
  for (const filePath of candidateLolLockfilePaths(platform, env)) {
    try {
      if (!fs.existsSync(filePath)) continue
      const content = fs.readFileSync(filePath, 'utf8')
      const parsed = parseLolLockfileContent(content, filePath)
      if (parsed) return parsed
    } catch {
      /* try next */
    }
  }
  return null
}

/** Common LoL queue IDs → recording filter keys / labels. */
export function normalizeLolQueueId(queueId: number | null | undefined): {
  gameMode: string | null
  queueLabel: string | null
} {
  if (queueId == null || !Number.isFinite(queueId)) {
    return { gameMode: null, queueLabel: null }
  }
  const map: Record<number, { gameMode: string; queueLabel: string }> = {
    400: { gameMode: 'NORMAL', queueLabel: 'Normal Draft' },
    420: { gameMode: 'RANKED_SOLO', queueLabel: 'Ranked Solo/Duo' },
    430: { gameMode: 'NORMAL', queueLabel: 'Normal Blind' },
    440: { gameMode: 'RANKED_FLEX', queueLabel: 'Ranked Flex' },
    450: { gameMode: 'ARAM', queueLabel: 'ARAM' },
    // ARAM: Mayhem (Live Client gameMode "KIWI"). Sibling IDs from CommunityDragon queues.json.
    2400: { gameMode: 'ARAM', queueLabel: 'ARAM: Mayhem' },
    2401: { gameMode: 'ARAM', queueLabel: 'ARAM: Mayhem' },
    2403: { gameMode: 'ARAM', queueLabel: 'ARAM: Mayhem' },
    2405: { gameMode: 'ARAM', queueLabel: 'ARAM: Mayhem' },
    700: { gameMode: 'CLASH', queueLabel: 'Clash' },
    900: { gameMode: 'URF', queueLabel: 'URF' },
    1020: { gameMode: 'ONE_FOR_ALL', queueLabel: 'One for All' },
    1300: { gameMode: 'NEXUS_BLITZ', queueLabel: 'Nexus Blitz' },
    1700: { gameMode: 'ARENA', queueLabel: 'Arena' },
    1710: { gameMode: 'ARENA', queueLabel: 'Arena' },
  }
  const hit = map[queueId]
  if (hit) return hit
  return { gameMode: `QUEUE_${queueId}`, queueLabel: `Queue ${queueId}` }
}

/**
 * Resolve a Settings recording-filter key for LoL.
 * LCU queue IDs are preferred; Live Client modes and Howling Abyss map fill gaps.
 * Ranked/normals collapse to CLASSIC until the UI splits them.
 */
export function resolveLolFilterMode(opts: {
  queueId?: number | null
  lcuGameMode?: string | null
  liveGameMode?: string | null
  mapId?: number | null
}): string | null {
  const fromQueue = normalizeLolQueueId(opts.queueId ?? null)
  if (fromQueue.gameMode === 'ARAM' || fromQueue.gameMode === 'ARENA') {
    return fromQueue.gameMode
  }
  if (
    fromQueue.gameMode === 'RANKED_SOLO'
    || fromQueue.gameMode === 'RANKED_FLEX'
    || fromQueue.gameMode === 'NORMAL'
    || fromQueue.gameMode === 'CLASH'
  ) {
    return 'CLASSIC'
  }

  const live = (opts.liveGameMode ?? opts.lcuGameMode ?? '').toUpperCase()
  if (live === 'KIWI' || live.includes('ARAM')) return 'ARAM'
  if (live === 'CHERRY' || live.includes('ARENA')) return 'ARENA'
  if (live === 'CLASSIC') return 'CLASSIC'
  if (live === 'PRACTICETOOL' || live === 'CUSTOM' || live === 'TUTORIAL') return 'CUSTOM'

  // Howling Abyss (map 12) without a known queue → treat as ARAM-family.
  if (opts.mapId === 12) return 'ARAM'

  if (fromQueue.gameMode?.startsWith('QUEUE_')) {
    if (opts.mapId === 12) return 'ARAM'
    return fromQueue.gameMode
  }

  return opts.liveGameMode ?? opts.lcuGameMode ?? fromQueue.gameMode
}

function lcuGet<T>(lockfile: LolLcuLockfile, apiPath: string): Promise<T> {
  const auth = Buffer.from(`riot:${lockfile.password}`).toString('base64')
  return new Promise((resolve, reject) => {
    const req = https.get(
      {
        hostname: '127.0.0.1',
        port: lockfile.port,
        path: apiPath,
        headers: { Authorization: `Basic ${auth}` },
        agent: tlsAgent,
      },
      (res) => {
        let body = ''
        res.on('data', (chunk) => { body += String(chunk) })
        res.on('end', () => {
          if (res.statusCode === 404) {
            reject(new Error(`HTTP 404 for ${apiPath} (League Client idle or endpoint missing)`))
            return
          }
          if (res.statusCode !== 200) {
            reject(new Error(`HTTP ${res.statusCode} for ${apiPath}`))
            return
          }
          try {
            resolve(JSON.parse(body) as T)
          } catch {
            reject(new Error('Invalid LCU JSON'))
          }
        })
      },
    )
    req.on('error', reject)
    req.setTimeout(4000, () => {
      req.destroy()
      reject(new Error('LCU timeout'))
    })
  })
}

interface GameflowSession {
  phase?: string
  gameData?: {
    queue?: { id?: number; name?: string }
    map?: { id?: number }
  }
  map?: { id?: number }
}

/** Extract queue/map/phase from gameflow session JSON (shape varies by phase). */
export function parseGameflowSession(session: GameflowSession | null | undefined): {
  phase: string | null
  queueId: number | null
  mapId: number | null
} {
  if (!session || typeof session !== 'object') {
    return { phase: null, queueId: null, mapId: null }
  }
  const phase = typeof session.phase === 'string' ? session.phase : null
  const queueIdRaw = session.gameData?.queue?.id
  const queueId = typeof queueIdRaw === 'number' ? queueIdRaw : null
  const mapIdRaw = session.gameData?.map?.id ?? session.map?.id
  const mapId = typeof mapIdRaw === 'number' ? mapIdRaw : null
  return { phase, queueId, mapId }
}

/** Map LoL platform routing id (EUW1, NA1, …) to Match-V5 regional cluster. */
export function lolPlatformToMatchV5Region(platform: string | null | undefined): string | null {
  if (!platform?.trim()) return null
  const map: Record<string, string> = {
    BR1: 'americas',
    LA1: 'americas',
    LA2: 'americas',
    NA1: 'americas',
    OC1: 'asia',
    JP1: 'asia',
    KR: 'asia',
    EUN1: 'europe',
    EUW1: 'europe',
    TR1: 'europe',
    RU: 'europe',
  }
  return map[platform.trim().toUpperCase()] ?? null
}

/** Linked LoL puuid when the auth payload includes it (never invented). */
export function lolLinkedPuuidFromAuth(user: {
  lol_puuid?: string | null
  riot_puuid?: string | null
} | null | undefined): string | null {
  const lol = user?.lol_puuid?.trim()
  if (lol) return lol
  const shared = user?.riot_puuid?.trim()
  return shared || null
}

/**
 * Probe League LCU + Live Client. Safe for IPC (no password).
 * Run with League Client open; best signal in champ select / loading / in-game.
 */
export async function probeLolLcu(opts?: {
  liveClient?: LoLLiveClientApi
}): Promise<LolLcuProbeResult> {
  const probedAt = Date.now()
  const platform = process.platform
  const empty = (partial: Partial<LolLcuProbeResult>): LolLcuProbeResult => ({
    ok: false,
    platform,
    lockfileFound: false,
    lockfilePath: null,
    port: null,
    phase: null,
    queueId: null,
    queueLabel: null,
    gameMode: null,
    mapId: null,
    summonerName: null,
    liveClient: null,
    error: null,
    probedAt,
    ...partial,
  })

  const lockfile = findLolLockfile()
  if (!lockfile) {
    return empty({
      error: platform === 'win32'
        ? 'League lockfile not found — open the League Client on Windows'
        : `League LCU probe expects Windows (platform=${platform})`,
    })
  }

  let liveClient: LolLcuProbeResult['liveClient'] = null
  try {
    const api = opts?.liveClient ?? new LoLLiveClientApi()
    const probe = await api.probeActiveMatch()
    liveClient = {
      reachable: probe != null,
      inMatch: probe?.inMatch ?? false,
      gameMode: probe?.gameMode ?? null,
    }
  } catch {
    liveClient = { reachable: false, inMatch: false, gameMode: null }
  }

  try {
    const session = await lcuGet<GameflowSession>(lockfile, '/lol-gameflow/v1/session')
    const { phase, queueId, mapId } = parseGameflowSession(session)
    const { gameMode, queueLabel } = normalizeLolQueueId(queueId)

    let summonerName: string | null = null
    try {
      const summoner = await lcuGet<{ displayName?: string; gameName?: string }>(
        lockfile,
        '/lol-summoner/v1/current-summoner',
      )
      summonerName = summoner.displayName ?? summoner.gameName ?? null
    } catch {
      /* optional */
    }

    return {
      ok: true,
      platform,
      lockfileFound: true,
      lockfilePath: lockfile.path,
      port: lockfile.port,
      phase,
      queueId,
      queueLabel,
      gameMode,
      mapId,
      summonerName,
      liveClient,
      error: null,
      probedAt,
    }
  } catch (err) {
    return empty({
      lockfileFound: true,
      lockfilePath: lockfile.path,
      port: lockfile.port,
      liveClient,
      error: err instanceof Error ? err.message : String(err),
    })
  }
}
