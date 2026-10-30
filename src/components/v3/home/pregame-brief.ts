/** Board 12 · Between games. Shapes the read-only pre-game brief for Home. Real data only. */
export interface PregameContext {
  matchId: string
  agent: string | null
  map: string | null
  mode: string | null
  allyAgents: string[]
  enemyAgents: string[]
}

export interface PregameBriefResponse {
  success?: boolean
  total_analyses?: number
  agent_context?: { agent?: string; games?: number; display?: string | null; recent_note?: string | null } | null
  map_context?: { map?: string; games?: number; display?: string | null } | null
  focus_points?: Array<{ text?: string; count?: number | null }>
  comp_gaps?: Array<{ side?: string; text?: string }>
  momentum?: { direction?: 'hot' | 'cold' | 'steady' } | null
}

export interface PregameView {
  title: string
  lines: Array<{ label: string; text: string }>
}

const MOMENTUM: Record<string, string> = {
  hot: 'Your last few matches are trending up. Keep doing what worked.',
  cold: 'Your last few matches dipped. Play the first rounds safe and lean on your focus.',
}

export function pregameView(ctx: PregameContext | null, brief: PregameBriefResponse | null): PregameView | null {
  if (!ctx) return null
  const where = [ctx.agent, ctx.map].filter(Boolean).join(' on ')
  const lines: PregameView['lines'] = []
  const focus = (brief?.focus_points ?? []).find(f => f.text?.trim())
  if (focus?.text) lines.push({ label: 'Your focus', text: focus.text.trim() })
  const gap = (brief?.comp_gaps ?? []).find(g => g.text?.trim())
  if (gap?.text) lines.push({ label: 'This lobby', text: gap.text.trim() })
  const a = brief?.agent_context
  if (a?.games && a.games > 0 && a.agent) {
    lines.push({ label: a.agent, text: `${a.games} analysed ${a.games === 1 ? 'match' : 'matches'} on this agent${a.display ? ` · average ${a.display}` : ''}.` })
  }
  const m = brief?.momentum?.direction ? MOMENTUM[brief.momentum.direction] : null
  if (m) lines.push({ label: 'Form', text: m })
  return { title: where ? `Before this match · ${where}` : 'Before this match', lines: lines.slice(0, 3) }
}
