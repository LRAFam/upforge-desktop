/**
 * Pause background polls that are not needed during a match (coach notifications, stuck-analysis
 * reconcile, renderer stats refresh). Not for match-detection polls.
 *
 * Costs nothing extra in-match: the predicate is only read when a poll's own timer fires, and a
 * skipped poll returns straight away. A skipped poll runs once when the match ends (resume()).
 */

export interface GuardOptions {
  /** Run the poll once on resume() when a tick was skipped. Default true. */
  catchUp?: boolean
}

export class PollPauseController {
  private missed = new Map<string, () => void>()

  constructor(private isPaused: () => boolean = () => false) {}

  configure(isPaused: () => boolean): void {
    this.isPaused = isPaused
  }

  get paused(): boolean {
    try { return this.isPaused() } catch { return false }
  }

  /** Wrap a poll tick: skipped while paused (and queued for resume unless catchUp is false). */
  guard(name: string, tick: () => void, opts: GuardOptions = {}): () => void {
    const catchUp = opts.catchUp !== false
    return () => {
      if (this.paused) {
        if (catchUp) this.missed.set(name, tick)
        return
      }
      this.missed.delete(name)
      tick()
    }
  }

  /** The match / recording ended: run each skipped poll once. Returns how many ran. */
  resume(): number {
    if (this.paused || this.missed.size === 0) return 0
    const ticks = [...this.missed.values()]
    this.missed.clear()
    for (const tick of ticks) {
      try { tick() } catch { /* one failing poll must not stop the rest */ }
    }
    return ticks.length
  }
}
