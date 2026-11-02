/**
 * Progress v3: the 10-week roadmap's current week (GET /api/goals/current) and the
 * category skill profile (GET /api/skill-profile, Plus). Read-only; trimmed to what the screen shows.
 */
import type { IpcMain, IpcMainInvokeEvent } from 'electron'
import type { AuthManager } from '../auth-manager'
import { isTrustedRendererUrl } from '../renderer-trust'

type Api = { get: (url: string) => Promise<{ data?: unknown }> }
type Refusal = { ok: false; error: string }

export interface WeeklyPlan {
  /** 1-based week of the active roadmap. */
  week: number
  totalWeeks: number
  focusTopic: string | null
  whyItMatters: string | null
  goals: Array<{ text: string; done: boolean }>
}
/** `plan: null` = no active roadmap (no add-on, or finished). */
export type WeeklyPlanResult = { ok: true; plan: WeeklyPlan | null } | Refusal

export interface SkillProfileSummary {
  /** Coached matches the scores come from (newest first on the API, at most 20). */
  matches: number
  categories: Array<{ key: string; latest: number | null; average: number; samples: number }>
}
/** `locked: true` = the plan doesn't include the skill profile (API 403). */
export type SkillProfileResult = { ok: true; locked: boolean; profile: SkillProfileSummary | null } | Refusal

const ROADMAP_WEEKS = 10
const rec = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {})
const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null)
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)
/** Category scores are 0–10; a stray 0–100 value is brought back to 0–10, never scaled up. */
const score10 = (v: number): number => Math.min(10, Math.max(0, v > 10 ? v / 10 : v))

export function parseWeeklyPlan(body: unknown): WeeklyPlan | null {
  const b = rec(body)
  const week = num(b.current_week)
  if (week == null || week < 1) return null
  const info = rec(b.week_info)
  const goals = (Array.isArray(b.goals) ? b.goals : [])
    .map(g => ({ text: str(rec(g).text), done: rec(g).completed === true }))
    .filter((g): g is { text: string; done: boolean } => g.text != null)
  return {
    week: Math.round(week),
    totalWeeks: ROADMAP_WEEKS,
    focusTopic: str(info.focus_topic),
    whyItMatters: str(info.why_it_matters),
    goals,
  }
}

export function parseSkillProfile(body: unknown): SkillProfileSummary | null {
  const history = Array.isArray(rec(body).category_history) ? rec(body).category_history as unknown[] : []
  const sums = new Map<string, { total: number; n: number; latest: number | null }>()
  history.forEach((entry, i) => {
    for (const [key, raw] of Object.entries(rec(rec(entry).categories))) {
      const v = num(raw)
      if (v == null) continue
      const s = sums.get(key) ?? { total: 0, n: 0, latest: null }
      s.total += score10(v)
      s.n += 1
      if (i === 0) s.latest = score10(v)
      sums.set(key, s)
    }
  })
  const matches = history.filter(e => Object.keys(rec(rec(e).categories)).length > 0).length
  if (!matches) return null
  const categories = [...sums.entries()]
    .map(([key, s]) => ({ key, latest: s.latest, average: Math.round((s.total / s.n) * 10) / 10, samples: s.n }))
    .sort((a, b) => b.samples - a.samples || a.average - b.average)
  return { matches, categories }
}

export async function fetchWeeklyPlan(api: Api): Promise<WeeklyPlanResult> {
  try {
    const res = await api.get('/api/goals/current')
    return { ok: true, plan: parseWeeklyPlan(res.data) }
  } catch {
    return { ok: false, error: 'Could not load your roadmap.' }
  }
}

export async function fetchSkillProfile(api: Api): Promise<SkillProfileResult> {
  try {
    const res = await api.get('/api/skill-profile')
    return { ok: true, locked: false, profile: parseSkillProfile(res.data) }
  } catch (e) {
    if ((e as { response?: { status?: number } })?.response?.status === 403) return { ok: true, locked: true, profile: null }
    return { ok: false, error: 'Could not load your skill profile.' }
  }
}

export function setupProgressPlanHandlers(ipcMain: IpcMain, auth: AuthManager): void {
  const refusal = (event: IpcMainInvokeEvent): Refusal | null => {
    if (!event.senderFrame || !isTrustedRendererUrl(event.senderFrame.url)) return { ok: false, error: 'Untrusted request' }
    if (!auth.isAuthenticated()) return { ok: false, error: 'Not signed in' }
    return null
  }
  ipcMain.handle('progress:weekly-plan', event => refusal(event) ?? fetchWeeklyPlan(auth.getApi()))
  ipcMain.handle('progress:skill-profile', event => refusal(event) ?? fetchSkillProfile(auth.getApi()))
}
