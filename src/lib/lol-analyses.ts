import type { AnalysisItem, LolAnalysisItem } from '../env.d.ts'

/** Map LoL analyses into the shared dashboard AnalysisItem shape. */
export function mapLolToAnalysisItem(a: LolAnalysisItem): AnalysisItem {
  return {
    id: a.id,
    job_id: a.job_id ?? String(a.id),
    status: a.status,
    map: "Summoner's Rift",
    agent: a.champion,
    game_mode: a.queue_id === 420 ? 'Ranked Solo/Duo' : 'LoL',
    won: null,
    kills: null,
    deaths: null,
    assists: null,
    kda: null,
    combat_score: null,
    overall_score: null,
    rounds_won: null,
    rounds_lost: null,
    hs_pct: null,
    rank: null,
    created_at: a.completed_at ?? a.created_at ?? new Date().toISOString(),
  }
}

export function fmtLolDuration(seconds: number): string {
  if (!seconds) return '0:00'
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

export function fmtLolKda(kills: number, deaths: number, assists: number): string {
  return `${kills}/${deaths}/${assists}`
}
