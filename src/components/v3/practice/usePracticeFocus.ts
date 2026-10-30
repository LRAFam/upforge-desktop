import { onMounted, onUnmounted, ref } from 'vue'
import type { Focus, FocusResponse, FocusUpdate } from '../../../lib/focus'
import { readCache, writeCache } from '../../../lib/stale-cache'

const FOCUS_CACHE_KEY = 'practice:focus'

interface FocusApi {
  getFocus?: () => Promise<FocusResponse | null>
  onFocusUpdated?: (cb: (payload: FocusUpdate) => void) => () => void
}

/** The player's active focus, read with the same IPC as the Home focus card (no new channels). */
export function activeFocusOf(response: FocusResponse | null | undefined): Focus | null {
  const focus = response?.success ? response.focus : null
  return focus && focus.progress?.status === 'active' ? focus : null
}

export function usePracticeFocus(api: FocusApi | undefined) {
  // Last known focus draws the focus session at once, so the hero doesn't swap when the request lands.
  const cached = readCache<Focus | null>(FOCUS_CACHE_KEY)
  const focus = ref<Focus | null>(cached && (cached.value === null || cached.value.progress?.status === 'active') ? cached.value : null)
  let off: (() => void) | null = null
  let disposed = false

  async function load() {
    if (!api?.getFocus) return
    try {
      const res = await api.getFocus()
      if (!disposed) {
        focus.value = activeFocusOf(res)
        writeCache(FOCUS_CACHE_KEY, focus.value)
      }
    } catch {
      // No focus shown: Practice falls back to its normal session hero.
    }
  }

  onMounted(() => {
    void load()
    off = api?.onFocusUpdated?.(update => {
      focus.value = update.focus && update.focus.progress?.status === 'active' ? update.focus : null
      writeCache(FOCUS_CACHE_KEY, focus.value)
    }) ?? null
  })
  onUnmounted(() => {
    disposed = true
    off?.()
  })

  return { focus }
}
