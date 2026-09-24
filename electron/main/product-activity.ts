import log from 'electron-log'
import type { AuthManager } from './auth-manager'

export const PRODUCT_ACTIVITY_EVENTS = ['app_foreground', 'recording_saved', 'clip_created', 'manual_clip_created', 'clip_share_link_created', 'clip_watched', 'replay_watched'] as const
export type ProductActivityEvent = typeof PRODUCT_ACTIVITY_EVENTS[number]
export const PRODUCT_ACTIVITY_GAMES = ['valorant', 'cs2', 'deadlock', 'lol', 'unknown'] as const
export type ProductActivityGame = typeof PRODUCT_ACTIVITY_GAMES[number]

export interface ActivityTransport {
  userId: () => number | null
  send: (event: ProductActivityEvent, game: ProductActivityGame) => Promise<void>
  now: () => number
}

/** Best-effort daily observations, never a dependency of recording or playback. */
export class ProductActivityTracker {
  private sent = new Map<string, number>()
  private pending = new Set<string>()
  constructor(private transport: ActivityTransport) {}

  async track(event: ProductActivityEvent, game: ProductActivityGame, ownerId?: number): Promise<boolean> {
    const userId = this.transport.userId()
    if (userId === null || (ownerId !== undefined && ownerId !== userId)) return false
    const now = this.transport.now()
    for (const [key, expiry] of this.sent) if (expiry <= now) this.sent.delete(key)
    const key = `${userId}|${new Date(now).toISOString().slice(0, 10)}|${event}|${game}`
    if (this.sent.has(key) || this.pending.has(key)) return false
    this.pending.add(key)
    try {
      await this.transport.send(event, game)
      // Re-observe after five minutes so a same-day subscription change is captured.
      this.sent.set(key, now + 300_000)
      return true
    } catch (error) {
      log.debug('[ProductActivity] Observation not delivered', error instanceof Error ? error.message : 'request failed')
      return false
    } finally {
      this.pending.delete(key)
    }
  }
}

let tracker: ProductActivityTracker | null = null
export function initProductActivity(auth: AuthManager, version: string): void {
  tracker = new ProductActivityTracker({
    userId: () => auth.getToken() ? auth.getUser()?.id ?? null : null,
    now: () => Date.now(),
    send: async (event, game) => {
      await auth.getApi().post('/api/product-activity', { event, game, app_version: version })
    },
  })
}

export function trackProductActivity(event: ProductActivityEvent, game: string | null, ownerId?: number): void {
  const knownGame = PRODUCT_ACTIVITY_GAMES.includes(game as ProductActivityGame) ? game as ProductActivityGame : 'unknown'
  // Unknown game is an explicit bucket, never attributed to the user's preferred game.
  void tracker?.track(event, knownGame, ownerId)
}
