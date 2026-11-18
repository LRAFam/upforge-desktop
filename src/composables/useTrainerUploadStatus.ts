import { onMounted, ref } from 'vue'
import { asTrainerUnsavedRuns, asTrainerUploadStatus, type TrainerUnsavedRun, type TrainerUploadStatus } from '../lib/trainer-sync'
import { useLifetime } from './useLifetime'

/**
 * The signed-in account's trainer runs that have not reached UpForge yet (waiting / not saved),
 * kept current from the main process. Null until the first answer (or on an older main process).
 * `unsavedRuns` lists the ones that could not be saved, with the reason; `retry` sends them again.
 */
export function useTrainerUploadStatus() {
  const status = ref<TrainerUploadStatus | null>(null)
  const unsavedRuns = ref<TrainerUnsavedRun[]>([])
  const retrying = ref(false)
  const life = useLifetime()
  let pushes = 0
  let lists = 0

  /** The list follows the count: loaded while there are unsaved runs, empty otherwise. */
  async function setStatus(next: TrainerUploadStatus | null): Promise<void> {
    status.value = next
    const ask = ++lists
    const runs = next?.unsaved
      ? asTrainerUnsavedRuns(await window.api.trainer.getUnsavedRuns?.().catch(() => null))
      : []
    if (!life.ended && ask === lists) unsavedRuns.value = runs
  }

  async function refresh(): Promise<void> {
    const seen = pushes
    const next = await window.api.trainer.getUploadStatus?.().catch(() => null)
    // A push that arrived while this was in flight is newer: keep it.
    if (!life.ended && seen === pushes) await setStatus(asTrainerUploadStatus(next))
  }

  /** Sends the unsaved runs again: they upload now, or wait in the queue until UpForge is reachable. */
  async function retry(): Promise<void> {
    if (retrying.value) return
    retrying.value = true
    try {
      await window.api.trainer.retryUnsaved?.().catch(() => 0)
    } finally {
      if (!life.ended) retrying.value = false
    }
    await refresh()
  }

  onMounted(() => {
    life.own(window.api.on('trainer:upload-status', (raw: unknown) => {
      pushes += 1
      void setStatus(asTrainerUploadStatus(raw))
    }))
    life.own(window.api.on('session:user-changed', () => { void refresh() }))
    void refresh()
  })

  return { status, unsavedRuns, retrying, refresh, retry }
}
