/** Own subscriptions even when an async mount finishes after unmount. */
export class CleanupScope {
  private cleanups = new Set<() => void>()
  disposed = false

  add(cleanup: () => void): () => void {
    let active = true
    const release = () => {
      if (!active) return
      active = false
      this.cleanups.delete(release)
      cleanup()
    }
    if (this.disposed) release()
    else this.cleanups.add(release)
    return release
  }

  dispose(): void {
    this.disposed = true
    for (const cleanup of this.cleanups) cleanup()
  }
}
