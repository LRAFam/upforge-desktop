import { ref } from 'vue'
import { focusSyncMessage, type FocusResponse, type FocusSyncResult, type FocusUpdate } from '../lib/focus'

interface FocusApi {
  getFocus: () => Promise<FocusResponse | null>
  syncFocus: () => Promise<FocusSyncResult | null>
}

/** Each mount hydrates from the account's persisted report, rather than waiting for a new event. */
export function createFocusCardState(api: FocusApi) {
  const data = ref<FocusResponse | null>(null)
  const loading = ref(true)
  const loadError = ref('')
  const syncing = ref(false)
  const syncMessage = ref('')
  let requestId = 0
  let disposed = false

  async function load() {
    const request = ++requestId
    try {
      const response = await api.getFocus()
      if (disposed || request !== requestId) return
      if (!response?.success) throw new Error('Focus unavailable')
      data.value = response
      loadError.value = ''
    } catch {
      if (!disposed && request === requestId) loadError.value = 'Could not load your focus. Please try again.'
    } finally {
      if (!disposed && request === requestId) loading.value = false
    }
  }

  function applyUpdate(update: FocusUpdate) {
    if (disposed) return
    requestId++ // A request started before this event must not overwrite it.
    data.value = {
      success: true,
      history: [],
      notes_usage: { used: 0, limit: 0 },
      ...data.value,
      focus: update.focus,
      latest: update,
    }
    loading.value = false
    loadError.value = ''
  }

  async function syncNow() {
    if (disposed || syncing.value) return
    syncing.value = true
    syncMessage.value = ''
    try {
      const result = await api.syncFocus()
      if (disposed) return
      syncMessage.value = focusSyncMessage(result)
      if (result?.latest) applyUpdate(result.latest)
      await load()
    } catch {
      if (!disposed) syncMessage.value = 'Could not check your matches. Please try again.'
    } finally {
      if (!disposed) syncing.value = false
    }
  }

  function dispose() {
    disposed = true
    requestId++
  }

  return { data, loading, loadError, syncing, syncMessage, load, applyUpdate, syncNow, dispose }
}
