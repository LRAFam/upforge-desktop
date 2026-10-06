/** v1 contract shared with the web client. Keep both copies and their contract tests aligned. */
export const USAGE_FEATURES = [
  'dashboard',
  'report',
  'match_stats',
  'training',
  'clips',
  'recordings',
  'coaching',
  'settings',
  'other_product',
] as const
export type UsageFeature = (typeof USAGE_FEATURES)[number]
export interface UsageEvent {
  event_id: string
  session_id: string
  event: 'session_started' | 'page_view' | 'feature_used' | 'engagement'
  feature: UsageFeature
  active_ms: number
}
interface Transport {
  now: () => number
  uuid: () => string
  send: (userId: number, events: UsageEvent[]) => Promise<void>
  failed: () => void
}

/** Sampled foreground time, not attention. Gaps >10s (sleep/throttling) count as missing. */
export class UsageTracker {
  private userId: number | null = null
  private session: string | null = null
  private feature: UsageFeature | null = null
  private active = false
  private lastSample: number | null = null
  private lastActive: number | null = null
  private milliseconds = 0
  private pending: UsageEvent[] = []
  private sending = false
  private lastFlush = 0
  private epoch = 0

  private transport: Transport

  constructor(transport: Transport) {
    this.transport = transport
  }

  sample(
    userId: number | null,
    feature: UsageFeature | null,
    active: boolean,
    visit = false
  ): void {
    const now = this.transport.now()
    if (this.userId !== userId) {
      // Never send buffered activity using a different account's authentication.
      this.epoch++
      this.pending = []
      this.session = null
      this.milliseconds = 0
      this.lastSample = null
      this.lastActive = null
      this.active = false
      this.feature = null
      this.userId = userId
    }
    const elapsed = this.lastSample === null ? 0 : now - this.lastSample
    if (userId !== null && this.active && active && elapsed > 0 && elapsed <= 10_000) {
      this.milliseconds += elapsed
    }
    const changed = this.feature !== feature
    if (changed || !active || visit) this.captureTime()
    this.feature = feature
    if (userId !== null && feature !== null && active) {
      if (
        this.session === null ||
        (this.lastActive !== null && now - this.lastActive >= 1_800_000)
      ) {
        this.session = this.transport.uuid()
        this.emit('session_started')
        visit = true
      }
      if (changed || visit || !this.active) this.emit('page_view')
      this.lastActive = now
    }
    this.active = active && feature !== null && userId !== null
    this.lastSample = now
    if (now - this.lastFlush >= 30_000 || !this.active || changed || visit) {
      this.captureTime()
      this.lastFlush = now
      this.flush()
    }
  }

  action(feature: UsageFeature): void {
    if (!this.active || !this.session || this.userId === null) return
    this.emit('feature_used', feature)
    this.flush()
  }

  private emit(event: UsageEvent['event'], feature = this.feature, activeMs = 0): void {
    if (!this.session || feature === null) return
    // Bounded memory while offline. Discarded observations are not reconstructed.
    if (this.pending.length >= 100) {
      this.pending.shift()
      this.transport.failed()
    }
    this.pending.push({
      event_id: this.transport.uuid(),
      session_id: this.session,
      event,
      feature,
      active_ms: activeMs,
    })
  }

  private captureTime(): void {
    if (this.milliseconds >= 1)
      this.emit('engagement', this.feature, Math.min(60_000, Math.floor(this.milliseconds)))
    this.milliseconds = 0
  }

  async flush(): Promise<void> {
    if (this.sending || this.userId === null || this.pending.length === 0) return
    const userId = this.userId
    const epoch = this.epoch
    const batch = this.pending.slice(0, 20)
    this.sending = true
    try {
      await this.transport.send(userId, batch)
      if (epoch === this.epoch) {
        const ids = new Set(batch.map(e => e.event_id))
        this.pending = this.pending.filter(e => !ids.has(e.event_id))
      }
    } catch {
      // Same IDs on the next sample: a lost response cannot double-count server receipt.
      this.transport.failed()
    } finally {
      this.sending = false
    }
  }
}
