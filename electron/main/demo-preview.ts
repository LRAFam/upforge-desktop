import fs from 'fs'
import log from 'electron-log'
import { peekDemoHeader } from './demo-header-peek'
import { buildTimelineFromDemo } from './demo-timeline'
import {
  isDemoLikelyIncomplete,
  sanitizeDemoClientName,
  sanitizeDemoMapName,
} from './demo-text-sanitize'
import { cs2PlayerIdentityMismatch } from './match-data-quality'
import type { KillEvent, MatchData } from './riot-types'
import type { SourceGame } from './source-replay-finder'

export interface DemoPreviewKill {
  round: number
  label: string
}

export interface DemoPreviewSummary {
  ok: boolean
  error?: string
  identityWarning?: string
  configuredPlayerName?: string | null
  partialParse?: boolean
  /** True when file size / age heuristics suggest Steam is still writing the .dem */
  likelyIncomplete?: boolean
  totalKillEvents: number
  map: string | null
  playerName: string | null
  kills: number | null
  deaths: number | null
  assists: number
  rounds: number
  allyScore: number
  enemyScore: number
  won: boolean | null
  killHighlights: DemoPreviewKill[]
  matchKillSample: boolean
}

function emptySummary(): DemoPreviewSummary {
  return {
    ok: false,
    totalKillEvents: 0,
    map: null,
    playerName: null,
    kills: null,
    deaths: null,
    assists: 0,
    rounds: 0,
    allyScore: 0,
    enemyScore: 0,
    won: null,
    killHighlights: [],
    matchKillSample: false,
  }
}

function scoreFromTimeline(timeline: MatchData): { ally: number; enemy: number; won: boolean | null } {
  let ally = 0
  let enemy = 0
  for (const round of timeline.roundSummaries ?? []) {
    if (round.winningTeam === 'ALLY') ally++
    else if (round.winningTeam === 'ENEMY') enemy++
  }
  if (timeline.finalScore) {
    ally = timeline.finalScore.allyScore
    enemy = timeline.finalScore.enemyScore
  }
  let won: boolean | null = null
  if (ally !== enemy) won = ally > enemy
  return { ally, enemy, won }
}

function playerKillHighlights(kills: KillEvent[]): DemoPreviewKill[] {
  return kills.slice(0, 6).map((kill) => {
    const roundNum = (kill.round ?? 0) + 1
    const victim = kill.victimName === 'You' ? 'you' : kill.victimName
    const weapon = kill.weapon ? ` (${kill.weapon})` : ''
    return {
      round: kill.round ?? 0,
      label: `R${roundNum}: ${kill.killerName === 'You' ? `killed ${victim}` : `died to ${kill.killerName}`}${weapon}`,
    }
  })
}

function matchKillHighlights(kills: KillEvent[]): DemoPreviewKill[] {
  return kills.slice(0, 6).map((kill) => {
    const roundNum = (kill.round ?? 0) + 1
    const weapon = kill.weapon ? ` (${kill.weapon})` : ''
    return {
      round: kill.round ?? 0,
      label: `R${roundNum}: ${kill.killerName} → ${kill.victimName}${weapon}`,
    }
  })
}

function killHighlightsFromTimeline(timeline: MatchData): { highlights: DemoPreviewKill[]; matchSample: boolean } {
  if (timeline.playerKills?.length) {
    return { highlights: playerKillHighlights(timeline.playerKills), matchSample: false }
  }

  const yours = (timeline.killEvents ?? []).filter((k) => k.killerName === 'You' || k.victimName === 'You')
  if (yours.length) {
    return { highlights: playerKillHighlights(yours), matchSample: false }
  }

  const all = timeline.killEvents ?? []
  if (!all.length) return { highlights: [], matchSample: false }
  return { highlights: matchKillHighlights(all), matchSample: true }
}

function summaryFromTimeline(
  timeline: MatchData,
  opts: { localPlayerName?: string | null; partialParse?: boolean },
): DemoPreviewSummary {
  const stats = timeline.finalStats
  const score = scoreFromTimeline(timeline)
  const { highlights, matchSample } = killHighlightsFromTimeline(timeline)
  const totalKillEvents = timeline.killEvents?.length ?? 0
  const identityMismatch = cs2PlayerIdentityMismatch(timeline)

  const base: DemoPreviewSummary = {
    ok: true,
    map: timeline.map,
    playerName: timeline.playerName,
    kills: stats?.kills ?? null,
    deaths: stats?.deaths ?? null,
    assists: stats?.assists ?? 0,
    rounds: timeline.roundSummaries?.length ?? 0,
    allyScore: score.ally,
    enemyScore: score.enemy,
    won: score.won,
    killHighlights: highlights,
    totalKillEvents,
    matchKillSample: matchSample,
    partialParse: opts.partialParse,
    configuredPlayerName: opts.localPlayerName ?? null,
  }

  if (opts.partialParse) {
    return {
      ...base,
      error: 'Replay parsed with errors — stats may be incomplete',
    }
  }

  if (identityMismatch) {
    const lookedFor = opts.localPlayerName?.trim() || 'your Steam name'
    return {
      ...base,
      identityWarning:
        `Could not find "${lookedFor}" in this replay. Set your CS2 Steam name in Settings → Recording for your K/D and clips.`,
    }
  }

  return base
}

export async function buildDemoPreviewSummary(opts: {
  game: SourceGame
  demoPath: string
  localPlayerName?: string | null
  mapHint?: string | null
}): Promise<DemoPreviewSummary> {
  const empty = emptySummary()
  const normalized = opts.demoPath.trim()
  if (!normalized.toLowerCase().endsWith('.dem') || !fs.existsSync(normalized)) {
    return { ...empty, error: 'Replay file not found' }
  }

  try {
    const timeline = await buildTimelineFromDemo({
      game: opts.game,
      demoPath: normalized,
      map: opts.mapHint ?? null,
      matchStartTime: null,
      recordingStartTime: 0,
      localPlayerName: opts.localPlayerName ?? null,
      skipSpatial: true,
    })

    if (!timeline) {
      const peek = await peekDemoHeader(normalized, opts.game)
      const map = sanitizeDemoMapName(peek?.mapName, opts.mapHint)
      const incomplete = isDemoLikelyIncomplete(normalized, peek)
      if (map || peek || opts.mapHint) {
        return {
          ...empty,
          ok: true,
          partialParse: true,
          likelyIncomplete: incomplete,
          map,
          playerName: sanitizeDemoClientName(peek?.clientName),
          error: incomplete
            ? 'Steam may still be downloading this replay — open CS2 → Watch → Your Matches, then rescan'
            : 'Could not fully parse this replay — try Rescan or pick another file',
        }
      }
      return {
        ...empty,
        error: 'Could not parse this replay — try another file or wait for Steam to finish downloading',
      }
    }

    const partialParse = Boolean(
      (timeline.matchDetails as { partialParse?: boolean } | undefined)?.partialParse,
    )
    const summary = summaryFromTimeline(timeline, {
      localPlayerName: opts.localPlayerName,
      partialParse,
    })
    if (partialParse) {
      summary.likelyIncomplete = isDemoLikelyIncomplete(normalized)
    }

    log.info(
      `[DemoPreview] ${opts.game} ${normalized} map=${summary.map} ` +
      `kills=${summary.kills ?? '—'}/${summary.deaths ?? '—'} events=${summary.totalKillEvents}`,
    )

    return summary
  } catch (err) {
    log.warn('[DemoPreview] Failed:', (err as Error).message)
    return { ...empty, error: 'Could not read this replay' }
  }
}
