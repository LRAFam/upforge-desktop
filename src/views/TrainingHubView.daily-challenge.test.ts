import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import { computed, ref } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as challenge from '../lib/daily-challenge'
import { RADAR_SCENARIO_KEYS } from '../lib/trainer-scenarios'
import { usePracticeSessionStore } from '../stores/practiceSession'

const source = readFileSync(new URL('./TrainingHubView.vue', import.meta.url), 'utf8')
const section = source.slice(source.indexOf('// ── Daily challenge'), source.indexOf('// ── Guided session'))
const code = ts.transpileModule(`${section}\nglobalThis.challengeState = dailyChallenge; globalThis.launchChallenge = launchDailyChallenge`, {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText

function setup(runs: object[] = [], recent: object[] = []) {
  const context = {
    ...challenge, Date, computed, ref, RADAR_SCENARIOS: RADAR_SCENARIO_KEYS,
    apiHistory: ref({ sessions: runs }), sessionHistory: ref(recent),
    practiceSession: { recentRuns: recent },
    launchDrill: vi.fn(), launchChallenge: () => {},
    challengeState: null as unknown as { value: { completed: boolean } },
  }
  vm.runInNewContext(code, context)
  return { get value() { return context.challengeState.value }, launch: context.launchChallenge, launched: context.launchDrill }
}

afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs() })

describe('Practice daily challenge uses the actual run settings and local day', () => {
  it.each([{ metadata: { difficulty: 'easy' } }, { duration_seconds: 30 }])('does not complete for different settings: %j', override => {
    vi.useFakeTimers().setSystemTime(new Date(2026, 10, 22, 12))
    const c = challenge.dailyChallengeFor(new Date(), RADAR_SCENARIO_KEYS)
    const run = { ...c, score: 100, metadata: { difficulty: 'medium' }, completed_at: new Date().toISOString(), ...override }
    expect(setup([run]).value.completed).toBe(false)
    expect(setup([], [run]).value.completed).toBe(false)
  })

  it('keeps a local-day completion after midnight UTC', () => {
    vi.stubEnv('TZ', 'Pacific/Auckland')
    vi.useFakeTimers().setSystemTime(new Date(2026, 10, 22, 15))
    const c = challenge.dailyChallengeFor(new Date(), RADAR_SCENARIO_KEYS)
    const run = { ...c, score: 100, metadata: { difficulty: 'medium' }, completed_at: new Date(2026, 10, 22, 9).toISOString() }
    expect(setup([run]).value.completed).toBe(true)
    expect(setup([], [{ ...run, completed_at: new Date(2026, 10, 21, 23).toISOString() }]).value.completed).toBe(false)
  })

  it('remembers the qualifying offline run when Practice is reopened', () => {
    vi.useFakeTimers().setSystemTime(new Date(2026, 10, 22, 12))
    setActivePinia(createPinia())
    const c = challenge.dailyChallengeFor(new Date(), RADAR_SCENARIO_KEYS)
    const run = { ...c, score: c.target, metadata: { difficulty: 'medium' }, completed_at: new Date().toISOString() }
    usePracticeSessionStore().recordRun(run)
    expect(setup([], usePracticeSessionStore().recentRuns).value.completed).toBe(true)
  })

  it('starts today’s challenge with the same settings it checks, including after local midnight', () => {
    vi.useFakeTimers().setSystemTime(new Date(2026, 10, 22, 23, 59))
    const state = setup()
    vi.setSystemTime(new Date(2026, 10, 23, 0, 1))
    state.launch()
    const c = challenge.dailyChallengeFor(new Date(), RADAR_SCENARIO_KEYS)
    expect(state.launched).toHaveBeenCalledWith({
      scenario: c.scenario, ...challenge.DAILY_CHALLENGE_SETTINGS,
      weakness: 'challenge', weakness_score: 0, reason: `Daily challenge: score ${c.target}+`,
    })
    expect(source.match(/(?:@play-daily|@click)="launchDailyChallenge"/g)).toHaveLength(2)
  })
})
