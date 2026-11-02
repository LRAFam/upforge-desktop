import { describe, expect, it, vi } from 'vitest'
vi.mock('electron', () => ({}))
vi.mock('../renderer-trust', () => ({ isTrustedRendererUrl: (url: string) => url === 'app://trusted' }))
import { parseSkillProfile, parseWeeklyPlan, setupProgressPlanHandlers } from './progress-plan-ipc'
import type { IpcMain } from 'electron'
import type { AuthManager } from '../auth-manager'

function fixture(get: (url: string) => Promise<{ data: unknown }>, signedIn = true) {
  const handlers = new Map<string, (...args: unknown[]) => unknown>()
  const api = { get: vi.fn(get) }
  const auth = { isAuthenticated: () => signedIn, getApi: vi.fn(() => api) }
  setupProgressPlanHandlers({ handle: (name: string, fn: (...args: unknown[]) => unknown) => handlers.set(name, fn) } as unknown as IpcMain, auth as unknown as AuthManager)
  const call = (channel: string, url: string | null = 'app://trusted') => handlers.get(channel)!(url === null ? {} : { senderFrame: { url } })
  return { call, api, auth }
}
const channels = ['progress:weekly-plan', 'progress:skill-profile']

describe('progress plan IPC', () => {
  it.each(channels)('%s refuses untrusted frames and signed-out users', async (channel) => {
    const f = fixture(async () => ({ data: {} }))
    expect(await f.call(channel, 'https://evil.example')).toEqual({ ok: false, error: 'Untrusted request' })
    expect(await f.call(channel, null)).toEqual({ ok: false, error: 'Untrusted request' })
    const out = fixture(async () => ({ data: {} }), false)
    expect(await out.call(channel)).toEqual({ ok: false, error: 'Not signed in' })
    expect(f.api.get).not.toHaveBeenCalled()
    expect(out.api.get).not.toHaveBeenCalled()
  })

  it('reads the current week of the active roadmap', async () => {
    const f = fixture(async () => ({ data: {
      success: true, current_week: 3,
      week_info: { focus_topic: 'Crosshair placement', category: 'aim', why_it_matters: 'Most of your deaths are off-angle.' },
      goals: [{ id: 'goal_0', text: 'Hit 25% headshots', completed: true }, { id: 'goal_1', text: 'Warm up 10 minutes', completed: false }, { id: 'goal_2', text: '' }],
    } }))
    expect(await f.call('progress:weekly-plan')).toEqual({ ok: true, plan: {
      week: 3, totalWeeks: 10, focusTopic: 'Crosshair placement', whyItMatters: 'Most of your deaths are off-angle.',
      goals: [{ text: 'Hit 25% headshots', done: true }, { text: 'Warm up 10 minutes', done: false }],
    } })
    expect(f.api.get).toHaveBeenCalledWith('/api/goals/current')
  })

  it('returns no plan when no roadmap is active, and an error when the call fails', async () => {
    expect(parseWeeklyPlan({ success: true, current_week: null, goals: [] })).toBeNull()
    const f = fixture(async () => { throw new Error('500') })
    expect(await f.call('progress:weekly-plan')).toEqual({ ok: false, error: 'Could not load your roadmap.' })
  })

  it('averages category scores over the coached matches and keeps the latest', async () => {
    const f = fixture(async () => ({ data: { category_history: [
      { categories: { aim: 6, positioning: 4 } },
      { categories: { aim: 8 } },
      { categories: {} },
    ] } }))
    expect(await f.call('progress:skill-profile')).toEqual({ ok: true, locked: false, profile: {
      matches: 2,
      categories: [{ key: 'aim', latest: 6, average: 7, samples: 2 }, { key: 'positioning', latest: 4, average: 4, samples: 1 }],
    } })
    expect(f.api.get).toHaveBeenCalledWith('/api/skill-profile')
  })

  it('never scales scores up; 0–100 values come back to 0–10', () => {
    expect(parseSkillProfile({ category_history: [{ categories: { aim: 70 } }] })?.categories[0]).toMatchObject({ latest: 7, average: 7 })
    expect(parseSkillProfile({ category_history: [] })).toBeNull()
  })

  it('says locked when the plan does not include the skill profile (403)', async () => {
    const f = fixture(async () => { throw Object.assign(new Error('403'), { response: { status: 403 } }) })
    expect(await f.call('progress:skill-profile')).toEqual({ ok: true, locked: true, profile: null })
    const g = fixture(async () => { throw Object.assign(new Error('500'), { response: { status: 500 } }) })
    expect(await g.call('progress:skill-profile')).toEqual({ ok: false, error: 'Could not load your skill profile.' })
  })
})
