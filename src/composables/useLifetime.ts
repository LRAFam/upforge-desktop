import { onUnmounted } from 'vue'

/**
 * Ties timers and IPC listeners to the component that created them, even when they are created
 * after an `await` in `onMounted`. A view unmounted mid-init (RouterView re-key at startup, a quick
 * click away) used to leave those late timers/listeners running forever — each leaked view kept
 * polling and reloading on every IPC event.
 *
 * `own(cleanup)` runs `cleanup` on unmount — or straight away if the view is already gone.
 */
export function useLifetime() {
  let ended = false
  const cleanups: (() => void)[] = []
  onUnmounted(() => {
    ended = true
    for (const fn of cleanups.splice(0)) {
      try { fn() } catch { /* one failed cleanup must not skip the rest */ }
    }
  })
  return {
    /** True once the owning component has unmounted. */
    get ended(): boolean { return ended },
    own(cleanup: () => void): void {
      if (ended) cleanup()
      else cleanups.push(cleanup)
    },
    /** setInterval that stops with the component (never starts if it already unmounted). */
    interval(fn: () => void, ms: number): void {
      if (ended) return
      const id = setInterval(fn, ms)
      cleanups.push(() => clearInterval(id))
    },
  }
}
