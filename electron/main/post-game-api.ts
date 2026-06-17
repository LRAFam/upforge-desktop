/**
 * post-game-api.ts
 * Fire-and-forget API calls for pre-game coaching briefs and post-game AI debriefs.
 * Extracted from index.ts to keep match-lifecycle orchestration focused.
 */

import { shell } from 'electron'
import log from 'electron-log'
import { reportError } from './error-reporter'
import type { MatchData } from './riot-types'
import { prepareMatchDataForUpload, submissionContextFromTimeline } from './match-data-payload'
import type { CoachingSubmissionExtras } from './match-coaching-context'

// ── Pre-game brief ────────────────────────────────────────────────────────────

/**
 * Request the player's personalised pre-game coaching brief.
 * Sends to Discord DMs when linked; otherwise opens the web brief page.
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

  const openBrowserBrief = (): void => {
    const webParams = new URLSearchParams()
    if (context?.agent) webParams.set('agent', context.agent)
    if (context?.map) webParams.set('map', context.map)
    if (context?.mode) webParams.set('mode', context.mode)
    if (context?.allyAgents?.length) webParams.set('ally_agents', context.allyAgents.join(','))
    if (context?.enemyAgents?.length) webParams.set('enemy_agents', context.enemyAgents.join(','))
    if (context?.rank) webParams.set('rank', context.rank)
    if (context?.skillFocus) webParams.set('skill_focus', context.skillFocus)
    webParams.set('t', Date.now().toString())
    shell.openExternal(`https://upforge.gg/valorant/pregame-brief?${webParams.toString()}`)
    logActivity('Pre-game brief: opened in browser')
  }

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

      openBrowserBrief()
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      log.warn('[PregameBrief] API request failed, falling back to browser:', msg)
      openBrowserBrief()
    }
  })()
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
            // Weekly debrief cap (429) is tier gating — not a product error.
            if (res.statusCode !== 429) {
              reportError({
                message: `[Debrief] API error ${res.statusCode}: ${errMsg}`,
                component: 'desktop:Debrief',
                extra: { statusCode: res.statusCode },
              })
            }
            sendToWindow('post-game:debrief', null)
          } else {
            log.info(`[Debrief] Generated for ${riotName}#${riotTag} cost=$${json.estimated_cost_usd ?? 0}`)
            sendToWindow('post-game:debrief', {
              debrief: json.debrief_text,
              agent,
              map,
              discordLinked: json.discord_linked ?? false,
            })
          }
        } catch {
          log.warn('[Debrief] Non-JSON response:', data.slice(0, 200))
          sendToWindow('post-game:debrief', null)
        }
        resolve()
      })
    })
    req.on('error', (err: Error) => {
      log.warn('[Debrief] Request error:', err.message)
      reportError({ message: `[Debrief] Request error: ${err.message}`, stack: err.stack, component: 'desktop:Debrief' })
      sendToWindow('post-game:debrief', null)
      resolve()
    })
    req.setTimeout(120_000, () => {
      req.destroy(new Error('Debrief request timed out after 120s'))
    })
    req.write(body)
    req.end()
  })
}
