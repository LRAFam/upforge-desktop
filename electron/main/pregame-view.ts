/**
 * Board 12 · Between games. Read-only pre-game brief for the desktop Home.
 * GET /api/progress/pregame-brief never sends a Discord DM and uses no AI (the API builds it from stored data).
 */
export interface PregameContextPayload {
  matchId: string
  agent: string | null
  map: string | null
  mode: string | null
  allyAgents: string[]
  enemyAgents: string[]
}

const NAME = /^[\p{L}\p{N} '._/-]{1,50}$/u
const MATCH = /^[A-Za-z0-9-]{1,128}$/

function name(v: unknown): string | null {
  return typeof v === 'string' && NAME.test(v.trim()) ? v.trim() : null
}

/** Validate a renderer-supplied context before it goes into query params. */
export function sanitizePregameContext(raw: unknown): PregameContextPayload | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const matchId = typeof r.matchId === 'string' && MATCH.test(r.matchId) ? r.matchId : null
  if (!matchId) return null
  const list = (v: unknown) => (Array.isArray(v) ? v.map(name).filter((x): x is string => !!x).slice(0, 5) : [])
  return {
    matchId,
    agent: name(r.agent),
    map: name(r.map),
    mode: typeof r.mode === 'string' && /^[A-Z_]{1,30}$/.test(r.mode) ? r.mode : null,
    allyAgents: list(r.allyAgents),
    enemyAgents: list(r.enemyAgents),
  }
}

export function pregameQuery(ctx: PregameContextPayload): Record<string, string> {
  const q: Record<string, string> = { match_id: ctx.matchId }
  if (ctx.agent) q.agent = ctx.agent
  if (ctx.map) q.map = ctx.map
  if (ctx.mode) q.mode = ctx.mode
  if (ctx.allyAgents.length) q.ally_agents = ctx.allyAgents.join(',')
  if (ctx.enemyAgents.length) q.enemy_agents = ctx.enemyAgents.join(',')
  return q
}

/** Only push to the window when the lobby actually changed (agent lock-ins, map known). */
export function pregameKey(ctx: PregameContextPayload | null): string {
  return ctx ? [ctx.matchId, ctx.agent ?? '', ctx.map ?? '', ctx.allyAgents.length, ctx.enemyAgents.length].join('|') : ''
}
