/** Prevent concurrent upload/analysis pipelines for the same saved recording. */
export class RecordingPipelineSingleFlight<T> {
  private readonly active = new Map<string, Promise<T>>()

  run(key: string, start: () => Promise<T>, onDuplicate?: () => void): Promise<T> {
    const existing = this.active.get(key)
    if (existing) {
      onDuplicate?.()
      return existing
    }

    let pending: Promise<T>
    try {
      pending = start()
    } catch (error) {
      return Promise.reject(error)
    }
    this.active.set(key, pending)
    void pending.finally(() => {
      if (this.active.get(key) === pending) this.active.delete(key)
    }).catch(() => {})
    return pending
  }
}
