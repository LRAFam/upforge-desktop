/** Observe the review container and release the observer when the view closes. */
export function observeVideoArea(element: HTMLElement, update: () => void): () => void {
  let frame: number | null = null
  let stopped = false
  const observer = new ResizeObserver(() => {
    if (stopped || frame !== null) return
    // Vue flushes reactive style changes in a microtask. Defer the update to
    // the next frame so it cannot resize an ancestor during observer delivery.
    frame = requestAnimationFrame(() => {
      frame = null
      if (!stopped) update()
    })
  })
  observer.observe(element)
  return () => {
    stopped = true
    observer.disconnect()
    if (frame !== null) cancelAnimationFrame(frame)
    frame = null
  }
}
