/**
 * Optional wait after INGAME presence until Live Client signals gameplay (guns-up).
 * Falls through quickly when Live Client is unavailable.
 */
import https from 'https'
import log from 'electron-log'

export interface LiveGameplayWaitOpts {
  maxMs?: number
  pollMs?: number
  isCancelled?: () => boolean
}

type LiveEvent = { EventName?: string; EventTime?: number }

function riotGet<T>(path: string, timeoutMs = 1_500): Promise<T> {
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: '127.0.0.1',
        port: 2999,
        path,
        method: 'GET',
        rejectUnauthorized: false,
        timeout: timeoutMs,
      },
      (res) => {
        let body = ''
        res.on('data', (d) => { body += d })
        res.on('end', () => {
          try { resolve(JSON.parse(body) as T) }
          catch { reject(new Error('JSON parse error')) }
        })
      },
    )
    req.on('error', reject)
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')) })
    req.end()
  })
}

/** True when Live Client has passed loading into round gameplay. */
export function liveEventsIndicateGameplay(events: LiveEvent[] | null | undefined): boolean {
  if (!events?.length) return false
  for (const ev of events) {
    const name = ev.EventName ?? ''
    if (name === 'GameStart' || name === 'RoundStart' || name === 'RoundStarted') return true
    if (name === 'Kill' || name === 'ChampionKill') return true
    // EventTime > ~5s usually means we are past the load screen.
    if (typeof ev.EventTime === 'number' && ev.EventTime >= 5) return true
  }
  return false
}

/**
 * Wait until Live Client reports gameplay, or until maxMs / cancel.
 * Returns true if a gameplay cue was seen; false on timeout / unavailable / cancel.
 */
export async function waitForLiveGameplayCue(opts: LiveGameplayWaitOpts = {}): Promise<boolean> {
  const maxMs = opts.maxMs ?? 60_000
  const pollMs = opts.pollMs ?? 1_500
  const deadline = Date.now() + maxMs

  // Probe once — if Live Client is dead, don't burn the wait budget.
  try {
    await riotGet('/liveclientdata/activeplayer')
  } catch {
    log.info('[GameplayWait] Live Client unavailable — starting recording at INGAME')
    return false
  }

  while (Date.now() < deadline) {
    if (opts.isCancelled?.()) return false
    try {
      const data = await riotGet<{ Events?: LiveEvent[] }>('/liveclientdata/eventdata')
      if (liveEventsIndicateGameplay(data?.Events)) {
        log.info('[GameplayWait] Live Client gameplay cue — starting recording')
        return true
      }
    } catch {
      // transient — keep polling until deadline
    }
    await new Promise((r) => setTimeout(r, pollMs))
  }

  log.info('[GameplayWait] Timed out waiting for gameplay cue — starting recording anyway')
  return false
}
