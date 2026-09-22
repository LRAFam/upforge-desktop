/**
 * post-game-api.ts
 * Fire-and-forget API calls for pre-game coaching briefs and post-game AI debriefs.
 * Extracted from index.ts to keep match-lifecycle orchestration focused.
 */

import log from 'electron-log'
import { reportError } from './error-reporter'
import type { MatchData } from './riot-types'
import { prepareMatchDataForUpload, submissionContextFromTimeline } from './match-data-payload'
import type { CoachingSubmissionExtras } from './match-coaching-context'

function loadHttpModule(url: URL) {
  return url.protocol === 'https:' ? import('https') : import('http')
}

type HttpModule = Awaited<ReturnType<typeof loadHttpModule>>

// ── Pre-game brief ────────────────────────────────────────────────────────────

/**
 * Request the player's personalised pre-game coaching brief.
 * Sends to Discord DMs when linked; otherwise defers UI until after the match.
 * Fire-and-forget — never blocks the match-start flow.
 */
export function requestPregameBrief(
  getToken: () => string | null,
  logActivity: (msg: string) => void,
  context?: {
    matchId?: string
    agent?: string | null
    map?: string | null
    mode?: string | null
    allyAgents?: string[]
    enemyAgents?: string[]
    rank?: string | null
    skillFocus?: string | null
  },
  apiUrl?: string
): void {
  const token = getToken()
  if (!token) {
    logActivity('Pre-game brief skipped — not logged in')
    return
  }

  const apiBase = apiUrl ?? process.env['VITE_API_URL'] ?? 'https://api.upforge.gg'
  const params = new URLSearchParams()
  if (context?.matchId) params.set('match_id', context.matchId)
  if (context?.agent) params.set('agent', context.agent)
  if (context?.map) params.set('map', context.map)
  if (context?.mode) params.set('mode', context.mode)
  if (context?.allyAgents?.length) params.set('ally_agents', context.allyAgents.join(','))
  if (context?.enemyAgents?.length) params.set('enemy_agents', context.enemyAgents.join(','))
  if (context?.rank) params.set('rank', context.rank)
  if (context?.skillFocus) params.set('skill_focus', context.skillFocus)
  const qs = params.toString() ? `?${params.toString()}` : ''
  const parsedUrl = new URL(`${apiBase}/api/progress/pregame-brief${qs}`)

  void (async () => {
    try {
      const proto = await loadHttpModule(parsedUrl)
      const json = await new Promise<Record<string, unknown>>((resolve, reject) => {
        const req = proto.default.request({
          method:   'POST',
          hostname: parsedUrl.hostname,
          port:     parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
          path:     `${parsedUrl.pathname}${parsedUrl.search}`,
          headers: {
            Authorization: `Bearer ${token}`,
            Accept:        'application/json',
          },
        }, (res) => {
          let data = ''
          res.on('error', reject)
          res.on('data', (c) => { data += c })
          res.on('end', () => {
            try {
              const body = JSON.parse(data) as Record<string, unknown>
              if ((res.statusCode ?? 0) >= 400) {
                reject(new Error((body.message as string) ?? `HTTP ${res.statusCode}`))
              } else {
                resolve(body)
              }
            } catch {
              reject(new Error(`Non-JSON response: ${data.slice(0, 200)}`))
            }
          })
        })
        req.on('error', reject)
        req.setTimeout(15_000, () => req.destroy(new Error('Pregame brief request timed out')))
        req.end()
      })

      if (json.discord_linked) {
        if (json.discord_sent) {
          logActivity('Pre-game brief sent to Discord')
        } else {
          logActivity('Pre-game brief: Discord linked but DM not sent (not enough data)')
        }
        return
      }

      if (getPregameBriefFallback() === 'defer') {
        logActivity('Pre-game brief skipped — Discord not linked (browser deferred during game)')
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      log.warn('[PregameBrief] API request failed; browser fallback suppressed during game:', msg)
    }
  })()
}

export function getPregameBriefFallback(): 'defer' {
  return 'defer'
}

// ── Post-game debrief ─────────────────────────────────────────────────────────

export interface PostGameDebriefOptions {
  riotName: string
  riotTag: string
  agent: string | null
  map: string | null
  timeline: MatchData
  sendToWindow: (channel: string, payload?: unknown) => void
  getToken: () => string | null
  apiUrl?: string
  coachingExtras?: CoachingSubmissionExtras
  manual?: boolean
}

/**
 * Request a Claude-powered round-by-round debrief from the UpForge API.
 * Fire-and-forget — call without await and let it resolve on its own timeline.
 */
export async function requestPostGameDebrief(opts: PostGameDebriefOptions): Promise<void> {
  const { riotName, riotTag, agent, map, timeline, sendToWindow, getToken, apiUrl, coachingExtras } = opts
  const token = getToken()
  if (!token) {
    sendToWindow('post-game:debrief', null)
    return
  }

  const apiBase = apiUrl ?? process.env['VITE_API_URL'] ?? 'https://api.upforge.gg'
  const ctx = submissionContextFromTimeline(timeline ?? null, coachingExtras)
  const body = JSON.stringify({
    manual: opts.manual === true,
    riot_name: riotName,
    riot_tag: riotTag,
    agent: ctx.agent ?? agent,
    map: ctx.map ?? map,
    game_mode: ctx.game_mode,
    match_data: ctx.match_data ?? prepareMatchDataForUpload(timeline ?? null, coachingExtras),
    ally_agents: ctx.ally_agents,
    enemy_agents: ctx.enemy_agents,
    skill_profile: ctx.skill_profile,
    rank_snapshot: ctx.rank_snapshot,
  })
  const parsedUrl = new URL(`${apiBase}/api/desktop-submissions/debrief`)
  const proto = await loadHttpModule(parsedUrl)

  const maxAttempts = 2
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const result = await postDebriefOnce(
      proto,
      parsedUrl,
      body,
      token,
      riotName,
      riotTag,
      agent,
      map,
      sendToWindow,
      attempt >= maxAttempts,
      attempt,
    )
    if (result !== 'retry' || attempt >= maxAttempts) return
    log.warn(`[Debrief] Retrying after transient API failure (attempt ${attempt + 1}/${maxAttempts})`)
    await new Promise((resolve) => setTimeout(resolve, 2000 * attempt))
  }
}

