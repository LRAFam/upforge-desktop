import type { MatchData } from './riot-types'
import type { UploadMatchData } from './match-data-payload'
import { riotGameTime } from './riot-event-time'

type Row = Record<string, unknown>
export type CoachingCapability = 'available' | 'partial' | 'unavailable' | 'not_applicable' | 'excluded'
export interface CoachingDataQuality {
  policyVersion: 1
  status: 'verified_fields_only' | 'blocked'
  issues: string[]
  capabilities: Record<string, CoachingCapability>
  limitations: string[]
  excludedFields: string[]
  localNameSource: 'match_record' | 'current_account' | 'unavailable'
  playerNames: Array<{ puuid: string; name: string | null; tag: string | null; source: 'match_record' | 'current_account' | 'unavailable' }>
}

const rows = (value: unknown): Row[] => Array.isArray(value) ? value.filter(v => v && typeof v === 'object') : []
const sameId = (a: unknown, b: unknown) => typeof a === 'string' && typeof b === 'string' && a.toLowerCase() === b.toLowerCase()
const nonnegative = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0
const count = (value: unknown): value is number => nonnegative(value) && Number.isInteger(value)
const text = (value: unknown): string | null => typeof value === 'string' && value.trim() ? value.trim() : null
export const isRespawnMode = (mode: string | null | undefined): boolean => ['DEATHMATCH', 'TEAMDEATHMATCH'].includes(mode ?? '')

/** A missing cast field is unknown, not zero. */
export function reportedAbilityCasts(value: unknown): { grenade: number; ability1: number; ability2: number; ultimate: number } | null {
  const casts = value as Row | undefined
  if (!casts || !['grenadeCasts', 'ability1Casts', 'ability2Casts', 'ultimateCasts'].every(k => count(casts[k]))) return null
  return { grenade: casts.grenadeCasts as number, ability1: casts.ability1Casts as number,
    ability2: casts.ability2Casts as number, ultimate: casts.ultimateCasts as number }
}

function scoreFor(stats: Row | undefined, roundCount: number, respawn: boolean) {
  const total = nonnegative(stats?.score) ? stats.score : null
  const rounds = count(stats?.roundsPlayed) && stats.roundsPlayed > 0 ? stats.roundsPlayed : roundCount
  return { score: !respawn && total != null && rounds > 0 ? Math.round(total / rounds) : null,
    totalCombatScore: total, scoreKind: respawn ? 'total_score' as const : 'average_combat_score' as const }
}

