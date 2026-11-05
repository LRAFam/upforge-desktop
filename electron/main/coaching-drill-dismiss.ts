/** POST /api/drills/{id}/dismiss for `trainer:dismiss-coaching-drill` (kept out of gaming-ipc so it can be tested). */
import type { AxiosInstance } from 'axios'

export type DismissCoachingDrillResult = { ok: true } | { ok: false; error: string }

export async function dismissCoachingDrill(
  api: Pick<AxiosInstance, 'post'>,
  token: string | null | undefined,
  id: unknown,
): Promise<DismissCoachingDrillResult> {
  if (!token) return { ok: false, error: 'Sign in to change your drills.' }
  if (typeof id !== 'number' || !Number.isInteger(id) || id <= 0) return { ok: false, error: 'Unknown drill.' }
  try {
    await api.post(`/api/drills/${id}/dismiss`)
    return { ok: true }
  } catch (err: any) {
    const detail = err?.response?.status ? `HTTP ${err.response.status}` : (err?.message ?? 'network error')
    return { ok: false, error: `Couldn’t hide that drill (${detail}). Try again.` }
  }
}
