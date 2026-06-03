/**
 * post-game-api.ts
 * Fire-and-forget API calls for pre-game coaching briefs and post-game AI debriefs.
 * Extracted from index.ts to keep match-lifecycle orchestration focused.
 */

import { shell } from 'electron'
import log from 'electron-log'
import { reportError } from './error-reporter'
import type { MatchData } from './riot-types'

// ── Pre-game brief ────────────────────────────────────────────────────────────

/**
 * Open the player's personalised pre-game coaching brief in their browser.
 * Fire-and-forget — never blocks the match-start flow.
 */
export function requestPregameBrief(
  getToken: () => string | null,
  logActivity: (msg: string) => void,
  context?: { agent?: string | null; map?: string | null; mode?: string | null }
): void {
  if (!getToken()) {
    logActivity('Pre-game brief skipped — not logged in')
    return
  }

  const params = new URLSearchParams()
  if (context?.agent) params.set('agent', context.agent)
  if (context?.map) params.set('map', context.map)
  params.set('t', Date.now().toString())
  const url = `https://upforge.gg/valorant/pregame-brief?${params.toString()}`

  shell.openExternal(url)
  logActivity('Pre-game brief: opened in browser')
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
}

/**
 * Request a Claude-powered round-by-round debrief from the UpForge API.
 * Fire-and-forget — call without await and let it resolve on its own timeline.
 */
export async function requestPostGameDebrief(opts: PostGameDebriefOptions): Promise<void> {
  const { riotName, riotTag, agent, map, timeline, sendToWindow, getToken, apiUrl } = opts
  const token = getToken()
  if (!token) return

  const apiBase = apiUrl ?? process.env['VITE_API_URL'] ?? 'https://api.upforge.gg'
  const body = JSON.stringify({ riot_name: riotName, riot_tag: riotTag, agent, map, match_data: timeline })
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
            reportError({
              message: `[Debrief] API error ${res.statusCode}: ${errMsg}`,
              component: 'desktop:Debrief',
              extra: { statusCode: res.statusCode },
            })
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
