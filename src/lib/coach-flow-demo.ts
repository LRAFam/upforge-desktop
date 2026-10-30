/** Renderer state for the dev "Replay a real match" coach-flow demo, built from main-process events. */

export type StepState = 'waiting' | 'running' | 'done' | 'failed' | 'skipped'

export interface FlowEvent {
  step: string
  label: string
  state: StepState
  at: number
  took?: number
  costUsd?: number
  detail?: string
  payload?: unknown
}

export interface FlowFix { title?: string; detail?: string; evidence_ms?: number[] }
export interface FlowMoment { step: string; round_number: number; why: string; story: string; fixes: FlowFix[] }

export interface FlowState {
  steps: FlowEvent[]
  summary: { map: string | null; agent: string | null; ally: number | null; enemy: number | null; won: boolean | null } | null
  notes: Record<string, unknown> | null
  plan: { round: { round_number: number; why: string } | null; moments: Array<{ round_number: number; why: string }> } | null
  moments: FlowMoment[]
  roundOffer: { round_number: number; why: string } | null
  roundReview: { round_number: number; why: string; success: boolean; story: string; fixes: FlowFix[]; error: string | null } | null
  costUsd: number
  lastAt: number
  /** True once the main process has nothing in flight. */
  idle: boolean
}

export function emptyFlow(): FlowState {
  return { steps: [], summary: null, notes: null, plan: null, moments: [], roundOffer: null, roundReview: null, costUsd: 0, lastAt: 0, idle: false }
}

/** Fold one event into the state (pure). A step keeps one row; later states replace earlier ones. */
export function applyFlowEvent(s: FlowState, e: FlowEvent): FlowState {
  if (e.step === '__idle') return { ...s, idle: true, lastAt: Math.max(s.lastAt, e.at) }
  if (e.state === 'running') s = { ...s, idle: false }
  const steps = s.steps.some(x => x.step === e.step)
    ? s.steps.map(x => (x.step === e.step ? { ...x, ...e, at: e.state === 'running' ? e.at : x.at, took: e.took ?? x.took } : x))
    : [...s.steps, e]
  const next: FlowState = { ...s, steps, lastAt: Math.max(s.lastAt, e.at) }
  if (e.state === 'done' && typeof e.costUsd === 'number') next.costUsd = s.costUsd + e.costUsd
  const p = (e.payload ?? null) as Record<string, unknown> | null
  if (e.state !== 'done' || !p) return next
  if (e.step === 'match-data') next.summary = p as FlowState['summary']
  else if (e.step === 'report') next.notes = (p.notes as Record<string, unknown> | null) ?? null
  else if (e.step === 'plan') next.plan = p as FlowState['plan']
  else if (e.step.startsWith('moment-')) next.moments = [...s.moments, { step: e.step, ...(p as Omit<FlowMoment, 'step'>) }]
  else if (e.step === 'round-offer') next.roundOffer = p as FlowState['roundOffer']
  else if (e.step === 'round-review') next.roundReview = p as FlowState['roundReview']
  return next
}

/** "12.4 s" — elapsed seconds since the simulated match end. */
export function seconds(ms: number | undefined): string {
  if (typeof ms !== 'number' || !Number.isFinite(ms)) return '–'
  return `${(ms / 1000).toFixed(1)} s`
}

/** "$0.046" — demo cost; never shown to players. */
export function usd(v: number | undefined): string {
  return typeof v === 'number' && v > 0 ? `$${v < 0.01 ? v.toFixed(4) : v.toFixed(3)}` : ''
}

/** Video time of a fix's evidence, "1:42". */
export function clock(ms: number | undefined): string {
  if (typeof ms !== 'number' || !Number.isFinite(ms)) return ''
  const s = Math.max(0, Math.round(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/** Readable lines from the match-report notes payload (headline, subline, evidence, next step). */
export function noteLines(notes: Record<string, unknown> | null): { headline: string; lines: string[]; next: string } {
  const text = (v: unknown) => (v && typeof v === 'object' && typeof (v as { text?: unknown }).text === 'string' ? (v as { text: string }).text : '')
  if (!notes) return { headline: '', lines: [], next: '' }
  const lines = [text(notes.subline), ...((Array.isArray(notes.evidence) ? notes.evidence : []).map(text))].filter(Boolean)
  return { headline: text(notes.headline), lines, next: text(notes.next_action) }
}
