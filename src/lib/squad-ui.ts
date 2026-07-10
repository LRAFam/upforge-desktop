import type { PrimaryGame } from './games'
import { isPrimaryGame, normalizePrimaryGame } from './games'

export const SQUAD_MEMBER_COLORS = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4', '#6366f1', '#ec4899', '#a855f7']

export function squadMemberColor(idx: number): string {
  return SQUAD_MEMBER_COLORS[idx % SQUAD_MEMBER_COLORS.length]
}

export function squadMemberInitials(name: string): string {
  return name?.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2) ?? '?'
}

export function squadPlanBadgeLabel(plan?: string): string {
  switch (plan) {
    case 'squad_6': return 'SQUAD 6'
    case 'squad_4': return 'SQUAD 4'
    case 'pro': return 'PRO'
    default: return 'FREE'
  }
}

export function squadPlanBadgeClass(plan?: string): string {
  switch (plan) {
    case 'squad_6':
    case 'squad_4':
      return 'bg-teal-500/15 text-teal-400 border border-teal-500/20'
    case 'pro':
      return 'bg-yellow-500/15 text-yellow-400 border border-yellow-500/20'
    default:
      return 'bg-white/[0.06] text-gray-400 border border-white/[0.08]'
  }
}

export function squadMaxMembers(plan?: string, maxMembers?: number): number {
  if (maxMembers) return maxMembers
  if (plan === 'squad_6') return 6
  if (plan === 'squad_4') return 4
  return 4
}

export function squadGamePillLabel(game: PrimaryGame): string {
  if (game === 'cs2') return 'CS2'
  if (game === 'deadlock') return 'DL'
  return 'VAL'
}

export function normalizePresenceGame(game: string | null | undefined): PrimaryGame | null {
  if (!game) return null
  const g = game.toLowerCase()
  if (g.includes('cs2') || g.includes('counter')) return 'cs2'
  if (g.includes('deadlock')) return 'deadlock'
  if (g.includes('valorant') || g === 'val') return 'valorant'
  if (isPrimaryGame(g)) return g
  return null
}

export function inferActivityGame(item: { agent?: string | null; map?: string | null; game?: string | null }): PrimaryGame {
  const fromField = normalizePresenceGame(item.game ?? null)
  if (fromField) return fromField
  if (item.agent) return 'valorant'
  const map = (item.map ?? '').toLowerCase()
  if (/^(de_|cs_|fy_|gd_)/.test(map) || map.includes('mirage') || map.includes('dust')) return 'cs2'
  if (map.includes('deadlock') || map.includes('district')) return 'deadlock'
  return 'valorant'
}

export function squadTimeAgo(dateStr: string): string {
  const ms = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(ms / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

export type SquadMemberStatus = 'recording' | 'online' | 'offline'

export function squadMemberStatus(presence: { online?: boolean; is_recording?: boolean } | undefined): SquadMemberStatus {
  if (presence?.is_recording) return 'recording'
  if (presence?.online) return 'online'
  return 'offline'
}

export function squadStatusLabel(status: SquadMemberStatus): string {
  if (status === 'recording') return 'Recording'
  if (status === 'online') return 'Online'
  return 'Offline'
}

export function squadActivityUrl(item: { id?: number; share_token?: string | null; agent?: string | null; map?: string | null; game?: string | null }): string | null {
  if (item.share_token) return `https://upforge.gg/share/${item.share_token}`
  if (!item.id) return null
  const game = inferActivityGame(item)
  return `https://upforge.gg/${game}/results/${item.id}`
}

export function squadWeekActivityCount(items: Array<{ created_at?: string | null }>): number {
  const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000
  return items.filter(i => i.created_at && new Date(i.created_at).getTime() >= cutoff).length
}

export function squadWeekRecord(items: Array<{ created_at?: string | null; result?: string | null }>): { wins: number; losses: number } {
  const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000
  let wins = 0
  let losses = 0
  for (const item of items) {
    if (!item.created_at || new Date(item.created_at).getTime() < cutoff) continue
    if (item.result === 'win') wins++
    else if (item.result === 'loss') losses++
  }
  return { wins, losses }
}

export interface SquadCompareRow {
  userId: number
  name: string
  winRate: number | null
  kdRatio: number | null
  analysesCount: number
}

export function coerceNullableNumber(value: unknown): number | null {
  if (value == null || value === '') return null
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? n : null
}

export function formatDecimalStat(value: unknown, decimals = 2): string {
  const n = coerceNullableNumber(value)
  return n == null ? '—' : n.toFixed(decimals)
}

export function buildSquadCompareRows(
  stats: Array<{ user_id: number; name: string; win_rate?: number | null; kd_ratio?: number | null }>,
  leaderboard: Array<{ user_id: number; name: string; analyses_count?: number }>,
): SquadCompareRow[] {
  const lbMap = Object.fromEntries(leaderboard.map(r => [r.user_id, r.analyses_count ?? 0]))
  const byId = new Map<number, SquadCompareRow>()

  for (const s of stats) {
    byId.set(s.user_id, {
      userId: s.user_id,
      name: s.name,
      winRate: coerceNullableNumber(s.win_rate),
      kdRatio: coerceNullableNumber(s.kd_ratio),
      analysesCount: lbMap[s.user_id] ?? 0,
    })
  }
  for (const lb of leaderboard) {
    if (!byId.has(lb.user_id)) {
      byId.set(lb.user_id, {
        userId: lb.user_id,
        name: lb.name,
        winRate: null,
        kdRatio: null,
        analysesCount: lb.analyses_count ?? 0,
      })
    }
  }

  return [...byId.values()].sort((a, b) => {
    const scoreA = (a.winRate ?? 0) + a.analysesCount * 5
    const scoreB = (b.winRate ?? 0) + b.analysesCount * 5
    return scoreB - scoreA
  })
}

export function squadGameMixCounts(
  presence: Record<number, { game?: string | null; online?: boolean; is_recording?: boolean }>,
): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const p of Object.values(presence)) {
    if (!p.online && !p.is_recording) continue
    const g = normalizePresenceGame(p.game ?? null)
    if (!g) continue
    counts[g] = (counts[g] ?? 0) + 1
  }
  return counts
}
