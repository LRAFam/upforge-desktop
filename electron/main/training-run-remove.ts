/**
 * DELETE /api/training/sessions/{id} for `trainer:remove-run` (kept out of gaming-ipc so it can be tested).
 * Owner only on the API; the run leaves history, bests and leaderboards. A 404 means it is already gone.
 */
import type { AxiosInstance } from 'axios'

export type RemoveTrainingRunResult = { ok: true } | { ok: false; error: string }

export const REMOVE_RUN_FAILED = 'Couldn’t remove that run. Try again in a moment.'

export async function removeTrainingRun(
  api: Pick<AxiosInstance, 'delete'>,
  token: string | null | undefined,
  id: unknown,
): Promise<RemoveTrainingRunResult> {
  if (!token) return { ok: false, error: 'Sign in to remove runs.' }
  if (typeof id !== 'number' || !Number.isInteger(id) || id <= 0) return { ok: false, error: 'Unknown run.' }
  try {
    await api.delete(`/api/training/sessions/${id}`)
    return { ok: true }
  } catch (err: any) {
    if (err?.response?.status === 404) return { ok: true }
    return { ok: false, error: REMOVE_RUN_FAILED }
  }
}
