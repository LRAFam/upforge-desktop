import type { AnalysisItem, Cs2AnalysisItem } from '../env.d.ts'

/** Map CS2 demo analyses into the shared dashboard AnalysisItem shape. */
export function mapCs2ToAnalysisItem(a: Cs2AnalysisItem): AnalysisItem {
  const rating = a.overall_rating
  return {
    id: a.id,
    job_id: a.job_id,
    status: a.status,
    map: a.map,
    agent: a.player_name,
    game_mode: 'CS2',
    won: null,
    kills: null,
    deaths: null,
    assists: null,
    kda: a.kd_ratio,
    combat_score: null,
    overall_score: rating != null ? (rating > 10 ? rating / 10 : rating) : null,
    rounds_won: null,
    rounds_lost: null,
    hs_pct: null,
    rank: null,
    created_at: a.completed_at ?? a.created_at,
  }
}
