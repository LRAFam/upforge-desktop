import type { Router } from 'vue-router'
import type { UsageFeature } from './product-usage'
import { hasDesktopApi } from './desktop-api'

export function desktopUsageFeature(path: string): UsageFeature | null {
  if (['/splash', '/overlay', '/login', '/onboarding', '/dev', '/dashboard-needs-you-preview', '/post-game-preview'].includes(path)) return null
  if (path === '/vod-review' || path === '/post-game') return 'report'
  if (path === '/stats' || path === '/performance') return 'match_stats'
  if (path.startsWith('/training') || path === '/trainer-results') return 'training'
  if (path === '/clips') return 'clips'
  if (path === '/recordings' || path === '/cloud-storage') return 'recordings'
  if (path === '/settings') return 'settings'
  if (path === '/rosters') return 'coaching'
  if (path === '/dashboard') return 'dashboard'
  return 'other_product'
}

export function setupProductUsage(router: Router): () => void {
  if (!hasDesktopApi()) return () => {}
  let lastInput = Number.NEGATIVE_INFINITY
  const sample = (visit = false) => {
    void window.api.productUsage.sample({
      feature: desktopUsageFeature(router.currentRoute.value.path),
      active: document.visibilityState === 'visible' && document.hasFocus() && performance.now() - lastInput < 60_000,
      visit,
    }).catch(() => {}) // Tracking must never interrupt product use.
  }
  const input = (event: Event) => { if (event.isTrusted) lastInput = performance.now() }
  const visibility = () => sample()
  const focus = () => sample()
  const stop = router.afterEach((_to, _from, failure) => { if (!failure) sample(true) })
  const inputs = ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart']
  for (const name of inputs) window.addEventListener(name, input, { passive: true })
  document.addEventListener('visibilitychange', visibility)
  window.addEventListener('blur', visibility)
  window.addEventListener('focus', focus)
  const timer = setInterval(sample, 5000)
  void router.isReady().then(() => sample(true))
  return () => {
    clearInterval(timer); stop()
    for (const name of inputs) window.removeEventListener(name, input)
    document.removeEventListener('visibilitychange', visibility)
    window.removeEventListener('blur', visibility)
    window.removeEventListener('focus', focus)
  }
}
