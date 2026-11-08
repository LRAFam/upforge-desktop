/**
 * After an upgrade button opens checkout in the browser, the user pays there and comes back.
 * For 10 minutes after checkout started, each return to the app (window focus) refreshes the
 * signed-in user and usage once, debounced, so the new plan / allowance shows without a restart.
 */

export const CHECKOUT_FOCUS_WINDOW_MS = 10 * 60 * 1000
export const CHECKOUT_FOCUS_DEBOUNCE_MS = 1500

export interface CheckoutFocusRefresh {
  checkoutStarted(): void
  onFocus(): void
  isWatching(): boolean
  cancel(): void
}

export function createCheckoutFocusRefresh(
  refresh: () => Promise<void>,
  opts: { windowMs?: number; debounceMs?: number } = {},
): CheckoutFocusRefresh {
  const windowMs = opts.windowMs ?? CHECKOUT_FOCUS_WINDOW_MS
  const debounceMs = opts.debounceMs ?? CHECKOUT_FOCUS_DEBOUNCE_MS
  let startedAt: number | null = null
  let timer: ReturnType<typeof setTimeout> | null = null

  const isWatching = () => startedAt !== null && Date.now() - startedAt <= windowMs
  const clear = () => { if (timer) clearTimeout(timer); timer = null }

  return {
    checkoutStarted() { startedAt = Date.now() },
    isWatching,
    onFocus() {
      if (!isWatching()) { startedAt = null; return }
      clear()
      timer = setTimeout(() => {
        timer = null
        if (!isWatching()) return
        void refresh().catch(() => { /* offline: the next focus tries again */ })
      }, debounceMs)
      ;(timer as { unref?: () => void }).unref?.()
    },
    cancel() { clear(); startedAt = null },
  }
}