function postDebriefOnce(
  proto: HttpModule,
  parsedUrl: URL,
  body: string,
  token: string,
  riotName: string,
  riotTag: string,
  agent: string | null,
  map: string | null,
  sendToWindow: PostGameDebriefOptions['sendToWindow'],
  reportFailures: boolean,
  attempt: number,
): Promise<'ok' | 'retry'> {
  return new Promise((resolve) => {
    // Request, response and timeout errors can overlap for the same socket.
    let settled = false
    const finish = (result: 'ok' | 'retry', payload?: unknown): void => {
      if (settled) return
      settled = true
      if (result === 'ok' || reportFailures) sendToWindow('post-game:debrief', payload ?? null)
      resolve(result)
    }
    const requestFailed = (err: NodeJS.ErrnoException): void => {
      if (settled) return
      log.warn('[Debrief] Request error:', err.message)
      if (reportFailures) {
        reportError({
          message: `[Debrief] Request error: ${err.message}`,
          stack: err.stack,
          component: 'desktop:Debrief',
          extra: { code: err.code, attempt, endpoint: parsedUrl.pathname },
        })
      }
      finish('retry')
    }
    const req = proto.default.request({
      method:   'POST',
      hostname: parsedUrl.hostname,
      port:     parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
      path:     parsedUrl.pathname,
      headers: {
        'Content-Type':   'application/json',
        'Content-Length': Buffer.byteLength(body),
        'Authorization':  `Bearer ${token}`,
        'Accept':         'application/json',
      },
    }, (res) => {
      let data = ''
      res.on('data', (c) => { data += c })
      res.on('error', requestFailed)
      res.on('end', () => {
        if (settled) return
        const status = res.statusCode ?? 0
        let json: Record<string, unknown> | null = null
        try {
          const parsed: unknown = JSON.parse(data)
          if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
            json = parsed as Record<string, unknown>
          }
        } catch {
          // HTTP status still controls retries for non-JSON error pages.
        }

        if (status >= 400) {
          const retryable = status === 502 || status === 503 || status === 504
          log.warn('[Debrief] API error:', status)
          // Weekly debrief cap (429) is tier gating — not a product error.
          if (status !== 429 && (!retryable || reportFailures)) {
            reportError({
              message: `[Debrief] API error ${status}`,
              component: 'desktop:Debrief',
              extra: { statusCode: status, attempt, endpoint: parsedUrl.pathname },
            })
          }
          finish(retryable ? 'retry' : 'ok')
        } else if (status >= 200 && status < 300 && json?.skipped === true) {
          finish('ok', { skipped: true, reason: json.reason })
        } else if (
          status >= 200 && status < 300 &&
          typeof json?.debrief_text === 'string' && json.debrief_text.trim() !== ''
        ) {
          log.info(`[Debrief] Generated for ${riotName}#${riotTag} cost=$${json.estimated_cost_usd ?? 0}`)
          finish('ok', {
            debrief: json.debrief_text,
            agent,
            map,
            discordLinked: json.discord_linked === true,
          })
        } else {
          log.warn('[Debrief] Invalid API response:', status)
          if (reportFailures) {
            reportError({
              message: '[Debrief] Invalid API response',
              component: 'desktop:Debrief',
              extra: { statusCode: status, attempt, endpoint: parsedUrl.pathname },
            })
          }
          finish('retry')
        }
      })
    })
    req.on('error', requestFailed)
    req.setTimeout(120_000, () => {
      if (settled) return
      const error = Object.assign(new Error('Debrief request timed out after 120s'), { code: 'ETIMEDOUT' })
      requestFailed(error)
      req.destroy(error)
    })
    req.write(body)
    req.end()
  })
}
