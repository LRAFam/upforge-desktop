/** Cooperative match guard shared by transfers and video-processing jobs. */
export class BackgroundWorkPausedError extends Error {
  constructor() { super('Background work paused for an active match') }
}

export class BackgroundWorkCancelledError extends Error {
  constructor() { super('Background work cancelled') }
}

export class BackgroundWorkGate {
  private active = new Set<AbortController>()
  private generation = 0
  constructor(private isBlocked: () => boolean = () => false, private intervalMs = 250) {}

  configure(isBlocked: () => boolean): void { this.isBlocked = isBlocked }
  get blocked(): boolean { return this.isBlocked() }

  /** Interrupt every active operation; each run retries after the match ends. */
  pause(): void {
    for (const controller of this.active) controller.abort(new BackgroundWorkPausedError())
  }

  cancel(): void {
    this.generation++
    for (const controller of this.active) controller.abort(new BackgroundWorkCancelledError())
  }

  async wait(checkCancelled: () => void = () => {}): Promise<void> {
    checkCancelled()
    while (this.blocked) {
      await new Promise((resolve) => setTimeout(resolve, this.intervalMs))
      checkCancelled()
    }
  }

  async run<T>(operation: (signal: AbortSignal) => Promise<T>, checkCancelled: () => void = () => {}): Promise<T> {
    const generation = this.generation
    const check = () => {
      if (generation !== this.generation) throw new BackgroundWorkCancelledError()
      checkCancelled()
    }
    for (;;) {
      await this.wait(check)
      const controller = new AbortController()
      this.active.add(controller)
      const timer = setInterval(() => {
        if (this.blocked) controller.abort(new BackgroundWorkPausedError())
      }, this.intervalMs)
      try {
        // Recheck after the await: match detection can run before this continuation.
        if (this.blocked) continue
        return await operation(controller.signal)
      } catch (err) {
        check()
        if (!controller.signal.aborted) throw err
      } finally {
        clearInterval(timer)
        this.active.delete(controller)
      }
    }
  }
}

export const backgroundWork = new BackgroundWorkGate()
