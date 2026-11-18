import { onMounted, ref } from 'vue'
import { asTrainerUploadStatus, type TrainerUploadStatus } from '../lib/trainer-sync'
import { useLifetime } from './useLifetime'

/**
 * The signed-in account's trainer runs that have not reached UpForge yet (waiting / not saved),
 * kept current from the main process. Null until the first answer (or on an older main process).
 */
export function useTrainerUploadStatus() {
  const status = ref<TrainerUploadStatus | null>(null)
  const life = useLifetime()
  let pushes = 0

  async function refresh(): Promise<void> {
    const seen = pushes
    const next = await window.api.trainer.getUploadStatus?.().catch(() => null)
    // A push that arrived while this was in flight is newer: keep it.
    if (!life.ended && seen === pushes) status.value = asTrainerUploadStatus(next)
  }

  onMounted(() => {
    life.own(window.api.on('trainer:upload-status', (raw: unknown) => {
      pushes += 1
      status.value = asTrainerUploadStatus(raw)
    }))
    life.own(window.api.on('session:user-changed', () => { void refresh() }))
    void refresh()
  })

  return { status, refresh }
}
