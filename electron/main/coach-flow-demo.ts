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
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
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
  /** Pull one still (jpg) from a clip at offsetMs. */
  still?: (clip: string, offsetMs: number, out: string) => Promise<void>
  /** Dev cache root: clips, stills and the event log are kept per match so a replay can cost $0. */
  cacheDir?: string | null
}

/** A still from a clip, sent to the screen as a data URL (no file:// access needed in dev). */
export interface FlowStill { src: string; videoMs: number }

/** Match-data fields the screen draws from (round strip, minimap, round timeline, numbers). */
const MATCH_FIELDS = ['map', 'agent', 'puuid', 'gameMode', 'finalScore', 'finalStats', 'roundSummaries', 'kills', 'deaths', 'killEvents', 'teamSnapshot', 'roundReplay', 'matchDetailsLite', 'recordingStartTime', 'matchStartTime'] as const

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

export function stillWithFfmpeg(ffmpeg: string) {
  return (clip: string, offsetMs: number, out: string) => new Promise<void>((resolve, reject) => {
    const args = ['-y', '-loglevel', 'error', '-ss', (Math.max(0, offsetMs) / 1000).toFixed(3), '-i', clip,
      '-frames:v', '1', '-vf', 'scale=640:-2', '-q:v', '5', out]
    const p = spawn(ffmpeg, args, { stdio: ['ignore', 'ignore', 'ignore'] })
    const timer = setTimeout(() => p.kill('SIGKILL'), 30_000)
    p.on('close', code => { clearTimeout(timer); code === 0 ? resolve() : reject(new Error(`ffmpeg still exited ${code}`)) })
  })
}

async function dataUrl(path: string): Promise<string> {
  return `data:image/jpeg;base64,${(await readFile(path)).toString('base64')}`
}

/** Where in the clip the decisive moment is: the first fix's evidence time if it lands inside the window. */
export function decisiveVideoMs(window: { window_start_ms: number; window_end_ms: number }, fixes: unknown[]): number {
  for (const f of fixes as Array<{ evidence_ms?: unknown }>) {
    const ms = Array.isArray(f?.evidence_ms) ? f.evidence_ms.find((v): v is number => typeof v === 'number') : undefined
    if (typeof ms === 'number' && ms >= window.window_start_ms && ms <= window.window_end_ms) return ms
  }
  return Math.round((window.window_start_ms + window.window_end_ms) / 2)
}

