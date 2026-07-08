import type { AnalysisItem, Cs2AnalysisItem } from '../env.d.ts'

function sourceLabel(source: Cs2AnalysisItem['source']): string {
  if (source === 'desktop_vod') return 'VOD'
  if (source === 'faceit_api') return 'FACEIT'
  return 'Demo'
}

/** Map unified CS2 analyses into the shared dashboard AnalysisItem shape. */
export function mapCs2ToAnalysisItem(a: Cs2AnalysisItem): AnalysisItem {
  const rating = a.overall_rating
  const source = a.source ?? 'demo_upload'
  return {
    id: a.id,
    job_id: a.job_id,
    status: a.status,
    map: a.map,
    agent: a.player_name,
    game_mode: source === 'desktop_vod' ? 'CS2 VOD' : `CS2 ${sourceLabel(source)}`,
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
    cs2_source: source,
  }
}
