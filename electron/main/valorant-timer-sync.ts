/**
 * Valorant recording sync from the in-game round timer.
 *
 * Riot's match data times every kill on the game clock, but nothing in it says where the game
 * clock starts inside our recording. The old offset is a loading-time guess (usually -8 s) and was
 * measured wrong by -6 to +4 s on real recordings, so clips and video reviews landed on the wrong
 * seconds. The round timer at the top of the HUD fixes this exactly: when it ticks to 1:35, the
 * round is 5 s old, and Riot's data says when that round started on the game clock.
 *
 * Pure helpers (digit reading, tick finding, offset estimate) plus one function that reads frames
 * from the local recording with ffmpeg. No AI, no network.
 */
import { spawn } from 'child_process'
import templatesJson from './valorant-timer-templates.json'
import { observedRoundStarts } from './riot-event-time'
import { manualSyncNudgeMs, recomputeTimelineVideoOffsets, totalRecordingOffsetMs } from './riot-local-api'
import type { MatchData } from './riot-types'

/** Timer digits as fractions of a 16:9 frame: left x, top y, width w, height h. */
export const TIMER_CROP = { x: 0.465, y: 0.012, w: 0.07, h: 0.04 }
/** Crops are scaled to this size before reading, so any recording resolution reads the same. */
export const CROP_W = 160
export const CROP_H = 51
export const SCAN_FPS = 4
/** Combat timer starts at 1:40. Only values above 0:31 are read: lower ones can be the buy phase. */
const ROUND_SECONDS = 100
const MIN_COMBAT_SECONDS = 31

const GW = templatesJson.width
const GH = templatesJson.height
const TEMPLATES: Array<[number, Float32Array]> = Object.entries(templatesJson.digits)
  .map(([d, v]) => [Number(d), Float32Array.from(v as number[])])

/** Per-pixel whiteness: min(R, G, B). The timer digits are near-white; tinted backgrounds aren't. */
export function whiteness(rgb: Uint8Array, w: number, h: number): Uint8Array {
  const out = new Uint8Array(w * h)
  for (let i = 0; i < w * h; i++) out[i] = Math.min(rgb[i * 3]!, rgb[i * 3 + 1]!, rgb[i * 3 + 2]!)
  return out
}

/** p-th percentile of 0-255 values via a histogram (no copy or sort per frame). */
function percentile(values: Uint8Array, p: number): number {
  const hist = new Uint32Array(256)
  for (let i = 0; i < values.length; i++) hist[values[i]!]!++
  const target = Math.floor((p / 100) * (values.length - 1))
  let seen = 0
  for (let v = 0; v < 256; v++) {
    seen += hist[v]!
    if (seen > target) return v
  }
  return 255
}

/** Bright strokes -> column runs -> glyphs normalised to GW x GH (colon and noise dropped). */
export function glyphs(white: Uint8Array, w: number, h: number): Float32Array[] {
  const thr = Math.max(215, percentile(white, 97) - 25)
  const on = (x: number, y: number) => white[y * w + x]! >= thr
  const runs: Array<[number, number]> = []
  let start = -1
  for (let x = 0; x <= w; x++) {
    let any = false
    if (x < w) for (let y = 0; y < h && !any; y++) any = on(x, y)
    if (any && start < 0) start = x
    if (!any && start >= 0) { runs.push([start, x]); start = -1 }
  }
  const out: Float32Array[] = []
  for (const [a, b] of runs) {
    let top = -1
    let bottom = -1
    for (let y = 0; y < h; y++) {
      let row = false
      for (let x = a; x < b && !row; x++) row = on(x, y)
      if (row) { if (top < 0) top = y; bottom = y }
    }
    if (top < 0 || bottom - top + 1 < h * 0.35) continue
    const gh = bottom - top + 1
    const gw = b - a
    const img = new Float32Array(GW * GH)
    for (let yy = 0; yy < GH; yy++) {
      const sy = top + Math.floor((yy * gh) / GH)
      for (let xx = 0; xx < GW; xx++) img[yy * GW + xx] = on(a + Math.floor((xx * gw) / GW), sy) ? 1 : 0
    }
    out.push(img)
  }
  return out
}

function classify(img: Float32Array): number {
  let best = -1
  let bestScore = -1
  for (const [digit, t] of TEMPLATES) {
    let diff = 0
    for (let i = 0; i < img.length; i++) diff += Math.abs(img[i]! - t[i]!)
    const score = 1 - diff / img.length
    if (score > bestScore) { best = digit; bestScore = score }
  }
  return best
}

/** Seconds shown on the round timer ("1:35" -> 95), or null when the crop isn't a readable timer. */
export function readTimer(white: Uint8Array, w: number, h: number): number | null {
  const gs = glyphs(white, w, h)
  if (gs.length !== 3) return null
  const [m, t, o] = gs.map(classify) as [number, number, number]
  if (m > 1 || t > 5) return null
  return m * 60 + t * 10 + o
}