/** Up to `max` still times for a round: fix evidence first, then the middle of each window, in time order. */
export function roundStillTimes(windows: Array<{ window_start_ms: number; window_end_ms: number }>, fixes: unknown[], max = 5): number[] {
  const inside = (ms: number) => windows.some(w => ms >= w.window_start_ms && ms <= w.window_end_ms)
  const times: number[] = []
  for (const f of fixes as Array<{ evidence_ms?: unknown }>) {
    for (const ms of Array.isArray(f?.evidence_ms) ? f.evidence_ms : []) {
      if (typeof ms === 'number' && inside(ms) && !times.some(t => Math.abs(t - ms) < 1500)) times.push(ms)
    }
  }
  for (const w of windows) {
    const mid = Math.round((w.window_start_ms + w.window_end_ms) / 2)
    if (!times.some(t => Math.abs(t - mid) < 1500)) times.push(mid)
  }
  return times.sort((a, b) => a - b).slice(0, max).sort((a, b) => a - b)
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
  /** True only for a temp folder; a cache folder is kept so the run can be replayed for $0. */
  private ownsDir = false
  private matchData: Record<string, unknown> | null = null
  private roundPlan: { round_number: number; why: string; windows: Window[] } | null = null
  private roundClips: Record<string, string> = {}
  private roundWindows: Window[] = []
  private clipFiles: Record<string, string> = {}
  private analysisId = 0
  private readonly log: Array<FlowEvent & { phase: 'run' | 'round' }> = []
  private phase: 'run' | 'round' = 'run'
  private roundT0 = 0
  private readonly now: () => number
  private readonly fetchImpl: typeof fetch
  private readonly cut: NonNullable<DemoDeps['cut']>
  private readonly still: NonNullable<DemoDeps['still']>
  private readonly emitRaw: DemoDeps['emit']

  constructor(private deps: DemoDeps) {
    this.now = deps.now ?? Date.now
    this.fetchImpl = deps.fetchImpl ?? fetch
    this.cut = deps.cut ?? cutWithFfmpeg(deps.ffmpeg)
    this.still = deps.still ?? stillWithFfmpeg(deps.ffmpeg)
    this.emitRaw = deps.emit
    // Every event is also logged so the run can be replayed from the cache at $0.
    this.deps = { ...deps, emit: (e) => { this.record(e); this.emitRaw(e) } }
  }

  private record(e: FlowEvent): void {
    if (!this.deps.cacheDir) return
    const at = this.phase === 'round' ? e.at - this.roundT0 : e.at
    this.log.push({ ...e, at, phase: this.phase })
  }

  private async saveLog(): Promise<void> {
    const dir = this.cacheFolder()
    if (!dir || !this.log.length) return
    await mkdir(dir, { recursive: true })
    await writeFile(join(dir, 'events.json'), JSON.stringify({ analysisId: this.analysisId, savedAt: Date.now(), events: this.log, clips: Object.keys(this.clipFiles) }))
  }

  private cacheFolder(): string | null {
    return this.deps.cacheDir && this.analysisId ? join(this.deps.cacheDir, String(this.analysisId)) : null
  }

  /** Raw bytes of a cut clip, for inline playback (the screen makes a blob URL). */
  async clipBytes(key: string): Promise<Uint8Array | null> {
    const path = this.clipFiles[key]
    return path ? new Uint8Array(await readFile(path)) : null
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

  private async stillAt(clip: string, w: Window, videoMs: number, name: string): Promise<FlowStill | null> {
    if (!this.dir) return null
    const out = join(this.dir, `${name}.jpg`)
    try {
      await this.still(clip, Math.max(0, videoMs - w.window_start_ms), out)
      return { src: await dataUrl(out), videoMs }
    } catch (e) {
      log.warn(`[CoachFlowDemo] still failed: ${e instanceof Error ? e.message : String(e)}`)
      return null
    }
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
    this.analysisId = analysisId
    try {
      await this.runSteps(analysisId)
    } finally {
      this.idle()
      await this.saveLog().catch(() => {})
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
      const matchData: Record<string, unknown> = {}
      for (const k of MATCH_FIELDS) if (md[k] !== undefined) matchData[k] = md[k]
      return { value: a, payload: { ...summary, matchData }, detail: `${(md.roundSummaries as unknown[] | undefined)?.length ?? 0} rounds` }
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

    const cached = this.cacheFolder()
    if (cached) await mkdir(cached, { recursive: true })
    this.dir = cached ?? await mkdtemp(join(tmpdir(), 'upforge-flow-'))
    this.ownsDir = !cached
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
        this.clipFiles[j.key] = out
        bytes += (await stat(out)).size
      })
      const secs = jobs.reduce((n, j) => n + (j.w.window_end_ms - j.w.window_start_ms), 0) / 1000
      return { value: true, detail: `${jobs.length} clips · ${Math.round(secs)} s of video · ${(bytes / 1e6).toFixed(1)} MB (instead of the full recording)` }
    })
    for (const w of plan.round?.windows ?? []) if (clipPaths[w.moment_id]) this.roundClips[`clip_${w.moment_id}`] = clipPaths[w.moment_id]
    this.roundWindows = (plan.round?.windows ?? []).filter(w => clipPaths[w.moment_id])

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
          const fixes = r.fixes ?? []
          const videoMs = decisiveVideoMs(m.window, fixes)
          const still = await this.stillAt(path, m.window, videoMs, `still-${m.window.moment_id}`)
          return {
            value: r, costUsd: costOf(r),
            payload: { round_number: m.round_number, why: m.why, story: r.story ?? '', fixes, window: m.window, clipKey: m.window.moment_id, still },
            detail: `uploaded ${(bytes / 1e6).toFixed(1)} MB`,
          }
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
    this.phase = 'round'
    this.roundT0 = this.at()
    try {
      await this.reviewRoundStep(plan, md)
    } finally {
      this.idle()
      await this.saveLog().catch(() => {})
    }
    if (!this.cacheFolder()) await this.dispose()
  }

  private async reviewRoundStep(plan: { round_number: number; why: string }, md: Record<string, unknown>): Promise<void> {
    await this.step('round-review', `Round ${plan.round_number} reviewed`, async () => {
      const { form, bytes } = await this.clipForm({ match_data: JSON.stringify(md), round_number: String(plan.round_number) }, this.roundClips)
      const r = await this.aiForm('/api/coach-flow/round-review', form) as { success?: boolean; story?: string; fixes?: unknown[]; error?: string }
      const fixes = r.fixes ?? []
      const stills: FlowStill[] = []
      for (const ms of roundStillTimes(this.roundWindows, fixes)) {
        const w = this.roundWindows.find(x => ms >= x.window_start_ms && ms <= x.window_end_ms)
        const clip = w ? this.clipFiles[w.moment_id] : undefined
        if (!w || !clip) continue
        const s = await this.stillAt(clip, w, ms, `round-${plan.round_number}-${ms}`)
        if (s) stills.push(s)
      }
      return {
        value: r,
        costUsd: costOf(r),
        payload: {
          round_number: plan.round_number, why: plan.why, success: r.success !== false, story: r.story ?? '', fixes, error: r.error ?? null,
          stills, windows: this.roundWindows.map(w => ({ key: w.moment_id, start: w.window_start_ms, end: w.window_end_ms })),
        },
        detail: `${Object.keys(this.roundClips).length} clips · uploaded ${(bytes / 1e6).toFixed(1)} MB`,
      }
    })
  }

  async dispose(): Promise<void> {
    if (this.dir && this.ownsDir) await rm(this.dir, { recursive: true, force: true }).catch(() => {})
    this.dir = null
  }
}

