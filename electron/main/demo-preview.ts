import fs from 'fs'
import log from 'electron-log'
import { buildTimelineFromDemo } from './demo-timeline'
import type { MatchData } from './riot-types'
import type { SourceGame } from './source-replay-finder'

export interface DemoPreviewKill {
  round: number
  label: string
}

export interface DemoPreviewSummary {
  ok: boolean
  error?: string
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

function killHighlightsFromTimeline(timeline: MatchData): DemoPreviewKill[] {
  const kills = timeline.playerKills?.length
    ? timeline.playerKills
    : (timeline.killEvents ?? []).filter((k) => k.killerName === 'You')

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

export async function buildDemoPreviewSummary(opts: {
  game: SourceGame
  demoPath: string
  localPlayerName?: string | null
  mapHint?: string | null
}): Promise<DemoPreviewSummary> {
  const empty: DemoPreviewSummary = {
    ok: false,
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
  }

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
      return { ...empty, error: 'Could not parse this replay' }
    }

    const stats = timeline.finalStats
    const score = scoreFromTimeline(timeline)
    const highlights = killHighlightsFromTimeline(timeline)

    if (!stats && !highlights.length) {
      return {
        ...empty,
        ok: true,
        map: timeline.map,
        playerName: timeline.playerName,
        error: 'Could not find your player — set your CS2 Steam name in Settings → Recording',
      }
    }

    log.info(`[DemoPreview] ${opts.game} ${normalized} map=${timeline.map} ${stats?.kills ?? 0}/${stats?.deaths ?? 0}`)

    return {
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
    }
  } catch (err) {
    log.warn('[DemoPreview] Failed:', (err as Error).message)
    return { ...empty, error: 'Could not read this replay' }
  }
}
