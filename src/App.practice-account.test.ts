import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import { ref } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { usePracticeSessionStore } from './stores/practiceSession'
import { dailyChallengeDone, dailyChallengeFor } from './lib/daily-challenge'

const source = readFileSync(new URL('./App.vue', import.meta.url), 'utf8')
const ast = ts.createSourceFile('App.ts', source.slice(source.indexOf('<script setup lang="ts">') + 24, source.indexOf('</script>')), ts.ScriptTarget.Latest, true)
const apply = ast.statements.find(s => ts.isFunctionDeclaration(s) && s.name?.text === 'applySessionUser')!
const code = ts.transpileModule(`${apply.getText(ast)}\nglobalThis.applyUser = applySessionUser`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText

function setup() {
  const practiceSession = usePracticeSessionStore()
  const context = {
    practiceSession, sessionUserKey: ref('guest'), setCacheScope: vi.fn(), setAchievementsAccount: vi.fn(),
    riotId: ref(null), userName: ref(null), cs2SteamName: ref(null), lolRiotId: ref(null), userAvatarUrl: ref(''),
    userValorantStats: ref(null), isAdmin: ref(false), clipCount: ref(0), clipCountAvailable: ref(false), hasClipIndicator: ref(false), status: ref({}),
    consumeDeepLink: vi.fn(), loadClipSummary: vi.fn(), loadUserProfile: vi.fn(), loadGameIdentity: vi.fn(),
    window: { api: { app: { getStatus: async () => ({}) } } },
    applyUser: async (_id: number | null) => {},
  }
  vm.runInNewContext(code, context)
  return { store: practiceSession, applyUser: context.applyUser }
}

describe('Practice state follows the signed-in account', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it.each([2, null])('drops another account’s daily completion and guided session on switch to %s', async next => {
    const { store, applyUser } = setup()
    await applyUser(1)
    const challenge = dailyChallengeFor(new Date(), ['flick'])
    store.recordRun({ ...challenge, score: 100, metadata: { difficulty: 'medium' }, completed_at: new Date().toISOString() })
    store.guided = { active: true, stepIndex: 1, plan: [], results: [] }
    expect(dailyChallengeDone(challenge, store.recentRuns)).toBe(true)
    await applyUser(next)
    expect(dailyChallengeDone(challenge, store.recentRuns)).toBe(false)
    expect(store.guided).toBeNull()
  })

  it('keeps a run and guided session on a redundant same-account event', async () => {
    const { store, applyUser } = setup()
    await applyUser(1)
    store.recordRun({ scenario: 'flick', score: 80, completed_at: new Date().toISOString() })
    store.guided = { active: true, stepIndex: 1, plan: [], results: [] }
    await applyUser(1)
    expect(store.recentRuns).toHaveLength(1)
    expect(store.guided?.stepIndex).toBe(1)
  })
})
