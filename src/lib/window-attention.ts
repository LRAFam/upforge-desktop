import { ref, readonly } from 'vue'

/**
 * Whether the player is looking at this UpForge window: focused and not hidden.
 *
 * `document.hidden` alone is not enough in a match. A game on one monitor with UpForge visible on
 * another (or behind a borderless game that doesn't fully occlude it) keeps `hidden` false, so the
 * redesigned UI kept polling, ticking its 1 s clock and running its pulse animations on a
 * transparent, maximised window — GPU/CPU work competing with the game every frame.
 * Background ticks and infinite animations pause while this is false.
 */
const attentive = ref(true)
let installed = false

function read(): boolean {
  if (typeof document === 'undefined') return true
  try {
    return !document.hidden && (typeof document.hasFocus !== 'function' || document.hasFocus())
  } catch {
    return true
  }
}

function update(): void {
  const next = read()
  if (attentive.value !== next) attentive.value = next
}

function install(): void {
  if (installed || typeof window === 'undefined' || typeof document === 'undefined') return
  installed = true
  window.addEventListener('focus', update)
  window.addEventListener('blur', update)
  document.addEventListener('visibilitychange', update)
  update()
}

/** Reactive: true while the window is focused and visible. */
export function useWindowAttention() {
  install()
  return readonly(attentive)
}

/** For timers: skip a non-essential tick while the player is looking elsewhere (usually the game). */
export function windowIsBackground(): boolean {
  install()
  return !read()
}
