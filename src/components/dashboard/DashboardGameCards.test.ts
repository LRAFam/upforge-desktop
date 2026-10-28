import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { compileScript, parse } from '@vue/compiler-sfc'
import ts from 'typescript'
import * as vue from 'vue'
import { describe, expect, it, vi } from 'vitest'

interface RiotProfile {
  riot_name?: string | null
  riot_tag?: string | null
  lol_riot_name?: string | null
  lol_riot_tag?: string | null
}

function dashboard(user: RiotProfile) {
  const primaryGame = vue.ref('lol')
  const profile = vue.ref({ user })
  const { descriptor } = parse(readFileSync(new URL('./DashboardGameCards.vue', import.meta.url), 'utf8'))
  const script = compileScript(descriptor, { id: 'game-card-test' })
  const code = ts.transpileModule(script.content, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
  const exports: any = {}
  vm.runInNewContext(code, {
    exports,
    require: (id: string) => {
      if (id === 'vue') return vue
      if (id === 'vue-router') return { useRouter: () => ({ push: vi.fn() }) }
      if (id.endsWith('/usePrimaryGame')) return { usePrimaryGame: () => ({ primaryGame }) }
      if (id.endsWith('/useDashboard')) return { useDashboard: () => ({
        profile, profileLoading: vue.ref(false), lolRecentMatches: vue.ref([]),
        dashboardAnalyses: vue.ref([]),
      }) }
      if (id.endsWith('/games')) return { PRIMARY_GAME_ARTWORK: {} }
      if (id.endsWith('/game-branding')) return { gameBrand: () => ({}) }
      if (['/valorant', '/cs2', '/deadlock', '/game-modules', '/account-link-navigation', '/recording-demo-status', '.webp'].some(suffix => id.endsWith(suffix))) return {}
      throw new Error(`Unexpected component import: ${id}`)
    },
  })
  const setup = exports.default.setup({}, { expose() {} })
  return { primaryGame, profile, card: setup.card as vue.ComputedRef<{ linked: boolean; account: string | null }> }
}

describe('League dashboard account', () => {
  it('shows each game\'s own linked Riot ID when switching tabs', () => {
    const view = dashboard({
      riot_name: 'ValorantSmurf', riot_tag: 'EUW',
      lol_riot_name: ' LeagueMain ', lol_riot_tag: ' EUW1 ',
    })
    expect(view.card.value.linked).toBe(true)
    expect(view.card.value.account).toBe('LeagueMain#EUW1')
    view.primaryGame.value = 'valorant'
    expect(view.card.value.account).toBe('ValorantSmurf#EUW')
  })

  it('does not show League as linked just because Valorant is linked', () => {
    const view = dashboard({ riot_name: 'ValorantSmurf', riot_tag: 'EUW' })
    expect(view.card.value.linked).toBe(false)
    expect(view.card.value.account).toBeNull()
  })

  it('recognises a League-only link and updates when it is removed', () => {
    const view = dashboard({ lol_riot_name: 'LeagueMain', lol_riot_tag: 'EUW1' })
    expect(view.card.value.linked).toBe(true)
    expect(view.card.value.account).toBe('LeagueMain#EUW1')
    view.profile.value = { user: {} }
    expect(view.card.value.linked).toBe(false)
  })

  it('does not invent a tag when the League account is incomplete', () => {
    const view = dashboard({ lol_riot_name: 'LeagueMain', lol_riot_tag: ' ' })
    expect(view.card.value.linked).toBe(false)
    expect(view.card.value.account).toBeNull()
  })
})
