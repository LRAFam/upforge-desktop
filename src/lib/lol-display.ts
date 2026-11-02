/**
 * Plain-language labels for League rows on Home and Progress (v3).
 * Real values only: anything missing is left out, never shown as 0.
 */
import type { LolAnalysisItem, LolMatchSummary } from '../env.d.ts'
import { fmtLolDuration } from './lol-analyses'
import { lolQueueLabel } from './lol'

/** Which Riot ID League uses: the League link, or (like the API) the Valorant one as a fallback. */
export interface LolIdentity {
  label: string
  source: 'league' | 'valorant' | null
}

type IdentityUser = {
  riot_name?: string | null
  riot_tag?: string | null
  lol_riot_name?: string | null
  lol_riot_tag?: string | null
} | null | undefined

const tagOf = (t: string) => t.trim().replace(/^#/, '')

export function lolIdentity(user: IdentityUser): LolIdentity {
  const ln = user?.lol_riot_name?.trim()
  const lt = user?.lol_riot_tag?.trim()
  if (ln && lt) return { label: `${ln}#${tagOf(lt)}`, source: 'league' }
  const vn = user?.riot_name?.trim()
  const vt = user?.riot_tag?.trim()
  if (vn && vt) return { label: `${vn}#${tagOf(vt)}`, source: 'valorant' }
  return { label: '', source: null }
}

/** Under the Riot ID on Home/Progress: says when the Valorant ID stands in for League. */
export function lolIdentityNote(id: LolIdentity): string {
  return id.source === 'valorant' ? `${id.label} · your Valorant Riot ID` : id.label
}

/** Empty state when Riot returned no coachable League games for this Riot ID. */
export function lolNoMatchesText(id: LolIdentity): string {
  const base = `No Ranked Solo/Duo, Flex or Normal Draft games found for ${id.label || 'your Riot ID'} in your last 20 League games.`
  return id.source === 'valorant'
    ? `${base} League is using your Valorant Riot ID. If you play League on a different Riot ID, link it in Settings.`
    : `${base} ARAM and other modes aren't coached. Recordings on this computer still work.`
}

/** Status of a Riot stats coaching report, in words (never a raw API status). */
export function lolAnalysisStatus(r: Pick<LolAnalysisItem, 'status' | 'readiness_state'>): string {
  if (r.status === 'completed') return 'Ready'
  if (r.status === 'failed') return 'Failed'
  if (r.readiness_state === 'waiting_match_data') return 'Waiting for Riot match data'
  return 'Being written'
}

const ROLE: Record<string, string> = {
  TOP: 'Top', JUNGLE: 'Jungle', MIDDLE: 'Mid', MID: 'Mid', BOTTOM: 'Bot', ADC: 'Bot', UTILITY: 'Support', SUPPORT: 'Support',
}

export function lolRoleLabel(role: string | null | undefined): string | null {
  const key = (role ?? '').trim().toUpperCase()
  return ROLE[key] ?? null
}

type MatchRow = LolMatchSummary & { cs_per_min?: number | null; vision_score?: number | null }

const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

/** "Mid · 31:20 · 7.1 CS/min · Ranked Flex", leaving out what Riot didn't send. */
export function lolMatchMeta(m: MatchRow): string {
  return [
    lolRoleLabel(m.role),
    num(m.game_duration_seconds) && m.game_duration_seconds > 0 ? fmtLolDuration(Math.round(m.game_duration_seconds)) : null,
    num(m.cs_per_min) ? `${m.cs_per_min.toFixed(1)} CS/min` : null,
    num(m.vision_score) ? `${Math.round(m.vision_score)} vision` : null,
    num(m.queue_id) ? lolQueueLabel(m.queue_id) : null,
  ].filter(Boolean).join(' · ')
}
