import { mkdir, mkdtemp, readFile, rename, stat, writeFile } from 'node:fs/promises'
import { basename, dirname, join, resolve } from 'node:path'
import { prepareMatchDataForUpload } from './match-data-payload'
import type { MatchData } from './riot-types'
import type { CoachingCapability } from './valorant-coaching-quality'

export interface RecentMatchFetchResult {
  ok: boolean
  reason?: string
  matches: Array<{
    matchId: string
    gameStartTimeMs: number | null
    fetchMs: number
    timeline: MatchData | null
    error?: string
    warnings?: string[]
  }>
}

export interface RecentMatchSummary {
  matchId: string
  ok: boolean
  coachingStatus: 'verified_fields_only' | 'blocked'
  capabilities: Record<string, CoachingCapability>
  limitations: string[]
  error?: string
  warnings: string[]
  fetchMs: number
  file: string | null
  playerName: string | null
  playerTag: string | null
  gameStartTimeMs: number | null
  startedAt: string | null
  map: string | null
  agent: string | null
  mode: string | null
  /** The local player's scoreboard totals, never the whole lobby's event count. */
  kills: number | null
  deaths: number | null
  assists: number | null
  playerKillEvents: number
  playerDeathEvents: number
  matchKillEvents: number
  rounds: number
}

export interface RecentMatchReport {
  schemaVersion: 3
  ok: boolean
  reason?: string
  generatedAt: string
  totalMs: number
  folder: string
  successfulMatches: number
  failedMatches: number
  matches: RecentMatchSummary[]
}

/** Restore the latest result after restarting the app, including its saved-files destination. */
export async function readRecentMatchReport(rootDir: string): Promise<RecentMatchReport | null> {
  try {
    const report = JSON.parse(await readFile(join(rootDir, 'summary.json'), 'utf8')) as RecentMatchReport
    if (report.schemaVersion !== 3 || !Array.isArray(report.matches) || typeof report.folder !== 'string') return null
    if (dirname(resolve(report.folder)) !== resolve(rootDir) || !(await stat(report.folder)).isDirectory()) return null
    return report
  } catch {
    return null
  }
}

/** The same coaching payload as uploads, with explicit data-only timing and scope. */
export function serializeRecentMatch(timeline: MatchData, warnings: string[] = []): string {
  if (!timeline.playerName?.trim() || !timeline.playerTag?.trim() || !timeline.puuid) {
    throw new Error('player_identity_missing')
  }
  if (!timeline.matchStartTime || !Number.isFinite(timeline.matchStartTime)) {
    throw new Error('match_start_time_missing')
  }
  // Upload preparation enriches/mutates timing. Never change the caller's timeline.
  const data = prepareMatchDataForUpload(structuredClone(timeline))!
  const issues = [...warnings, ...(data.dataQuality?.issues ?? [])]
  if (issues.length || data.dataQuality?.status !== 'verified_fields_only') {
    throw new Error(`coaching_validation_failed: ${[...new Set(issues)].join(', ') || 'quality_policy_missing'}`)
  }
  const respawnMode = ['DEATHMATCH', 'TEAMDEATHMATCH'].includes(timeline.gameMode ?? '')
  for (const player of data.matchDetailsLite?.players ?? []) {
    if (player.subject?.toLowerCase() !== timeline.puuid.toLowerCase()) continue
    player.gameName ||= timeline.playerName
    player.tagLine ||= timeline.playerTag
  }
  for (const round of data.roundReplay?.rounds ?? []) {
    for (const frame of round.frames) delete frame.v // VOD seek position, not player view direction.
  }

  return JSON.stringify({
    schemaVersion: 3,
    source: 'riot_match_history',
    hasRecording: false,
    respawnMode,
    riot_name: timeline.playerName,
    riot_tag: timeline.playerTag,
    puuid: timeline.puuid,
    game_start_time_ms: timeline.matchStartTime,
    warnings,
    eventScopes: {
      killEvents: 'all_players_match_context',
      playerKills: 'local_player_combat_kills',
      playerDeaths: 'local_player_deaths',
      finalStats: 'local_player_scoreboard',
      spikePlants: 'all_players_match_context',
      spikeDefuses: 'all_players_match_context',
      firstBloods: 'all_players_match_context',
      roundSummaries: 'round_result_with_local_player_stats',
    },
    timing: {
      eventTime: 'seconds_since_match_gameplay_start',
      gameTimeMs: 'milliseconds_since_match_gameplay_start',
      objectiveTiming: 'only consistent observed round clocks are used; missing or conflicting times remain unknown',
    },
    match_data: { ...data, recordingStartTime: null, gameplayStartTime: null },
  }, function (key, value) {
    // There is no video. Do not export invented VOD offsets or recording durations.
    if (['videoOffsetMs', 'videoSyncOffsetMs', 'recordingDurationMs'].includes(key)) return undefined
    if (key === 'EventTime' && this.EventName?.startsWith('Spike') && this.gameTimeMs == null) return null
    return value
  }, 2)
}

