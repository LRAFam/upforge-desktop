import { onMounted, onBeforeUnmount, ref } from 'vue'
import { validAccountUsage, type AccountUsage } from '../lib/account-usage'
export function useAccountUsage() {
  const usage = ref<AccountUsage | null>(null), error = ref(''), loading = ref(false)
  let generation = 0
  let lastLoaded = 0
  async function load() {
    if (loading.value) return
    const request = ++generation
    loading.value = true; error.value = ''
    try {
      const result = await window.api.accountUsage.get()
      if (request !== generation) return
      if (!result.ok) { error.value = result.error; return }
      if (!validAccountUsage(result.data)) { error.value = 'Usage could not be verified. Please try again.'; return }
      usage.value = result.data
      lastLoaded = Date.now()
    } catch { if (request === generation) error.value = 'Usage is unavailable. Please try again.' }
    finally { if (request === generation) loading.value = false }
  }
  function clear() { generation++; usage.value = null; error.value = 'Sign in again to view usage.'; loading.value = false }
  const cleanup = [window.api.on('session:user-changed', clear), window.api.on('auth:session-expired', clear), ...['recordings:updated', 'clips:updated', 'clips:new'].map(event => window.api.on(event, () => { void load() }))]
  const focus = () => { if (Date.now() - lastLoaded > 30000) void load() }
  onMounted(() => { void load(); window.addEventListener('focus', focus) })
  onBeforeUnmount(() => { generation++; cleanup.forEach(fn => fn()); window.removeEventListener('focus', focus) })
  return { usage, error, loading, load }
}
