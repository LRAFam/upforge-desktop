import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { scenariosPlayedToday, usePracticeSessionStore } from './practiceSession'

const view = () => readFileSync(resolve(__dirname, '../views/TrainingHubView.vue'), 'utf8')

describe('Practice remembers what you did after leaving the screen', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('"Played today" comes from today\'s runs, not from state inside the view', () => {
    const now = new Date(2026, 10, 18, 20, 0)
    const played = scenariosPlayedToday([
      { scenario: 'flick', completed_at: new Date(2026, 10, 18, 9, 30).toISOString() },
      { scenario: 'tracking', completed_at: new Date(2026, 10, 17, 23, 59).toISOString() },
      { scenario: 'gridshot', completed_at: 'not a date' },
    ], now)
    expect([...played]).toEqual(['flick'])
  })

  it('a run recorded before leaving still counts as played today on return', () => {
    const store = usePracticeSessionStore()
    store.recordRun({ scenario: 'microflick', completed_at: new Date().toISOString() })
    // The view is rebuilt on return; the store (and so the run) is the same one.
    expect(scenariosPlayedToday(usePracticeSessionStore().recentRuns).has('microflick')).toBe(true)
  })

  it('a guided session waiting between steps survives leaving Practice', () => {
    const store = usePracticeSessionStore()
    store.guided = { active: true, stepIndex: 1, plan: [], results: [] }
    expect(usePracticeSessionStore().guided).toMatchObject({ active: true, stepIndex: 1 })
  })

  it('the Practice view keeps that state in the store and offers to resume', () => {
    const src = view()
    expect(src).not.toMatch(/const structuredSession = ref</)
    expect(src).not.toMatch(/completedDrills/)
    expect(src).toMatch(/storeToRefs\(practiceSession\)/)
    expect(src).toMatch(/completed: playedToday\.value\.has\(scenario\)/)
    expect(src).toMatch(/'Resume session' }} · step/)
  })

  it('single drills are blocked while a guided session is active', () => {
    const src = view()
    expect(src).toMatch(/:busy="launching \|\| drillRunning \|\| structuredSessionActive"/)
    expect(src).toMatch(/if \(structuredSessionActive\.value && !opts\.guidedStep\)/)
    expect(src).toMatch(/\}, \{ guidedStep: true(?:, nextScenario: [^}]+)? \}\)/)
  })
})
