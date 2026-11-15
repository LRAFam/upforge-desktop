import type { AxiosInstance } from 'axios'

/**
 * AI-training setting. One server value, `ai_training_opt_out` on the account (default false =
 * included); it replaced the local, off-by-default "Help improve UpForge AI" archive opt-in.
 * Read from GET /api/profile, written with PUT /api/profile/update.
 */
export interface AiTrainingState {
  /** null when the server value could not be read (signed out, offline, older API). */
  optOut: boolean | null
}

export function parseAiTrainingOptOut(profileResponse: unknown): boolean | null {
  const user = (profileResponse as { profile?: { user?: { ai_training_opt_out?: unknown } } } | null)
    ?.profile?.user
  return typeof user?.ai_training_opt_out === 'boolean' ? user.ai_training_opt_out : null
}

export async function readAiTraining(api: AxiosInstance): Promise<AiTrainingState> {
  try {
    const res = await api.get('/api/profile')
    return { optOut: parseAiTrainingOptOut(res.data) }
  } catch {
    return { optOut: null }
  }
}

export async function saveAiTraining(api: AxiosInstance, optOut: boolean): Promise<AiTrainingState> {
  const res = await api.put('/api/profile/update', { ai_training_opt_out: optOut === true })
  const saved = (res.data as { ai_training_opt_out?: unknown } | null)?.ai_training_opt_out
  return { optOut: typeof saved === 'boolean' ? saved : optOut === true }
}