/** Separate runs keep old or failed exports from being mistaken for current results. */
export async function saveRecentMatchExports(
  result: RecentMatchFetchResult,
  rootDir: string,
  startedAt: number = Date.now(),
): Promise<RecentMatchReport> {
  await mkdir(rootDir, { recursive: true })
  const generatedAt = new Date().toISOString()
  const folder = await mkdtemp(join(rootDir, generatedAt.replace(/[:.]/g, '-') + '-'))
  const matches: RecentMatchSummary[] = []
  for (const match of result.matches) {
    const t = match.timeline
    let error = match.error
    let file: string | null = null
    let capabilities: Record<string, CoachingCapability> = {}
    let limitations: string[] = []
    const warnings = match.warnings ?? []
    if (t) {
      try {
        if (!/^[a-zA-Z0-9_-]+$/.test(match.matchId)) throw new Error('invalid_match_id')
        const candidate = join(folder, `${match.matchId}.json`)
        const json = serializeRecentMatch(t, warnings)
        const quality = JSON.parse(json).match_data.dataQuality
        capabilities = quality.capabilities
        limitations = quality.limitations
        await writeFile(candidate, json, { flag: 'wx' })
        file = candidate
      } catch (err) {
        error = err instanceof Error ? err.message : 'export_failed'
      }
    }
    const start = t?.matchStartTime ?? match.gameStartTimeMs
    const validStart = start != null && Number.isFinite(start) && start > 0 ? start : null
    matches.push({
      matchId: match.matchId, ok: file !== null, coachingStatus: file !== null ? 'verified_fields_only' : 'blocked',
      capabilities, limitations,
      error, warnings, fetchMs: match.fetchMs, file,
      playerName: t?.playerName ?? null, playerTag: t?.playerTag ?? null,
      gameStartTimeMs: validStart, startedAt: validStart != null ? new Date(validStart).toISOString() : null,
      map: t?.map ?? null, agent: t?.agent ?? null, mode: t?.gameMode ?? null,
      kills: t?.finalStats?.kills ?? null, deaths: t?.finalStats?.deaths ?? null,
      assists: t?.finalStats?.assists ?? null,
      playerKillEvents: t?.playerKills.length ?? 0, playerDeathEvents: t?.playerDeaths.length ?? 0,
      matchKillEvents: t?.killEvents.length ?? 0, rounds: t?.roundSummaries.length ?? 0,
    })
  }
  const successfulMatches = matches.filter((match) => match.ok).length
  const failedMatches = matches.length - successfulMatches
  const ok = result.ok && successfulMatches > 0 && failedMatches === 0
  const report: RecentMatchReport = {
    schemaVersion: 3, ok,
    reason: ok ? undefined : result.reason ?? (failedMatches ? 'some_matches_failed' : 'no_recent_matches'),
    generatedAt, totalMs: Date.now() - startedAt, folder, successfulMatches, failedMatches, matches,
  }
  const json = JSON.stringify(report, null, 2)
  await writeFile(join(folder, 'summary.json'), json)
  const temporarySummary = join(rootDir, `${basename(folder)}-summary.tmp`)
  await writeFile(temporarySummary, json)
  await rename(temporarySummary, join(rootDir, 'summary.json'))
  return report
}
