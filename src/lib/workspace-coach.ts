export interface CoachMoment { analysis_id: number; position: number; round: number | null }
export interface CoachQuestion { id: string; message: string; moments: CoachMoment[] }
/** Electron cannot clone Vue proxies. Keep retries tied to the original plain values. */
export function coachQuestionPayload(question: CoachQuestion): CoachQuestion {
  return {
    id: question.id,
    message: question.message,
    moments: question.moments.map(moment => ({
      analysis_id: moment.analysis_id, position: moment.position, round: moment.round,
    })),
  }
}
export interface CoachAnswer { id: string; status: 'queued' | 'running' | 'complete' | 'failed'; moments: CoachMoment[]; question: string; answer: string | null; created_at: string }
export interface CoachHistory { items: CoachAnswer[]; locked: boolean; usage: { analysis_remaining: number; daily_remaining: number; chat_credits: number; unlimited: boolean } }
export function validCoachHistory(value: unknown): value is CoachHistory {
  if (!value || typeof value !== 'object') return false
  const v = value as CoachHistory
  return typeof v.locked === 'boolean' && !!v.usage && typeof v.usage.unlimited === 'boolean'
    && [v.usage.analysis_remaining, v.usage.daily_remaining, v.usage.chat_credits].every(n => Number.isInteger(n) && n >= 0)
    && Array.isArray(v.items) && v.items.every(item => typeof item.id === 'string' && typeof item.question === 'string'
      && ['queued','running','complete','failed'].includes(item.status) && (item.answer === null || typeof item.answer === 'string')
      && Array.isArray(item.moments) && item.moments.length >= 1 && item.moments.length <= 2
      && item.moments.every(m => Number.isInteger(m.analysis_id) && m.analysis_id > 0 && Number.isFinite(m.position) && m.position >= 0
        && (m.round === null || (Number.isInteger(m.round) && m.round >= 0))))
}

/** UI guidance only; the API reserves the authoritative allowance. */
export function coachAccessState(history: CoachHistory | null): 'unavailable' | 'locked' | 'included' | 'credit' | 'exhausted' {
  if (!history) return 'unavailable'
  if (history.locked) return 'locked'
  if (history.usage.unlimited || Math.min(history.usage.analysis_remaining, history.usage.daily_remaining) > 0) return 'included'
  return history.usage.chat_credits > 0 ? 'credit' : 'exhausted'
}
