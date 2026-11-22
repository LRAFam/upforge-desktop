import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import {
  collectPracticeData,
  mergePracticeData,
  practiceRefreshNotice,
  shouldCachePracticeData,
  type PracticeDataReply,
  type TrainerData,
} from './practice-trainer-data'
import { readCache, writeCache } from './stale-cache'
import type { TrainingHistory } from '../env'

// The focus composable registers its load in onMounted: run it at once here (no component needed).
const mounted = vi.hoisted(() => [] as Array<() => unknown>)
vi.mock('vue', async (importOriginal) => {
  const vue = await importOriginal<typeof import('vue')>()
  return { ...vue, onMounted: (hook: () => unknown) => { mounted.push(hook) }, onUnmounted: () => {} }
})

const offline = () => Promise.reject(new Error('getaddrinfo ENOTFOUND'))
const SAVED: TrainerData = [
  { total: 12, sessions: [], by_scenario: {} } as unknown as TrainerData[0],
  { focus: { reason: 'Dying first' }, steps: [] } as unknown as TrainerData[1],
  [{ id: 7 } as unknown as TrainerData[2][number]],
  ['You hit more after warming up.'],
  { flick: { user_best: 80 } } as unknown as TrainerData[4],
]

describe('Practice keeps its data when UpForge cannot be reached', () => {
  it('main reports a read that throws as failed, apart from an empty answer', async () => {
    const reply = await collectPracticeData({
      history: offline,
      plan: async () => null,
      drills: async () => [],
      insights: offline,
      benchmark: async () => null,
    })
    expect(reply.history).toEqual({ ok: false })
    expect(reply.plan).toEqual({ ok: true, value: null })
    expect(reply.drills).toEqual({ ok: true, value: [] })
    expect(reply.insights).toEqual({ ok: false })
  })

  it('failed answers keep the last saved data on screen and leave the cache unchanged', async () => {
    const key = 'practice:trainer:test-offline'
    writeCache(key, SAVED, null)
    const before = JSON.stringify(readCache<TrainerData>(key, null)!.value)

    const reply = await collectPracticeData({ history: offline, plan: offline, drills: offline, insights: offline, benchmark: offline })
    const previous = readCache<TrainerData>(key, null)!.value
    const merged = mergePracticeData(reply, previous)
    expect(merged.failed).toBe(true)
    expect(merged.data).toEqual(SAVED)
    if (shouldCachePracticeData(merged.failed, true)) writeCache(key, merged.data, null)

    expect(JSON.stringify(readCache<TrainerData>(key, null)!.value)).toBe(before)
    expect(practiceRefreshNotice(merged.failed, true)).toBe('Couldn’t refresh. Showing your last saved data.')
  })

  it('a part that answered replaces its saved copy; a failed part keeps its own', () => {
    const reply: PracticeDataReply = {
      history: { ok: false },
      plan: { ok: true, value: null },
      drills: { ok: false },
      insights: { ok: true, value: [] },
      benchmark: { ok: false },
    }
    const { data, failed } = mergePracticeData(reply, SAVED)
    expect(failed).toBe(true)
    expect(data).toEqual([SAVED[0], null, SAVED[2], [], SAVED[4]])
  })

  it('nothing saved and nothing answered: no blank is cached, and the line says it couldn\'t connect', () => {
    const { failed } = mergePracticeData({ history: { ok: false }, plan: { ok: false }, drills: { ok: false }, insights: { ok: false }, benchmark: { ok: false } }, null)
    expect(shouldCachePracticeData(failed, false)).toBe(false)
    expect(practiceRefreshNotice(failed, false)).toMatch(/Couldn’t reach UpForge/)
  })

  it('a full answer has no notice and is cached', () => {
    const ok = <T>(value: T) => ({ ok: true as const, value })
    const { failed } = mergePracticeData({ history: ok(null), plan: ok(null), drills: ok([]), insights: ok([]), benchmark: ok(null) }, SAVED)
    expect(failed).toBe(false)
    expect(practiceRefreshNotice(failed, true)).toBeNull()
    expect(shouldCachePracticeData(failed, true)).toBe(true)
  })

  it('the remembered focus survives a failed focus request', async () => {
    const { usePracticeFocus } = await import('../components/v3/practice/usePracticeFocus')
    const focus = { id: 1, title: 'Dying first', progress: { status: 'active' }, checks: [] }
    writeCache('practice:focus', focus)
    const { focus: shown } = usePracticeFocus({ getFocus: async () => null })
    for (const hook of mounted.splice(0)) await hook()
    await new Promise(r => setTimeout(r, 0))
    expect(shown.value).toMatchObject({ title: 'Dying first' })
    expect(readCache<{ title: string }>('practice:focus')?.value).toMatchObject({ title: 'Dying first' })
  })

  it('history comes back with numbers, not the API\'s decimal strings ("72.50"), as trainer:get-history does', async () => {
    // GET /api/training/sessions as the live API (MySQL) sends it: DECIMAL columns arrive as strings.
    const row = { id: 7, scenario: 'flick', duration_seconds: 60, score: 60, accuracy_pct: '72.50', avg_reaction_ms: '340.00', consistency_score: '60.00',
      targets_hit: 38, targets_missed: 12, metadata: { difficulty: 'medium', scoring_version: 3 }, completed_at: '2026-11-18T11:00:00.000000Z' }
    const api = { total: 1, sessions: [row], by_scenario: { flick: { best_score: 64, avg_accuracy: '72.50', avg_reaction: '340.00', sessions: [row] } } }
    const reply = await collectPracticeData({
      history: async () => api as unknown as TrainingHistory,
      plan: async () => null,
      drills: async () => [],
      insights: async () => [],
      benchmark: async () => null,
    })
    expect(reply.history.ok).toBe(true)
    const history = (reply.history as { ok: true; value: TrainingHistory }).value
    expect(history.sessions[0]).toMatchObject({ accuracy_pct: 72.5, avg_reaction_ms: 340, consistency_score: 60, targets_hit: 38 })
    expect(history.sessions[0].accuracy_pct.toFixed(1)).toBe('72.5')
    expect(history.by_scenario.flick.sessions[0].avg_reaction_ms).toBe(340)
    expect(history.by_scenario.flick).toMatchObject({ best_score: 64, avg_accuracy: 72.5, avg_reaction: 340 })
    expect(history.sessions[0].completed_at).toBe('2026-11-18T11:00:00.000000Z')
  })

  it('Practice reads its data through the call that tells failed from empty', () => {
    const view = readFileSync(resolve(__dirname, '../views/TrainingHubView.vue'), 'utf8')
    expect(view).toMatch(/window\.api\.trainer\.getPracticeData\(game\)/)
    expect(view).toMatch(/shouldCachePracticeData\(fetched\.failed, fetched\.hadSaved\)/)
    expect(view).toMatch(/getHistory\(\)\.then\(h => \{ if \(h\) apiHistory\.value = withCurrentRulesBests\(h\) \}\)/)
  })
})
