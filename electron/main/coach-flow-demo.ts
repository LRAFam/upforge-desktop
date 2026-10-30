/**
 * Dev-only "Replay a real match": runs the after-match coach flow live on one of the player's
 * analysed Valorant matches, so the fast path can be watched step by step.
 *
 * Production data is read-only (GET analysis + a signed playback URL). Every AI call goes to a
 * LOCAL AI service (COACH_FLOW_AI_URL), never to the production API, and each run has a hard
 * spend cap. Clips are cut locally with ffmpeg range-reading the cloud recording, so only a few
 * seconds of video ever move. Signed URLs are never logged or sent to the renderer.
 */
import { spawn } from 'node:child_process'
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import log from 'electron-log'

export const RUN_BUDGET_USD = 0.5
/** Upper estimates used to refuse a call that could cross the cap. */
export const ESTIMATE_USD = { report: 0.01, moment: 0.05, round: 0.15 } as const
const CUT_CONCURRENCY = 3

export type StepState = 'waiting' | 'running' | 'done' | 'failed' | 'skipped'
export interface FlowEvent {
  step: string
  label: string
  state: StepState
  /** ms since the simulated match end when this state was reached */
  at: number
  /** ms the step took (done/failed) */
  took?: number
  costUsd?: number
  detail?: string
  payload?: unknown
}

export interface DemoDeps {
  api: { get: (url: string) => Promise<{ data: unknown }> }
  playbackUrl: (analysis: Record<string, unknown>) => Promise<string | null>
  aiUrl: string
  aiKey: string | null
  ffmpeg: string
  emit: (e: FlowEvent) => void
  now?: () => number
  fetchImpl?: typeof fetch
  cut?: (url: string, startMs: number, endMs: number, out: string) => Promise<void>
}

interface Window {
  moment_id: string
  round: number
  window_start_ms: number
  window_end_ms: number
  fps: number
  kind?: string
}

/** Pure budget guard: may a call with this estimate run without crossing the cap? */
export function withinBudget(spentUsd: number, estimateUsd: number, capUsd = RUN_BUDGET_USD): boolean {
  return spentUsd + estimateUsd <= capUsd + 1e-9
}

function costOf(res: unknown): number {
  const r = res as { cost?: { total_usd?: number }; cost_usd?: number } | null
  const v = r?.cost?.total_usd ?? r?.cost_usd
  return typeof v === 'number' && Number.isFinite(v) ? v : 0
}

export function cutWithFfmpeg(ffmpeg: string) {
  return (url: string, startMs: number, endMs: number, out: string) => new Promise<void>((resolve, reject) => {
    const args = [
      '-y', '-loglevel', 'error',
      ...(url.startsWith('http') ? ['-reconnect', '1', '-reconnect_streamed', '1', '-reconnect_delay_max', '5'] : []),
      '-ss', (Math.max(0, startMs) / 1000).toFixed(3),
      '-i', url,
      '-t', (Math.max(500, endMs - startMs) / 1000).toFixed(3),
      // 720p at 15 fps is plenty for the reviewer (it samples at most 6 fps) and keeps uploads small.
      '-vf', "scale=-2:'min(720,ih)',fps=15",
      '-an', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '26', '-pix_fmt', 'yuv420p',
      out,
    ]
    const p = spawn(ffmpeg, args, { stdio: ['ignore', 'ignore', 'pipe'] })
    let err = ''
    p.stderr.on('data', d => { err += String(d).slice(0, 2000) })
    const timer = setTimeout(() => p.kill('SIGKILL'), 120_000)
    p.on('close', code => {
      clearTimeout(timer)
      // Never surface ffmpeg stderr verbatim: it can echo the signed URL.
      if (code === 0) resolve()
      else reject(new Error(`ffmpeg exited ${code}${err.includes('403') ? ' (playback link expired)' : ''}`))
    })
  })
}

async function pool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let next = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++
      out[i] = await fn(items[i])
    }
  })
  await Promise.all(workers)
  return out
}

/** One replay run. Keeps its clips until the round review has been asked for (or the run is disposed). */
export class CoachFlowDemoRun {
  private t0 = 0
  private spent = 0
  private dir: string | null = null
  private matchData: Record<string, unknown> | null = null
  private roundPlan: { round_number: number; why: string; windows: Window[] } | null = null
  private roundClips: Record<string, string> = {}
  private readonly now: () => number
  private readonly fetchImpl: typeof fetch
  private readonly cut: NonNullable<DemoDeps['cut']>

  constructor(private readonly deps: DemoDeps) {
    this.now = deps.now ?? Date.now
    this.fetchImpl = deps.fetchImpl ?? fetch
    this.cut = deps.cut ?? cutWithFfmpeg(deps.ffmpeg)
  }

  get spentUsd(): number { return this.spent }

  private at(): number { return this.now() - this.t0 }