/** Normalize a copy at the coaching boundary, including older saved timelines. */
export function normalizeValorantCoachingStats(timeline: MatchData): void {
  const raw = timeline.matchDetails
  const players = rows(raw?.players)
  const rounds = rows(raw?.roundResults)
  const own = players.find(p => sameId(p.subject, timeline.puuid))
  const respawn = isRespawnMode(timeline.gameMode)
  const playerStats = rounds.map(r => rows(r.playerStats).find(p => sameId(p.subject, timeline.puuid)))
  // Empty arrays across an entire match (as in Skirmish) do not establish zero damage.
  const damageReported = rounds.some(r => rows(r.playerStats).some(p => rows(p.damage).some(d => nonnegative(d.damage))))
  const validDamage = (p: Row | undefined) => damageReported && Array.isArray(p?.damage)
    && rows(p.damage).length === p.damage.length && rows(p.damage).every(d => nonnegative(d.damage))
  const damageComplete = rounds.length > 0 && playerStats.every(validDamage)
  const damageRows = playerStats.flatMap(p => rows(p?.damage))
  const hitsComplete = damageComplete && damageRows.every(d => ['headshots', 'bodyshots', 'legshots'].every(k => count(d[k])))
  const damage = damageRows.reduce((sum, d) => sum + (nonnegative(d.damage) ? d.damage : 0), 0)
  const hits = damageRows.reduce((sum, d) => sum + ['headshots', 'bodyshots', 'legshots'].reduce((n, k) => n + (count(d[k]) ? d[k] : 0), 0), 0)
  const heads = damageRows.reduce((sum, d) => sum + (count(d.headshots) ? d.headshots : 0), 0)
  if (timeline.finalStats) {
    Object.assign(timeline.finalStats, scoreFor(own?.stats as Row | undefined, rounds.length, respawn))
    timeline.finalStats.adr = !respawn && damageComplete ? Math.round(damage / rounds.length * 10) / 10 : null
    timeline.finalStats.headshotPct = hitsComplete && hits > 0 ? Math.round(heads / hits * 1000) / 10 : null
  }
  const economyMode = ['COMPETITIVE', 'UNRATED', 'SWIFTPLAY', 'PREMIER', 'CUSTOM'].includes(timeline.gameMode ?? '')
  for (const summary of timeline.roundSummaries) {
    const rawRound = rounds.find((r, i) => (r.roundNum ?? r.roundNumber ?? i) === summary.roundNumber)
    const p = rows(rawRound?.playerStats).find(p => sameId(p.subject, timeline.puuid))
    summary.playerDamageDealt = validDamage(p) ? rows(p?.damage).reduce((sum, d) => sum + (d.damage as number), 0) : null
    const economy = p?.economy as Row | undefined
    for (const [field, source] of [['playerGold', 'remaining'], ['playerSpent', 'spent'], ['playerLoadoutValue', 'loadoutValue']] as const) {
      summary[field] = economyMode && nonnegative(economy?.[source]) ? economy[source] as number : null
    }
  }
  timeline.teamSnapshot = timeline.teamSnapshot.filter(p => {
    const rawPlayer = players.find(r => sameId(r.subject, p.puuid))
    const stats = rawPlayer?.stats as Row | undefined
    return stats && ['kills', 'deaths', 'assists'].every(k => count(stats[k]))
  }).map(p => {
    const rawPlayer = players.find(r => sameId(r.subject, p.puuid))!
    const stats = rawPlayer.stats as Row
    const name = text(rawPlayer.gameName)
    const ownPlayer = sameId(p.puuid, timeline.puuid)
    return { ...p, kills: stats.kills as number, deaths: stats.deaths as number, assists: stats.assists as number,
      ...scoreFor(stats, rounds.length, respawn), abilityCasts: reportedAbilityCasts(stats.abilityCasts),
      summonerName: name ?? (ownPlayer ? timeline.playerName : null), displayLabel: name ?? (ownPlayer ? timeline.playerName : null) ?? p.agent ?? 'Player',
      nameSource: name ? 'match_record' : ownPlayer ? 'current_account' : 'unavailable' }
  })
}