export interface TimerTick {
  /** Frame index of the last frame showing the old value. */
  frame: number
  /** Value shown after the tick (seconds remaining). */
  shown: number
}

/** Clean one-second ticks (v -> v-1) in the combat phase, confirmed by the neighbouring frames. */
export function findTicks(values: Array<number | null>): TimerTick[] {
  const ticks: TimerTick[] = []
  for (let i = 0; i + 1 < values.length; i++) {
    const a = values[i]
    const b = values[i + 1]
    if (a == null || b == null || a - b !== 1 || a <= MIN_COMBAT_SECONDS || a > ROUND_SECONDS) continue
    const before = i > 0 ? values[i - 1] : null
    const after = i + 2 < values.length ? values[i + 2] : null
    if (before != null && before !== a) continue
    if (after != null && after !== b) continue
    ticks.push({ frame: i, shown: b })
  }
  return ticks
}

export interface OffsetEstimate {
  offsetMs: number
  /** Samples in the agreeing group. */
  samples: number
  rounds: number
  spreadMs: number
  /** Samples outside the agreeing group (misreads). */
  outliers: number
}

/** Samples within this many ms of each other count as agreeing. */
const CLUSTER_MS = 400

/**
 * Recording offset (ms from recording start to game-clock zero) from ticks.
 * A tick to `shown` happens when `shown` seconds remain, i.e. (100 - shown) s after the round's start.
 */
export function estimateOffset(
  samples: Array<{ round: number; videoMs: number; shown: number }>,
  roundStartGameMs: Map<number, number>,
): OffsetEstimate | null {
  const offsets: number[] = []
  const roundOf: number[] = []
  for (const s of samples) {
    const start = roundStartGameMs.get(s.round)
    if (start == null) continue
    offsets.push(s.videoMs - (start + (ROUND_SECONDS - s.shown) * 1000))
    roundOf.push(s.round)
  }
  if (offsets.length === 0) return null
  // Largest group of agreeing samples: a misread or a buy-phase value lands far away and is ignored.
  const sorted = offsets.map((o, i) => [o, roundOf[i]!] as const).sort((a, b) => a[0] - b[0])
  let best: Array<readonly [number, number]> = []
  for (let i = 0, j = 0; i < sorted.length; i++) {
    while (sorted[i]![0] - sorted[j]![0] > CLUSTER_MS) j++
    if (i - j + 1 > best.length) best = sorted.slice(j, i + 1)
  }
  const values = best.map(([o]) => o)
  const median = values[Math.floor(values.length / 2)]!
  const deviations = values.map(o => Math.abs(o - median)).sort((a, b) => a - b)
  return {
    offsetMs: Math.round(median), samples: values.length, rounds: new Set(best.map(([, r]) => r)).size,
    spreadMs: Math.round(deviations[Math.floor(deviations.length / 2)]!), outliers: offsets.length - values.length,
  }
}

/** Trust the estimate only when several ticks from more than one round agree closely. */
export function isTrustworthy(e: OffsetEstimate | null): e is OffsetEstimate {
  return !!e && e.samples >= 6 && e.rounds >= 2 && e.spreadMs <= 150 && e.samples >= 2 * e.outliers
}

/** Resolve to null when the work takes longer than the budget (the work itself is bounded by ffmpeg's timeout). */
function withBudget<T>(work: Promise<T>, budgetMs: number): Promise<T | null> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => resolve(null), budgetMs)
    work.then((v) => { clearTimeout(timer); resolve(v) }, (e) => { clearTimeout(timer); reject(e) })
  })
}

export type FrameReader = (videoPath: string, startSec: number, durationSec: number) => Promise<Uint8Array[]>

