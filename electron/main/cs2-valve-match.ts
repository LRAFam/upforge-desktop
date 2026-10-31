import type {
  CDataGCCStrike15_v2_MatchInfo,
  CMsgGCCStrike15_v2_MatchmakingGC2ServerReserve,
  CMsgGCCStrike15_v2_MatchmakingServerRoundStats,
} from 'csgo-protobuf'

export interface ValveMatchSummary {
  matchId: string
  matchTimeSec: number
  mapName: string
  demoUrl: string
  fileName: string
}

type GameMode = 8 | 10

function lastRoundStats(match: CDataGCCStrike15_v2_MatchInfo): CMsgGCCStrike15_v2_MatchmakingServerRoundStats | null {
  if (match.roundstatsall?.length) {
    return match.roundstatsall[match.roundstatsall.length - 1] ?? null
  }
  return match.roundstatsLegacy ?? null
}

/** Map id encoded in game_type — mirrors CS Demo Manager's getMapName. */
export function cs2MapNameFromGameType(gameType: number): string {
  const map = (gameType >> 8) & 0xffffff
  const gameMode = (gameType & 0xff) as GameMode
  const competitiveMode: GameMode = 8
  const wingmanMode: GameMode = 10

  const mapping: Record<number, string | Record<GameMode, string>> = {
    [1 << 0]: 'de_warden',
    [1 << 1]: 'de_dust2',
    [1 << 2]: 'de_train',
    [1 << 3]: 'de_ancient',
    [1 << 4]: 'de_inferno',
    [1 << 5]: 'de_nuke',
    [1 << 6]: 'de_vertigo',
    [1 << 7]: { [competitiveMode]: 'de_mirage', [wingmanMode]: 'de_rooftop' },
    [1 << 8]: 'cs_office',
    [1 << 9]: 'de_poseidon',
    [1 << 10]: 'cs_alpine',
    [1 << 11]: 'de_sanctum',
    [1 << 12]: 'de_cache',
    [1 << 13]: 'de_stronghold',
    [1 << 14]: 'de_golden',
    [1 << 15]: 'de_anubis',
    [1 << 16]: 'de_tuscan',
    [1 << 18]: 'de_palacio',
    [1 << 19]: 'cs_agency',
    [1 << 20]: 'de_overpass',
    [1 << 21]: 'de_cobblestone',
    [1 << 22]: 'de_canals',
  }

  const entry = mapping[map]
  if (typeof entry === 'string') return entry
  if (entry && typeof entry === 'object') return entry[gameMode] ?? 'Unknown'
  return 'Unknown'
}

export function buildValveDemoFileName(
  reservationId: bigint,
  tvPort: number,
  serverIp: number,
): string {
  return `match730_${reservationId.toString().padStart(21, '0')}_${tvPort
    .toString()
    .padStart(10, '0')}_${serverIp}`
}

export function valveMatchFromProtobuf(matchInfo: CDataGCCStrike15_v2_MatchInfo): ValveMatchSummary | null {
  const lastRound = lastRoundStats(matchInfo)
  if (!lastRound) return null

  const reservation = lastRound.reservation as CMsgGCCStrike15_v2_MatchmakingGC2ServerReserve | undefined
  if (!reservation) return null

  const demoUrl = lastRound.map?.trim()
  if (!demoUrl || !/^https?:\/\//i.test(demoUrl)) return null

  const watchable = matchInfo.watchablematchinfo
  const tvPort = watchable?.tvPort ?? 0
  const serverIp = watchable?.serverIp ?? 0
  const reservationId = lastRound.reservationid ?? BigInt(0)
  const gameType = reservation.gameType ?? 0

  return {
    matchId: String(matchInfo.matchid ?? ''),
    matchTimeSec: Number(matchInfo.matchtime ?? 0),
    mapName: cs2MapNameFromGameType(gameType),
    demoUrl,
    fileName: buildValveDemoFileName(reservationId, tvPort, serverIp),
  }
}

function normalizeMapName(map: string | null | undefined): string | null {
  if (!map) return null
  const trimmed = map.trim().toLowerCase()
  if (!trimmed || trimmed === 'menu') return null
  return trimmed.startsWith('de_') || trimmed.startsWith('cs_') ? trimmed : `de_${trimmed}`
}

/** Pick the GC match that best fits a recorded session (time + optional map). */
export function pickValveMatchForSession(
  matches: ValveMatchSummary[],
  matchSessionStartMs: number,
  gsiMap: string | null | undefined,
): ValveMatchSummary | null {
  if (!Number.isFinite(matchSessionStartMs) || matchSessionStartMs <= 0) return null
  const sessionStartSec = Math.floor(matchSessionStartMs / 1000)
  const wantedMap = normalizeMapName(gsiMap)
  // Automatic attachment is conservative. Late capture or ambiguous matches
  // require the existing manual picker instead of borrowing another game's stats.
  const candidates = matches.filter((m) =>
    Number.isFinite(m.matchTimeSec)
    && Math.abs(m.matchTimeSec - sessionStartSec) <= 15 * 60
    && (!wantedMap || normalizeMapName(m.mapName) === wantedMap),
  )
  return candidates.length === 1 ? candidates[0] : null
}