/** Strip judgments whose accuracy the match record cannot establish, for all coaching submissions. */
export function enforceValorantCoachingQuality(data: UploadMatchData, timeline: MatchData): CoachingDataQuality {
  const raw = timeline.matchDetails
  const players = rows(raw?.players)
  const own = players.find(p => sameId(p.subject, timeline.puuid))
  const stats = own?.stats as Row | undefined
  const issues: string[] = []
  if (!raw || !own || !stats) issues.push('authoritative_player_stats_missing')
  else if (!['kills', 'deaths', 'assists'].every(k => count(stats[k]) && data.finalStats?.[k as 'kills' | 'deaths' | 'assists'] === stats[k])) issues.push('scoreboard_mismatch')
  if (raw && Array.isArray(raw.kills)) {
    if (data.killEvents.length !== raw.kills.length) issues.push('event_count_mismatch')
    if (data.playerKills.length !== stats?.kills || data.playerDeaths.length !== stats?.deaths) issues.push('personal_event_count_mismatch')
    if (data.killEvents.some(k => !nonnegative(k.timeSinceGameStartMillis) || k.timeSinceGameStartMillis === 0)) issues.push('kill_event_time_missing')
    if (data.playerKills.some(k => !sameId(k.killerPuuid, timeline.puuid)) || data.playerDeaths.some(k => !sameId(k.victimPuuid, timeline.puuid))) issues.push('personal_event_identity_mismatch')
    const key = (killer: unknown, victim: unknown, round: unknown, time: unknown) => JSON.stringify([String(killer).toLowerCase(), String(victim).toLowerCase(), round, time])
    const sourceEvents = new Map<string, number>()
    for (const k of rows(raw.kills)) {
      const id = key(k.killer, k.victim, k.round ?? 0, riotGameTime(k))
      sourceEvents.set(id, (sourceEvents.get(id) ?? 0) + 1)
    }
    let inconsistentEvent = false
    for (const k of data.killEvents) {
      const id = key(k.killerPuuid, k.victimPuuid, k.round ?? 0, k.timeSinceGameStartMillis)
      const remaining = sourceEvents.get(id) ?? 0
      if (remaining < 1 || k.EventTime !== (k.timeSinceGameStartMillis ?? 0) / 1000) inconsistentEvent = true
      else sourceEvents.set(id, remaining - 1)
    }
    if (inconsistentEvent) issues.push('event_source_mismatch')
  } else issues.push('authoritative_events_missing')
  if (data.roundSummaries.length && ['kills', 'deaths', 'assists'].some(k => data.roundSummaries.reduce((n, r) => n + (r.playerStats?.[k as 'kills' | 'deaths' | 'assists'] ?? 0), 0) !== stats?.[k])) issues.push('round_totals_mismatch')

  // Keep event.spatial and spatialSummary: trade/untraded flags and death callouts are derived from
  // Riot kill timing and player positions (spatial/enrich.ts) and are core coaching evidence.
  for (const event of [...data.spikePlants, ...data.spikeDefuses, ...data.spikeDetonations]) {
    if (event.gameTimeMs == null) { event.EventTime = null; delete event.videoOffsetMs }
  }
  const playerNames: CoachingDataQuality['playerNames'] = players.map(p => {
    const isOwn = sameId(p.subject, timeline.puuid)
    const name = text(p.gameName)
    const tag = text(p.tagLine)
    return { puuid: String(p.subject ?? ''), name: name ?? (isOwn ? timeline.playerName : null),
      tag: tag ?? (isOwn ? timeline.playerTag : null),
      source: name && tag ? 'match_record' : isOwn ? 'current_account' : 'unavailable' }
  })
  for (const player of data.matchDetailsLite?.players ?? []) {
    const identity = playerNames.find(p => sameId(p.puuid, player.subject))
    player.gameName = identity?.name ?? null
    player.tagLine = identity?.tag ?? null
    player.nameSource = identity?.source ?? 'unavailable'
    const snapshot = data.teamSnapshot.find(p => sameId(p.puuid, player.subject))
    if (player.stats) {
      player.stats.score = snapshot?.score ?? null
      player.stats.totalCombatScore = snapshot?.totalCombatScore ?? null
      player.stats.scoreKind = snapshot?.scoreKind
      const rawPlayer = players.find(p => sameId(p.subject, player.subject))
      if (!snapshot) { player.stats = undefined; continue }
      if (!reportedAbilityCasts((rawPlayer?.stats as Row | undefined)?.abilityCasts)) delete player.stats.abilityCasts
    }
  }
  const respawn = isRespawnMode(data.gameMode)
  const economyMode = ['COMPETITIVE', 'UNRATED', 'SWIFTPLAY', 'PREMIER', 'CUSTOM'].includes(data.gameMode ?? '')
  const economyRounds = data.roundSummaries.filter(r => r.playerSpent != null && r.playerGold != null && r.playerLoadoutValue != null).length
  const statsRounds = data.roundSummaries.filter(r => r.playerStats != null).length
  const deathsWithTradeFlag = data.playerDeaths.filter(d => typeof d.spatial?.traded === 'boolean').length
  const benchmarks = [...(data.spatialSummary?.plantBenchmarks ?? []), ...(data.spatialSummary?.peekBenchmarks ?? [])]
  const capabilities: Record<string, CoachingCapability> = {
    identity: timeline.puuid && timeline.playerName && timeline.playerTag ? 'available' : 'unavailable',
    otherPlayerNames: playerNames.filter(p => !sameId(p.puuid, timeline.puuid)).every(p => p.source === 'match_record') ? 'available' : 'unavailable',
    scoreboard: stats ? 'available' : 'unavailable',
    competitiveAcs: data.gameMode !== 'COMPETITIVE' ? 'not_applicable' : data.finalStats?.score != null ? 'available' : 'unavailable',
    averageDamagePerRound: respawn ? 'not_applicable' : data.finalStats?.adr != null ? 'available' : 'unavailable',
    headshotPercent: data.finalStats?.headshotPct != null ? 'available' : 'unavailable',
    roundStats: respawn ? 'not_applicable' : statsRounds === 0 ? 'unavailable' : statsRounds === data.roundSummaries.length ? 'available' : 'partial',
    economy: !economyMode ? 'not_applicable' : economyRounds === 0 ? 'unavailable' : economyRounds === data.roundSummaries.length ? 'available' : 'partial',
    abilityCastTotals: data.coachingFacts?.matchAbilityCasts ? 'available' : 'unavailable',
    abilityUseTiming: 'unavailable',
    objectiveTimes: respawn || data.gameMode?.startsWith('SKIRMISH') ? 'not_applicable' : data.spikePlants.every(p => p.gameTimeMs != null) && data.spikeDefuses.every(p => p.gameTimeMs != null)
      && !data.roundSummaries.some(r => r.spikeDetonated && !data.spikeDetonations.some(d => d.round === r.roundNumber)) ? 'available' : 'partial',
    eventPositionSnapshots: data.roundReplay ? 'available' : 'unavailable',
    replayLifeState: data.roundReplay ? 'partial' : 'unavailable',
    tradeAndIsolationJudgments: respawn ? 'not_applicable' : data.playerDeaths.length === 0 || deathsWithTradeFlag === 0 ? 'unavailable'
      : deathsWithTradeFlag === data.playerDeaths.length ? 'available' : 'partial',
    populationBenchmarks: benchmarks.length ? 'available' : 'unavailable',
    continuousMovement: 'unavailable',
  }
  const quality: CoachingDataQuality = {
    policyVersion: 1, status: issues.length ? 'blocked' : 'verified_fields_only', issues, capabilities,
    localNameSource: playerNames.find(p => sameId(p.puuid, timeline.puuid))?.source ?? 'unavailable', playerNames,
    excludedFields: [],
    limitations: [
      'Null means unknown or not applicable; never convert it to zero.',
      'Compare performance within the same game mode; respawn total score is not competitive ACS.',
      'Player identity joins use PUUID; current-account names are not historical names. Missing names remain null.',
      'Positions are event snapshots, not continuous movement or line-of-sight evidence.',
      'Trade flags: traded = an ally killed your killer (or an enemy near your death spot) within 3s, from Riot kill data.',
      'Replay alive is known only for the current event actor/victim; null is unknown, never dead.',
      'Ability casts are match totals, not cast times, remaining charges or evidence of utility effectiveness.',
      'Missing objective times and round ends remain unknown. Headshot percent is a share of recorded hits, not shot accuracy.',
    ],
  }
  if (issues.length) {
    // No unchecked facts escape into an AI submission; callers can still use separate video input.
    data.finalStats = null; data.teamSnapshot = []; data.killEvents = []; data.playerKills = []; data.playerDeaths = []
    data.firstBloods = []; data.roundSummaries = []; data.spikePlants = []; data.spikeDefuses = []; data.spikeDetonations = []
    data.roundPlants = []; data.roundScores = []; data.finalScore = null
    data.matchDetailsLite = null; data.roundReplay = undefined; data.coachingFacts = undefined
    for (const key of Object.keys(capabilities)) if (capabilities[key] === 'available' || capabilities[key] === 'partial') capabilities[key] = 'unavailable'
  }
  return quality
}
