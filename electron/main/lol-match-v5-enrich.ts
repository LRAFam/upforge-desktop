/**
 * LoL Match-V5 enrich via authenticated API (server holds Riot keys).
 */
import type { AxiosInstance } from 'axios'
import type { AuthUser } from './auth-manager'
import { lolLinkedPuuidFromAuth } from './lol-lcu-api'
import { MATCH_DETAILS_ENRICH_MAX_MS } from './match-data-quality'
import type { FinalPlayerStats, MatchData } from './riot-types'

export type LolEnrichStatus = 'fetched' | 'fetch_failed' | 'no_match_id' | 'no_auth'

export interface LolEnrichApiResponse {
  success: boolean
  lolEnrichStatus: LolEnrichStatus
  patch: LolEnrichPatch
}

export interface LolEnrichPatch {
  matchId?: string | null
  lolEnrichStatus?: LolEnrichStatus
  agent?: string | null
  champion?: string | null
  role?: string | null
  teamPosition?: string | null
  lane?: string | null
  win?: boolean | null
  matchResult?: 'win' | 'loss' | null
  cs?: number | null
  cs_per_min?: number | null
  vision_score?: number | null
  queueId?: string | null
  finalStats?: Partial<FinalPlayerStats> & {
    cs?: number | null
    cs_per_min?: number | null
    visionScore?: number | null
    vision_score?: number | null
  }
}

export interface LolEnrichForCoachingOptions {
  maxWaitMs?: number
  onStatus?: (message: string) => void
  api?: AxiosInstance | null
  authUser?: Pick<AuthUser, 'lol_puuid' | 'lol_platform'> & { riot_puuid?: string | null } | null
}

function parseQueueId(timeline: MatchData): number | undefined {
  const raw = timeline.queueId
  if (raw == null || raw === '') return undefined
  const parsed = Number.parseInt(String(raw), 10)
  return Number.isFinite(parsed) ? parsed : undefined
}

function recordingEndMs(timeline: MatchData): number | undefined {
  const end = timeline.endTime ?? Date.now()
  return Number.isFinite(end) ? end : undefined
}

export function applyLolEnrichPatch(timeline: MatchData, patch: LolEnrichPatch, status: LolEnrichStatus): void {
  timeline.lolEnrichStatus = status

  if (patch.matchId) timeline.matchId = patch.matchId
  if (patch.agent) timeline.agent = patch.agent
  if (patch.champion) timeline.champion = patch.champion
  if (patch.role) timeline.role = patch.role
  if (patch.teamPosition) timeline.teamPosition = patch.teamPosition
  if (patch.lane) timeline.lane = patch.lane
  if (patch.win != null) timeline.win = patch.win
  if (patch.matchResult) timeline.matchResult = patch.matchResult
  if (patch.cs != null) timeline.cs = patch.cs
  if (patch.cs_per_min != null) timeline.cs_per_min = patch.cs_per_min
  if (patch.vision_score != null) timeline.vision_score = patch.vision_score
  if (patch.queueId) timeline.queueId = patch.queueId

  if (patch.finalStats) {
    timeline.finalStats = {
      ...(timeline.finalStats ?? {
        kills: 0,
        deaths: 0,
        assists: 0,
        score: 0,
        summonerName: null,
        agent: null,
        team: null,
        level: 0,
      }),
      ...patch.finalStats,
    }
    if (patch.finalStats.creepScore != null) {
      timeline.finalStats.creepScore = patch.finalStats.creepScore
    }
    if (patch.finalStats.cs != null) {
      timeline.cs = patch.finalStats.cs
    }
    if (patch.finalStats.cs_per_min != null) {
      timeline.cs_per_min = patch.finalStats.cs_per_min
    }
    const vision = patch.finalStats.visionScore ?? patch.finalStats.vision_score
    if (vision != null) timeline.vision_score = vision
    if (patch.finalStats.agent) timeline.agent = patch.finalStats.agent
  }
}

async function fetchLolEnrichOnce(
  timeline: MatchData,
  api: AxiosInstance,
): Promise<LolEnrichApiResponse> {
  const res = await api.post<LolEnrichApiResponse>('/api/desktop/lol/match-enrich', {
    match_id: timeline.matchId ?? undefined,
    recording_end_ms: recordingEndMs(timeline),
    queue_id: parseQueueId(timeline),
  })

  return res.data
}

/**
 * Poll Match-V5 enrich until fetched, terminal failure, or max wait.
 */
export async function enrichLolTimelineForCoaching(
  timeline: MatchData,
  options?: LolEnrichForCoachingOptions,
): Promise<boolean> {
  if (timeline.game !== 'lol') return false

  const api = options?.api ?? null
  if (!api) {
    applyLolEnrichPatch(timeline, {}, 'no_auth')
    options?.onStatus?.('Cannot fetch LoL match stats. Sign in to UpForge and retry.')
    return false
  }

  const linkedPuuid = lolLinkedPuuidFromAuth(options?.authUser ?? null)
  if (linkedPuuid && !timeline.puuid) timeline.puuid = linkedPuuid

  const maxWaitMs = options?.maxWaitMs ?? MATCH_DETAILS_ENRICH_MAX_MS
  const delays = maxWaitMs >= 180_000
    ? [0, 15_000, 30_000, 45_000, 60_000, 90_000, 120_000, 150_000]
    : [0, 15_000, 30_000, 45_000, 60_000, 90_000]
  const started = Date.now()

  for (const delay of delays) {
    const elapsed = Date.now() - started
    if (elapsed >= maxWaitMs) break
    if (delay > 0) {
      const sleepMs = Math.min(delay, maxWaitMs - elapsed)
      if (sleepMs <= 0) break
      options?.onStatus?.(`Waiting for LoL match stats (${Math.round(sleepMs / 1000)}s)…`)
      await new Promise((r) => setTimeout(r, sleepMs))
    }

    try {
      const result = await fetchLolEnrichOnce(timeline, api)
      const status = result.lolEnrichStatus ?? 'fetch_failed'
      applyLolEnrichPatch(timeline, result.patch ?? {}, status)

      if (status === 'fetched') {
        options?.onStatus?.('LoL match stats loaded from Riot Match-V5.')
        return true
      }
      if (status === 'no_auth' || status === 'no_match_id') {
        if (status === 'no_match_id') {
          options?.onStatus?.('Could not link this recording to a League match yet.')
        }
        break
      }
      options?.onStatus?.('LoL match stats not published yet. Retrying…')
    } catch {
      applyLolEnrichPatch(timeline, {}, 'fetch_failed')
      options?.onStatus?.('LoL match stats request failed. Retrying…')
    }
  }

  if (timeline.lolEnrichStatus !== 'fetched') {
    options?.onStatus?.('LoL match stats still unavailable. Tap Retry sync when Riot has published the match.')
  }

  return timeline.lolEnrichStatus === 'fetched'
}