type LoggedEvent = FlowEvent & { phase: 'run' | 'round' }

/** The saved event log of an earlier run, or null. */
export async function readCachedRun(cacheDir: string, analysisId: number): Promise<{ events: LoggedEvent[]; dir: string } | null> {
  const dir = join(cacheDir, String(analysisId))
  try {
    const raw = JSON.parse(await readFile(join(dir, 'events.json'), 'utf8')) as { events?: LoggedEvent[] }
    return Array.isArray(raw.events) && raw.events.length ? { events: raw.events, dir } : null
  } catch (e) {
    log.warn(`[CoachFlowDemo] cached run unreadable: ${e instanceof Error ? e.message : String(e)}`)
    return null
  }
}

/**
 * Replays a cached run with its original timings: same screens, same stills and clips, $0.
 * The timeline still shows the times and costs measured when it really ran.
 */
export class CoachFlowCachedReplay {
  private timers: Array<ReturnType<typeof setTimeout>> = []

  constructor(
    private readonly cached: { events: LoggedEvent[]; dir: string },
    private readonly emit: (e: FlowEvent) => void,
  ) {}

  private play(phase: 'run' | 'round'): void {
    for (const e of this.cached.events.filter(x => x.phase === phase)) {
      const { phase: _p, ...event } = e
      this.timers.push(setTimeout(() => this.emit(event), Math.max(0, e.at)))
    }
  }

  async run(): Promise<void> { this.play('run') }
  async reviewRound(): Promise<void> { this.play('round') }
  get hasRoundReview(): boolean { return this.cached.events.some(e => e.phase === 'round') }

  async clipBytes(key: string): Promise<Uint8Array | null> {
    if (!/^[\w-]+$/.test(key)) return null
    try { return new Uint8Array(await readFile(join(this.cached.dir, `${key}.mp4`))) } catch { return null }
  }

  async dispose(): Promise<void> {
    for (const t of this.timers) clearTimeout(t)
    this.timers = []
  }
}
