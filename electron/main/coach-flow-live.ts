/**
 * Real after-match coach flow (production). After a Valorant match:
 * allowance check → plan by code (API proxy, free) → cut only the chosen windows from the LOCAL
 * recording → upload those short clips → key-moment reviews arrive progressively.
 * Nothing runs when the player has no key-moment allowance left: the report still shows its facts.
 */

export interface LiveWindow {
  moment_id: string
  round?: number
  window_start_ms: number
  window_end_ms: number
  fps?: number
  kind?: string
}

export interface LiveMoment {
  id: number
  match_id: string
  round_number: number
  window_start_ms: number
  window_end_ms: number
  kind: string | null
  status: 'queued' | 'processing' | 'completed' | 'hidden' | 'failed'
  story: string | null
  fixes: unknown[]
  refunded: boolean
}

export interface LiveUpdate {
  matchId: string
  state: 'planning' | 'cutting' | 'uploading' | 'reviewing' | 'done' | 'skipped' | 'error'
  reason?: string
  moments: LiveMoment[]
  /** Moments the coach actually coached (completed, with a fix). */
  found: number
}

interface ApiResponse { status: number; data: any }
export interface LiveDeps {
  get: (url: string) => Promise<ApiResponse>
  postJson: (url: string, body: unknown) => Promise<ApiResponse>
  postForm: (url: string, form: FormData) => Promise<ApiResponse>
  cut: (src: string, startMs: number, endMs: number, out: string) => Promise<void>
  readFile: (path: string) => Promise<Uint8Array>
  makeTempDir: () => Promise<string>
  removeDir: (dir: string) => Promise<void>
  emit: (update: LiveUpdate) => void
  sleep: (ms: number) => Promise<void>
  /** Caps the polling time (ms). */
  pollBudgetMs?: number
}

export interface LiveInput {
  matchId: string
  videoPath: string
  matchData: Record<string, unknown>
}

const MATCH_ID = /^[A-Za-z0-9_-]{6,80}$/
const TERMINAL = new Set(['completed', 'hidden', 'failed'])
export const MAX_MOMENTS_PER_MATCH = 2
const POLL_MS = 5000

export function foundCount(moments: LiveMoment[]): number {
  return moments.filter(m => m.status === 'completed' && Array.isArray(m.fixes) && m.fixes.length > 0).length
}

/** How many key moments to request: never more than the remaining allowance or the per-match cap. */
export function momentsToRequest(planned: number, remaining: number, cap = MAX_MOMENTS_PER_MATCH): number {
  return Math.max(0, Math.min(planned, remaining, cap))
}

function validWindow(w: unknown): w is LiveWindow {
  const x = w as LiveWindow | null
  return !!x && typeof x.moment_id === 'string' && Number.isFinite(x.window_start_ms) && Number.isFinite(x.window_end_ms)
    && x.window_end_ms > x.window_start_ms && x.window_end_ms - x.window_start_ms <= 60_000
}

