/**
 * Whole-round review client ("AI reviews your round"). Thin, validated calls to the API;
 * the API owns the allowance and charging. Requesting a review spends one round review,
 * so only the app's own windows may ask (checked in the IPC layer).
 */
import type { AxiosInstance } from 'axios'

export interface RoundReviewFix { title: string; detail: string; evidence_ms: number[] }
export interface RoundReview {
  id: number
  round_number: number
  status: 'queued' | 'processing' | 'completed' | 'failed'
  credit_returned: boolean
  story: string | null
  fixes: RoundReviewFix[]
  error: string | null
  created_at: string | null
}
export interface RoundReviewAllowance { enabled: boolean; used: number; limit: number; remaining: number; resets_at: string }

const JOB_ID = /^[A-Za-z0-9_-]{1,100}$/

export function validRound(round: unknown): round is number {
  return Number.isInteger(round) && (round as number) >= 1 && (round as number) <= 60
}

export function validJobId(jobId: unknown): jobId is string {
  return typeof jobId === 'string' && JOB_ID.test(jobId)
}

type Result<T> = { ok: true } & T | { ok: false; error: string; status?: number; allowance?: RoundReviewAllowance }

function failure(e: unknown): { ok: false; error: string; status?: number; allowance?: RoundReviewAllowance } {
  const res = (e as { response?: { status?: number; data?: { message?: string; allowance?: RoundReviewAllowance } } })?.response
  return { ok: false, status: res?.status, error: res?.data?.message ?? 'Round review is unavailable right now.', allowance: res?.data?.allowance }
}

export async function getRoundReviewAllowance(api: AxiosInstance): Promise<Result<{ allowance: RoundReviewAllowance }>> {
  try { return { ok: true, allowance: (await api.get('/api/round-reviews/allowance')).data } } catch (e) { return failure(e) }
}

export async function listRoundReviews(api: AxiosInstance, jobId: unknown): Promise<Result<{ reviews: RoundReview[]; allowance: RoundReviewAllowance }>> {
  if (!validJobId(jobId)) return { ok: false, error: 'Invalid match' }
  try {
    const d = (await api.get(`/api/analysis-jobs/${jobId}/round-reviews`)).data
    return { ok: true, reviews: d.reviews ?? [], allowance: d.allowance }
  } catch (e) { return failure(e) }
}

export async function getRoundReview(api: AxiosInstance, jobId: unknown, round: unknown): Promise<Result<{ review: RoundReview }>> {
  if (!validJobId(jobId) || !validRound(round)) return { ok: false, error: 'Invalid round' }
  try { return { ok: true, review: (await api.get(`/api/analysis-jobs/${jobId}/rounds/${round}/review`)).data.review } } catch (e) { return failure(e) }
}

export async function requestRoundReview(api: AxiosInstance, jobId: unknown, round: unknown): Promise<Result<{ review: RoundReview; charged: boolean; allowance: RoundReviewAllowance }>> {
  if (!validJobId(jobId) || !validRound(round)) return { ok: false, error: 'Invalid round' }
  try {
    const d = (await api.post(`/api/analysis-jobs/${jobId}/rounds/${round}/review`)).data
    return { ok: true, review: d.review, charged: !!d.charged, allowance: d.allowance }
  } catch (e) { return failure(e) }
}
