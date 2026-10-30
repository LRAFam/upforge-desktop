import { onMounted, onBeforeUnmount, ref } from 'vue'
import { validAccountUsage, type AccountUsage } from '../lib/account-usage'
import { uiV3 } from '../lib/ui-v3'
import { readCache, writeCache } from '../lib/stale-cache'

const USAGE_CACHE_KEY = 'account-usage'
export function useAccountUsage() {
  const usage = ref<AccountUsage | null>(null), error = ref(''), loading = ref(false)
  // UI v3: show the last verified usage at once; a failed refresh keeps it on screen.
  if (uiV3.value) {
    const hit = readCache<unknown>(USAGE_CACHE_KEY)
    if (hit && validAccountUsage(hit.value)) usage.value = hit.value
  }
  let generation = 0
  let lastLoaded = 0
  async function load() {
    if (loading.value) return
    const request = ++generation
    loading.value = true; error.value = ''
    try {
      const result = await window.api.accountUsage.get()
      if (request !== generation) return
      const keep = uiV3.value && usage.value !== null
      if (!result.ok) { if (!keep) error.value = result.error; return }
      if (!validAccountUsage(result.data)) { if (!keep) error.value = 'Usage could not be verified. Please try again.'; return }
      usage.value = result.data
      if (uiV3.value) writeCache(USAGE_CACHE_KEY, result.data)
      lastLoaded = Date.now()
    } catch { if (request === generation && !(uiV3.value && usage.value !== null)) error.value = 'Usage is unavailable. Please try again.' }
    finally { if (request === generation) loading.value = false }
  }
  function clear() { generation++; usage.value = null; error.value = 'Sign in again to view usage.'; loading.value = false }
  const cleanup = [window.api.on('session:user-changed', clear), window.api.on('auth:session-expired', clear), ...['recordings:updated', 'clips:updated', 'clips:new'].map(event => window.api.on(event, () => { void load() }))]
  const focus = () => { if (Date.now() - lastLoaded > 30000) void load() }
  onMounted(() => { void load(); window.addEventListener('focus', focus) })
  onBeforeUnmount(() => { generation++; cleanup.forEach(fn => fn()); window.removeEventListener('focus', focus) })
  return { usage, error, loading, load }
}