export async function runLiveCoachFlow(deps: LiveDeps, input: LiveInput): Promise<LiveUpdate> {
  const { matchId } = input
  const finish = (u: Omit<LiveUpdate, 'matchId'>): LiveUpdate => { const out = { matchId, ...u }; deps.emit(out); return out }
  if (!MATCH_ID.test(matchId)) return finish({ state: 'skipped', reason: 'invalid_match', moments: [], found: 0 })

  // 1. Allowance: skip silently when key moments are off or used up — facts still show in the report.
  const allow = await deps.get('/api/coach/allowances').catch(() => null)
  const km = allow?.status === 200 ? allow.data?.key_moments : null
  if (!km?.enabled) return finish({ state: 'skipped', reason: 'disabled', moments: [], found: 0 })
  if (!(km.remaining > 0)) return finish({ state: 'skipped', reason: 'allowance', moments: [], found: 0 })

  // 2. Plan by code (free).
  deps.emit({ matchId, state: 'planning', moments: [], found: 0 })
  const plan = await deps.postJson('/api/coach-flow/plan', { match_data: input.matchData }).catch(() => null)
  if (plan?.status !== 200) return finish({ state: 'error', reason: 'plan_unavailable', moments: [], found: 0 })
  const planned: Array<{ round_number: number; why?: string; window: unknown }> = Array.isArray(plan.data?.moments) ? plan.data.moments : []
  const usable = planned.filter(m => Number.isInteger(m.round_number) && m.round_number >= 1 && m.round_number <= 60 && validWindow(m.window))
  const take = usable.slice(0, momentsToRequest(usable.length, Number(km.remaining)))
  if (!take.length) return finish({ state: 'skipped', reason: 'nothing_to_review', moments: [], found: 0 })

  // 3. Cut only those windows from the local recording.
  deps.emit({ matchId, state: 'cutting', moments: [], found: 0 })
  const dir = await deps.makeTempDir()
  try {
    const form = new FormData()
    form.append('match_data', JSON.stringify(input.matchData))
    let i = 0
    for (const m of take) {
      const w = m.window as LiveWindow
      const out = `${dir}/moment-${i}.mp4`
      try {
        await deps.cut(input.videoPath, w.window_start_ms, w.window_end_ms, out)
      } catch {
        continue // a clip that can't be cut is skipped, never charged
      }
      const bytes = await deps.readFile(out)
      form.append(`moments[${i}][round_number]`, String(m.round_number))
      form.append(`moments[${i}][window_start_ms]`, String(Math.round(w.window_start_ms)))
      form.append(`moments[${i}][window_end_ms]`, String(Math.round(w.window_end_ms)))
      if (w.kind === 'death' || w.kind === 'kill' || w.kind === 'decision') form.append(`moments[${i}][kind]`, w.kind)
      form.append(`moments[${i}][window]`, JSON.stringify(w))
      form.append(`clips[${i}]`, new Blob([bytes as BlobPart], { type: 'video/mp4' }), `moment-${i}.mp4`)
      i++
    }
    if (i === 0) return finish({ state: 'error', reason: 'clip_cut_failed', moments: [], found: 0 })

    // 4. Upload (charged once per window by the API).
    deps.emit({ matchId, state: 'uploading', moments: [], found: 0 })
    const up = await deps.postForm(`/api/coach-flow/${matchId}/moments`, form).catch(() => null)
    if (!up || (up.status !== 200 && up.status !== 202)) return finish({ state: 'error', reason: 'upload_failed', moments: [], found: 0 })
    const queued: LiveMoment[] = Array.isArray(up.data?.moments) ? up.data.moments : []
    if (!queued.length) return finish({ state: 'skipped', reason: 'allowance', moments: [], found: 0 })
  } finally {
    await deps.removeDir(dir).catch(() => {})
  }

  // 5. Poll until every moment is settled; send each change to the windows.
  const budget = deps.pollBudgetMs ?? 6 * 60_000
  let waited = 0
  let last = ''
  let moments: LiveMoment[] = []
  while (waited <= budget) {
    const r = await deps.get(`/api/coach-flow/${matchId}/moments`).catch(() => null)
    if (r?.status === 200 && Array.isArray(r.data?.moments)) moments = r.data.moments
    const sig = JSON.stringify(moments.map(m => [m.id, m.status]))
    const settled = moments.length > 0 && moments.every(m => TERMINAL.has(m.status))
    if (sig !== last) { last = sig; deps.emit({ matchId, state: settled ? 'done' : 'reviewing', moments, found: foundCount(moments) }) }
    if (settled) return { matchId, state: 'done', moments, found: foundCount(moments) }
    await deps.sleep(POLL_MS)
    waited += POLL_MS
  }
  return finish({ state: 'error', reason: 'timeout', moments, found: foundCount(moments) })
}
