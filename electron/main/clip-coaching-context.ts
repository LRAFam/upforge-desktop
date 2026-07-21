/**
 * Build rich coaching payloads for clip upload / analyse.
 */
import type { ClipRecord } from './clip-store'
import type { MatchData } from './riot-types'
import {
  buildCoachingSubmissionExtras,
  buildTeamComp,
  roundSummaryForClip,
  type CoachingSubmissionExtras,
} from './match-coaching-context'
import { prepareMatchDataForUpload } from './match-data-payload'
import type { AppSettings } from './settings-manager'

export function buildClipUploadPayload(
  clip: ClipRecord,
  timeline: MatchData | null,
  coachingExtras?: CoachingSubmissionExtras,
): Record<string, unknown> {
  const { allyAgents, enemyAgents } = timeline ? buildTeamComp(timeline) : { allyAgents: [], enemyAgents: [] }
  const roundContext = roundSummaryForClip(timeline, clip.round)

  const payload: Record<string, unknown> = {
    trigger: clip.trigger,
    map: clip.map ?? timeline?.map ?? undefined,
    agent: clip.agent ?? timeline?.agent ?? undefined,
    game_mode: timeline?.gameMode ?? undefined,
    duration_seconds: clip.durationSeconds,
    round: clip.round ?? undefined,
    analysis_id: clip.analysisJobId ?? undefined,
    job_id: clip.analysisJobId ?? undefined,
    match_id: clip.matchId ?? timeline?.matchId ?? undefined,
    kill_count: clip.killCount ?? undefined,
    weapon: clip.weapon ?? undefined,
    ability_slot: clip.abilitySlot ?? undefined,
    moment_offset_ms: clip.momentOffsetMs ?? undefined,
    clip_start_ms: clip.clipStartMs ?? undefined,
    ally_agents: allyAgents.length ? allyAgents : undefined,
    enemy_agents: enemyAgents.length ? enemyAgents : undefined,
    round_context: roundContext ?? undefined,
  }

  if (timeline) {
    const matchData = prepareMatchDataForUpload(timeline, coachingExtras)
    if (matchData) {
      payload.match_data = clip.clipEvents?.length
        ? { ...matchData, clip_events: clip.clipEvents }
        : matchData
    }
  } else if (clip.clipEvents?.length) {
    payload.match_data = { clip_events: clip.clipEvents }
  }

  if (coachingExtras?.skillProfile) payload.skill_profile = coachingExtras.skillProfile
  if (coachingExtras?.rankSnapshot) payload.rank_snapshot = coachingExtras.rankSnapshot

  return payload
}

export function resolveClipTimeline(
  clip: { analysisJobId: string | null; matchId?: string | null },
  recordings: Array<{ jobId?: string; timeline: MatchData | null }>,
): MatchData | null {
  // Prefer the analysis-linked recording, but fall back to matching by Riot
  // matchId so live (non-analysis) clips still carry their match timeline.
  if (clip.analysisJobId) {
    const byJob = recordings.find((r) => r.jobId === clip.analysisJobId)?.timeline
    if (byJob) return byJob
  }
  if (clip.matchId) {
    const byMatch = recordings.find((r) => r.timeline?.matchId === clip.matchId)?.timeline
    if (byMatch) return byMatch
  }
  return null
}

export function coachingExtrasFromSettings(
  timeline: MatchData | null,
  settings: Pick<AppSettings, 'skillProfile'>,
  rrHistory?: Array<{ rank: string | null; rr: number; elo: number }>,
  gameClientVersion?: string | null,
): CoachingSubmissionExtras | undefined {
  if (!timeline) return undefined
  return buildCoachingSubmissionExtras(timeline, settings, rrHistory, gameClientVersion)
}