  private async step<T>(step: string, label: string, fn: () => Promise<{ value: T; costUsd?: number; detail?: string; payload?: unknown }>): Promise<T | null> {
    const start = this.at()
    this.deps.emit({ step, label, state: 'running', at: start })
    try {
      const r = await fn()
      if (r.costUsd) this.spent += r.costUsd
      this.deps.emit({ step, label, state: 'done', at: this.at(), took: this.at() - start, costUsd: r.costUsd, detail: r.detail, payload: r.payload })
      return r.value
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      log.warn(`[CoachFlowDemo] ${step} failed: ${msg}`)
      this.deps.emit({ step, label, state: 'failed', at: this.at(), took: this.at() - start, detail: msg })
      return null
    }
  }

  private skip(step: string, label: string, detail: string): void {
    this.deps.emit({ step, label, state: 'skipped', at: this.at(), detail })
  }

  private headers(): Record<string, string> {
    return this.deps.aiKey ? { 'X-API-Key': this.deps.aiKey } : {}
  }

  private async aiJson(path: string, body: unknown): Promise<unknown> {
    const res = await this.fetchImpl(`${this.deps.aiUrl}${path}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...this.headers() }, body: JSON.stringify(body),
    })
    if (!res.ok) throw new Error(`AI ${path} ${res.status}`)
    return res.json()
  }

  private async aiForm(path: string, form: FormData): Promise<unknown> {
    const res = await this.fetchImpl(`${this.deps.aiUrl}${path}`, { method: 'POST', headers: this.headers(), body: form })
    if (!res.ok) {
      const detail = await res.json().then((j: { detail?: string }) => j?.detail, () => null)
      throw new Error(`AI ${path} ${res.status}${detail ? `: ${detail}` : ''}`)
    }
    return res.json()
  }

  private async clipForm(fields: Record<string, string>, clips: Record<string, string>): Promise<{ form: FormData; bytes: number }> {
    const form = new FormData()
    for (const [k, v] of Object.entries(fields)) form.append(k, v)
    let bytes = 0
    for (const [name, path] of Object.entries(clips)) {
      const buf = await readFile(path)
      bytes += buf.byteLength
      form.append(name, new Blob([buf], { type: 'video/mp4' }), `${name}.mp4`)
    }
    return { form, bytes }
  }

  /** Match end → report → plan → clips → key-moment reviews. The round review waits for the player. */
  async run(analysisId: number): Promise<void> {
    try {
      await this.runSteps(analysisId)
    } finally {
      this.idle()
    }
  }

  /** Tells the screen nothing is in flight any more (not a timeline row). */
  private idle(): void {
    this.deps.emit({ step: '__idle', label: '', state: 'done', at: this.at() })
  }

  private async runSteps(analysisId: number): Promise<void> {
    this.t0 = this.now()
    this.deps.emit({ step: 'match-end', label: 'Match ended', state: 'done', at: 0, took: 0 })

    const analysis = await this.step('match-data', 'Match data ready', async () => {
      const res = await this.deps.api.get(`/api/analysis/${analysisId}`)
      const a = (res.data as { analysis?: Record<string, unknown> })?.analysis
      const md = a?.match_data as Record<string, unknown> | undefined
      if (!a || !md) throw new Error('No match data on this analysis')
      this.matchData = md
      const fs = (md.finalScore ?? {}) as { allyScore?: number; enemyScore?: number }
      const summary = {
        map: md.map ?? a.map ?? null, agent: md.agent ?? a.agent ?? null,
        ally: fs.allyScore ?? null, enemy: fs.enemyScore ?? null,
        won: typeof fs.allyScore === 'number' && typeof fs.enemyScore === 'number' ? fs.allyScore > fs.enemyScore : null,
      }
      return { value: a, payload: summary, detail: `${(md.roundSummaries as unknown[] | undefined)?.length ?? 0} rounds` }
    })
    if (!analysis || !this.matchData) return

    const md = this.matchData
    const urlPromise = this.deps.playbackUrl(analysis).catch(() => null)

    // Data coaching and planning run while the playback link resolves.
    const reportTask = withinBudget(this.spent, ESTIMATE_USD.report)
      ? this.step('report', 'Match report ready', async () => {
          const r = await this.aiJson('/api/match-report', { match_data: md, tier: 'free' }) as { notes?: unknown; facts?: unknown }
          return { value: r, costUsd: costOf(r), payload: { notes: r.notes ?? null }, detail: 'data coaching' }
        })
      : Promise.resolve(this.skip('report', 'Match report ready', 'budget'))

    const plan = await this.step('plan', 'Round and moments picked', async () => {
      const p = await this.aiJson('/api/coach-flow/plan', { match_data: md }) as {
        round: { round_number: number; why: string; windows: Window[] } | null
        moments: Array<{ round_number: number; why: string; window: Window }>
      }
      this.roundPlan = p.round
      const n = p.moments.length
      return {
        value: p,
        payload: { round: p.round ? { round_number: p.round.round_number, why: p.round.why } : null, moments: p.moments.map(m => ({ round_number: m.round_number, why: m.why, moment_id: m.window.moment_id })) },
        detail: p.round ? `round ${p.round.round_number} + ${n} ${n === 1 ? 'moment' : 'moments'}` : 'nothing worth a video review',
      }
    })

    const url = await urlPromise
    if (!plan || (!plan.round && !plan.moments.length)) { await reportTask; return }
    if (!url) {
      this.skip('clips', 'Clips cut on this PC', 'no cloud recording for this match')
      await reportTask
      return
    }

    this.dir = await mkdtemp(join(tmpdir(), 'upforge-flow-'))
    const dir = this.dir
    const jobs: Array<{ key: string; w: Window; target: 'moment' | 'round' }> = [
      ...plan.moments.map(m => ({ key: m.window.moment_id, w: m.window, target: 'moment' as const })),
      ...(plan.round?.windows ?? []).map(w => ({ key: w.moment_id, w, target: 'round' as const })),
    ]
    const clipPaths: Record<string, string> = {}
    await this.step('clips', 'Clips cut on this PC', async () => {
      let bytes = 0
      await pool(jobs, CUT_CONCURRENCY, async (j) => {
        const out = join(dir, `${j.key}.mp4`)
        await this.cut(url, j.w.window_start_ms, j.w.window_end_ms, out)
        clipPaths[j.key] = out
        bytes += (await stat(out)).size
      })
      const secs = jobs.reduce((n, j) => n + (j.w.window_end_ms - j.w.window_start_ms), 0) / 1000
      return { value: true, detail: `${jobs.length} clips · ${Math.round(secs)} s of video · ${(bytes / 1e6).toFixed(1)} MB (instead of the full recording)` }
    })
    for (const w of plan.round?.windows ?? []) if (clipPaths[w.moment_id]) this.roundClips[`clip_${w.moment_id}`] = clipPaths[w.moment_id]

    // Key moments: each one uploaded and coached on its own, all at once; results appear as they land.
    await Promise.all([
      reportTask,
      ...plan.moments.map(async (m, i) => {
        const step = `moment-${i + 1}`
        const label = `Key moment ${i + 1} coached (round ${m.round_number})`
        const path = clipPaths[m.window.moment_id]
        if (!path) return this.skip(step, label, 'clip missing')
        if (!withinBudget(this.spent, ESTIMATE_USD.moment)) return this.skip(step, label, 'budget')
        await this.step(step, label, async () => {
          const { form, bytes } = await this.clipForm(
            { match_data: JSON.stringify(md), round_number: String(m.round_number), window: JSON.stringify(m.window) },
            { clip: path },
          )
          const r = await this.aiForm('/api/coach-flow/moment', form) as { story?: string; fixes?: unknown[] }
          return { value: r, costUsd: costOf(r), payload: { round_number: m.round_number, why: m.why, story: r.story ?? '', fixes: r.fixes ?? [] }, detail: `uploaded ${(bytes / 1e6).toFixed(1)} MB` }
        })
      }),
    ])
    if (this.roundPlan) {
      this.deps.emit({ step: 'round-offer', label: `"Review round ${this.roundPlan.round_number}" offered`, state: 'done', at: this.at(), took: 0, payload: { round_number: this.roundPlan.round_number, why: this.roundPlan.why } })
    }
  }

  /** The player pressed "Review round N": upload that round's clips and coach the whole round. */
  async reviewRound(): Promise<void> {
    const plan = this.roundPlan
    const md = this.matchData
    if (!plan || !md || !Object.keys(this.roundClips).length) {
      this.skip('round-review', 'Round review', 'no round clips')
      return
    }
    if (!withinBudget(this.spent, ESTIMATE_USD.round)) {
      this.skip('round-review', `Round ${plan.round_number} reviewed`, 'budget')
      return
    }
    try {
      await this.reviewRoundStep(plan, md)
    } finally {
      this.idle()
    }
    await this.dispose()
  }

  private async reviewRoundStep(plan: { round_number: number; why: string }, md: Record<string, unknown>): Promise<void> {
    await this.step('round-review', `Round ${plan.round_number} reviewed`, async () => {
      const { form, bytes } = await this.clipForm({ match_data: JSON.stringify(md), round_number: String(plan.round_number) }, this.roundClips)
      const r = await this.aiForm('/api/coach-flow/round-review', form) as { success?: boolean; story?: string; fixes?: unknown[]; error?: string }
      return {
        value: r,
        costUsd: costOf(r),
        payload: { round_number: plan.round_number, why: plan.why, success: r.success !== false, story: r.story ?? '', fixes: r.fixes ?? [], error: r.error ?? null },
        detail: `${Object.keys(this.roundClips).length} clips · uploaded ${(bytes / 1e6).toFixed(1)} MB`,
      }
    })
  }

  async dispose(): Promise<void> {
    if (this.dir) await rm(this.dir, { recursive: true, force: true }).catch(() => {})
    this.dir = null
  }
}
