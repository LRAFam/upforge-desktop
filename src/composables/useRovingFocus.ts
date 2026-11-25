import { nextTick, onBeforeUnmount, onMounted, onUpdated, type Ref } from 'vue'
import { roveStop, roveTarget, type RoveItem } from '../lib/roving-focus'

/**
 * Makes a list one Tab stop with arrow-key movement inside (see lib/roving-focus.ts for the markup).
 * Arrow keys used here don't reach the review's global shortcuts (←/→ would otherwise skip the video).
 * `data-rove-current` on an item makes it the default stop (e.g. the round being watched).
 */
export function useRovingFocus(container: Ref<HTMLElement | null>) {
  let last: HTMLElement | null = null
  /** Group of the item focused last, so focus can land on its row if that item is re-rendered away. */
  let lastGroup: string | null = null

  const items = () => Array.from(container.value?.querySelectorAll<HTMLElement>('[data-rove]') ?? [])
  const describe = (els: HTMLElement[]): RoveItem[] => els.map(el => ({ line: el.dataset.rove === 'line', group: el.dataset.roveGroup ?? '' }))

  function sync() {
    const els = items()
    const stop = roveStop(els.length, {
      last: last ? els.indexOf(last) : -1,
      current: els.findIndex(el => el.hasAttribute('data-rove-current')),
      firstLine: els.findIndex(el => el.dataset.rove === 'line'),
    })
    els.forEach((el, i) => { el.tabIndex = i === stop ? 0 : -1 })
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.altKey || e.ctrlKey || e.metaKey) return
    const els = items()
    const at = els.indexOf(e.target as HTMLElement)
    if (at < 0) return
    // Space activates the focused round / event (the review's global Space = play/pause would cancel it).
    if (e.key === ' ') { e.stopPropagation(); return }
    const to = roveTarget(describe(els), at, e.key)
    if (to == null) {
      // Our keys stay ours even at the ends of the list, so ←/→ never skip the video from here.
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) { e.preventDefault(); e.stopPropagation() }
      return
    }
    e.preventDefault()
    e.stopPropagation()
    last = els[to]
    sync()
    els[to].focus()
    els[to].scrollIntoView({ block: 'nearest' })
  }

  function onFocusin(e: FocusEvent) {
    const el = (e.target as HTMLElement | null)?.closest<HTMLElement>('[data-rove]')
    if (el && container.value?.contains(el)) { last = el; lastGroup = el.dataset.roveGroup ?? null; sync() }
  }

  /** Selecting an item can re-render it away (a preview icon disappears when its round opens): keep focus in the list. */
  function keepFocus() {
    if (!last || last.isConnected) return
    const focusLost = !document.activeElement || document.activeElement === document.body
    const els = items()
    const next = els.find(el => el.dataset.rove === 'line' && el.dataset.roveGroup === lastGroup) ?? null
    last = next
    sync()
    if (focusLost) next?.focus()
  }

  /** Focus the list's current stop (skip links use this). */
  function focusList(): boolean {
    sync()
    const el = items().find(x => x.tabIndex === 0)
    el?.focus()
    return !!el
  }

  onMounted(() => {
    container.value?.addEventListener('keydown', onKeydown)
    container.value?.addEventListener('focusin', onFocusin)
    void nextTick(sync)
  })
  onUpdated(() => { void nextTick(() => { keepFocus(); sync() }) })
  onBeforeUnmount(() => {
    container.value?.removeEventListener('keydown', onKeydown)
    container.value?.removeEventListener('focusin', onFocusin)
  })

  return { sync, focusList }
}