/** ffmpeg -> timer crops (RGB) at SCAN_FPS, scaled to CROP_W x CROP_H. */
export function ffmpegFrameReader(ffmpegBin: string, timeoutMs = 60_000): FrameReader {
  return (videoPath, startSec, durationSec) => new Promise((resolve, reject) => {
    const c = TIMER_CROP
    const vf = `fps=${SCAN_FPS},crop=iw*${c.w}:ih*${c.h}:iw*${c.x}:ih*${c.y},scale=${CROP_W}:${CROP_H}`
    // Two threads like clip extraction, so a scan right after a match doesn't hitch the next one.
    const proc = spawn(ffmpegBin, ['-v', 'error', '-threads', '2', '-filter_threads', '2', '-ss', startSec.toFixed(3),
      '-t', durationSec.toFixed(3), '-i', videoPath, '-vf', vf, '-f', 'rawvideo', '-pix_fmt', 'rgb24', 'pipe:1'],
    { stdio: ['ignore', 'pipe', 'pipe'] })
    const chunks: Buffer[] = []
    let stderr = ''
    proc.stdout.on('data', (c: Buffer) => chunks.push(c))
    // Always drain stderr: a full pipe would block ffmpeg on a damaged file.
    proc.stderr.on('data', (c: Buffer) => { stderr = (stderr + c.toString()).slice(-2000) })
    const timer = setTimeout(() => proc.kill('SIGKILL'), timeoutMs)
    proc.on('error', (err) => { clearTimeout(timer); reject(err) })
    proc.on('close', (code, signal) => {
      clearTimeout(timer)
      if (signal === 'SIGKILL') return reject(new Error(`ffmpeg timed out after ${timeoutMs} ms`))
      if (code !== 0) return reject(new Error(`ffmpeg exited ${code}: ${stderr.trim().split('\n').slice(-3).join(' | ')}`))
      const all = Buffer.concat(chunks)
      const size = CROP_W * CROP_H * 3
      const frames: Uint8Array[] = []
      for (let i = 0; i + size <= all.length; i += size) frames.push(new Uint8Array(all.subarray(i, i + size)))
      resolve(frames)
    })
  })
}

/**
 * Measure the recording offset from the round timer. Scans the first rounds Riot's data has a start
 * for, around where the current offset guess puts them (the guess has been off by up to ~15 s).
 */
export async function measureRoundTimerOffset(
  videoPath: string,
  roundStartGameMs: Map<number, number>,
  approxOffsetMs: number,
  readFrames: FrameReader,
  opts: { maxRounds?: number; decode?: (frame: Uint8Array) => number | null } = {},
): Promise<OffsetEstimate | null> {
  const decode = opts.decode ?? ((rgb: Uint8Array) => readTimer(whiteness(rgb, CROP_W, CROP_H), CROP_W, CROP_H))
  const samples: Array<{ round: number; videoMs: number; shown: number }> = []
  const rounds = [...roundStartGameMs.keys()].sort((a, b) => a - b).slice(0, opts.maxRounds ?? 3)
  for (const round of rounds) {
    const startGame = roundStartGameMs.get(round)!
    const windowStartSec = Math.max(0, (startGame + approxOffsetMs) / 1000 - 18)
    const frames = await readFrames(videoPath, windowStartSec, 40)
    const values = frames.map(decode)
    for (const t of findTicks(values)) {
      samples.push({ round, videoMs: (windowStartSec + (t.frame + 0.5) / SCAN_FPS) * 1000, shown: t.shown })
    }
    const est = estimateOffset(samples, roundStartGameMs)
    if (isTrustworthy(est) && est.samples >= 12) return est
  }
  return estimateOffset(samples, roundStartGameMs)
}

/**
 * Align a Valorant recording's timeline to its video. Stores the measured offset as
 * roundTimerOffsetMs, which totalRecordingOffsetMs prefers, so clips, uploads and video review all
 * use it. Skips timelines already measured or nudged by hand, and changes nothing unless the
 * measurement is consistent.
 */
export async function alignValorantTimelineByRoundTimer(
  timeline: MatchData,
  videoPath: string,
  readFrames: FrameReader,
  log: { info: (...a: unknown[]) => void; warn: (...a: unknown[]) => void } = console,
  decode?: (frame: Uint8Array) => number | null,
  budgetMs = 45_000,
): Promise<OffsetEstimate | null> {
  if (timeline.roundTimerOffsetMs != null) return null
  if (manualSyncNudgeMs(timeline) !== 0) return null  // the user already lined this recording up by hand
  const nudgeBefore = manualSyncNudgeMs(timeline)
  const recordingStartBefore = timeline.recordingStartTime
  const starts = observedRoundStarts((timeline.killEvents ?? []) as unknown as Array<Record<string, unknown>>)
  if (starts.size < 2) return null
  const current = totalRecordingOffsetMs(timeline)
  let est: OffsetEstimate | null = null
  try {
    est = await withBudget(measureRoundTimerOffset(videoPath, starts, current, readFrames, { decode }), budgetMs)
  } catch (err) {
    log.warn('[TimerSync] Could not read the recording:', err instanceof Error ? err.message : err)
    return null
  }
  if (manualSyncNudgeMs(timeline) !== nudgeBefore || timeline.recordingStartTime !== recordingStartBefore) {
    log.info('[TimerSync] Recording was nudged or trimmed during the scan; keeping it as the user left it')
    return null
  }
  if (!isTrustworthy(est)) {
    log.info('[TimerSync] Not enough consistent timer ticks; keeping the estimated offset', est)
    return null
  }
  timeline.roundTimerOffsetMs = est.offsetMs
  recomputeTimelineVideoOffsets(timeline)
  log.info(`[TimerSync] Offset ${current} -> ${est.offsetMs} ms from ${est.samples} timer ticks in ${est.rounds} rounds (spread ${est.spreadMs} ms)`)
  return est
}
