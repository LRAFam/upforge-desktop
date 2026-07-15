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
      const proto = parsedUrl.protocol === 'https:' ? await import('https') : await import('http')
      const json = await new Promise<Record<string, unknown>>((resolve, reject) => {
        const req = proto.default.request({
          method:   'GET',
          hostname: parsedUrl.hostname,
          port:     parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
          path:     `${parsedUrl.pathname}${parsedUrl.search}`,
          headers: {
            Authorization: `Bearer ${token}`,
            Accept:        'application/json',
          },
        }, (res) => {
          let data = ''
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
}

/**
 * Request a Claude-powered round-by-round debrief from the UpForge API.
 * Fire-and-forget — call without await and let it resolve on its own timeline.
 */
export async function requestPostGameDebrief(opts: PostGameDebriefOptions): Promise<void> {
  const { riotName, riotTag, agent, map, timeline, sendToWindow, getToken, apiUrl, coachingExtras } = opts
  const token = getToken()
  if (!token) return

  const apiBase = apiUrl ?? process.env['VITE_API_URL'] ?? 'https://api.upforge.gg'
  const ctx = submissionContextFromTimeline(timeline ?? null, coachingExtras)
  const body = JSON.stringify({
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
  const proto = parsedUrl.protocol === 'https:' ? await import('https') : await import('http')

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
    )
    if (result !== 'retry' || attempt >= maxAttempts) return
    log.warn(`[Debrief] Retrying after transient API failure (attempt ${attempt + 1}/${maxAttempts})`)
    await new Promise((resolve) => setTimeout(resolve, 2000 * attempt))
  }
}

function postDebriefOnce(
  proto: typeof import('https') | typeof import('http'),
  parsedUrl: URL,
  body: string,
  token: string,
  riotName: string,
  riotTag: string,
  agent: string | null,
  map: string | null,
  sendToWindow: PostGameDebriefOptions['sendToWindow'],
  reportFailures: boolean,
): Promise<'ok' | 'retry'> {
  return new Promise((resolve) => {
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
      res.on('end', () => {
        try {
          const json = JSON.parse(data)
          if ((res.statusCode ?? 0) >= 400) {
            const errMsg = json.message ?? json.error ?? `HTTP ${res.statusCode}`
            log.warn('[Debrief] API error:', res.statusCode, errMsg)
            const status = res.statusCode ?? 0
            const retryable = status === 502 || status === 503 || status === 504
            // Weekly debrief cap (429) is tier gating — not a product error.
            if (status !== 429 && !retryable && reportFailures) {
              reportError({
                message: `[Debrief] API error ${status}: ${errMsg}`,
                component: 'desktop:Debrief',
                extra: { statusCode: status },
              })
            }
            sendToWindow('post-game:debrief', null)
            resolve(retryable ? 'retry' : 'ok')
          } else {
            log.info(`[Debrief] Generated for ${riotName}#${riotTag} cost=$${json.estimated_cost_usd ?? 0}`)
            sendToWindow('post-game:debrief', {
              debrief: json.debrief_text,
              agent,
              map,
              discordLinked: json.discord_linked ?? false,
            })
            resolve('ok')
          }
        } catch {
          log.warn('[Debrief] Non-JSON response:', data.slice(0, 200))
          sendToWindow('post-game:debrief', null)
          resolve('retry')
        }
      })
    })
    req.on('error', (err: Error) => {
      log.warn('[Debrief] Request error:', err.message)
      if (reportFailures) {
        reportError({ message: `[Debrief] Request error: ${err.message}`, stack: err.stack, component: 'desktop:Debrief' })
      }
      sendToWindow('post-game:debrief', null)
      resolve('retry')
    })
    req.setTimeout(120_000, () => {
      log.warn('[Debrief] Request timed out after 120s')
      sendToWindow('post-game:debrief', null)
      req.destroy(new Error('Debrief request timed out after 120s'))
      resolve('retry')
    })
    req.write(body)
    req.end()
  })
}
