import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { compileScript, parse } from '@vue/compiler-sfc'
import ts from 'typescript'
import * as vue from 'vue'
import { describe, expect, it } from 'vitest'
import * as practice from '../../components/v3/practice/practice-v3'
import * as focusDrills from '../../components/v3/practice/focus-drills'
import * as focusHelpers from '../../lib/focus'
import { parseDrillRulebook } from '../../lib/drill-rulebook'

// The "Do this next" hero must not depend on the drill category. The hub gives Practice the game's
// whole drill list, and Practice builds its hero, today's drills and the Drills groups from it.
const Stub = { name: 'Stub' }
const Hero = { name: 'PracticeHeroV3' }
const Tile = { name: 'PracticeDrillTileV3' }
const categories = ['all', 'aim', 'reaction', 'precision', 'duel'] as const
const catalogue = [
  { scenario: 'head_height', label: 'Head Height' },
  { scenario: 'flick', label: 'Flick' },
  { scenario: 'hold_angle', label: 'Hold Angle' },
  { scenario: 'microflick', label: 'Micro Flick' },
].map(d => ({ ...d, description: '', difficulty: 'medium', durationSeconds: 60, personalBest: null, oldBest: null, globalRank: null, completed: false }))

const focus: focusHelpers.Focus = {
  id: 1, metric: 'headshot_hit_rate', label: 'Raise your head-hit rate', better: 'higher', baseline: 0.2, target: 0.3,
  checks: [], progress: { games_played: 0, hits: 0, games_required: 3, hits_required: 2, status: 'active' },
  started_at: null, completed_at: null,
}
const rulebook = parseDrillRulebook({
  headshot_hit_rate: { title: 'Practise head height', scenarios: [{ key: 'head_height', label: 'Head Height' }] },
})

const { descriptor } = parse(readFileSync(new URL('./PracticeV3.vue', import.meta.url), 'utf8'))
const compiled = compileScript(descriptor, { id: 'practice-category-test', inlineTemplate: true })
const code = ts.transpileModule(compiled.content, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText

// Run the real compiled component and its click handlers without Electron or a DOM.
function setup(options: { focus?: focusHelpers.Focus | null; query?: Record<string, string>; matchDrills?: practice.MatchDrillRow[] } = {}) {
  const exports: any = {}
  vm.runInNewContext(code, {
    exports,
    require: (id: string) => {
      if (id === 'vue') return { ...vue, onMounted: () => {}, onBeforeUnmount: () => {} }
      if (id === 'vue-router') return { RouterLink: Stub, useRoute: () => ({ query: options.query ?? {} }), useRouter: () => ({}) }
      if (id.endsWith('/PracticeHeroV3.vue')) return { default: Hero }
      if (id.endsWith('/PracticeDrillTileV3.vue')) return { default: Tile }
      if (id.endsWith('.vue')) return { default: Stub }
      if (id.endsWith('.css')) return {}
      if (id.endsWith('/practice-v3')) return practice
      if (id.endsWith('/focus-drills')) return focusDrills
      if (id.endsWith('/drill-frames')) return { drillFrame: () => null, frameLayout: () => ({ width: 100, left: 0, top: 0 }) }
      if (id.endsWith('/lib/focus')) return focusHelpers
      if (id.endsWith('/lib/focuses')) return { hasFocusLoop: () => true }
      if (id.endsWith('/usePracticeFocus')) return { usePracticeFocus: () => ({ focus: vue.ref(options.focus ?? null), ready: vue.ref(true) }) }
      if (id.endsWith('/usePrimaryGame')) return { usePrimaryGame: () => ({ primaryGame: vue.ref('valorant') }) }
      if (id.endsWith('/drill-rulebook')) return { useDrillRulebook: () => vue.ref(rulebook) }
      throw new Error(`Unexpected import: ${id}`)
    },
  })
  const props = vue.reactive({
    activeTab: 'train' as practice.PracticeTab, stats: { streak: 0, thisWeekCount: 0, improvement: null, totalSessions: 0, comparisonLabel: '' },
    sessionSteps: [], sessionFocusReason: null, sessionDisabled: false, matchDrills: options.matchDrills ?? [],
    scoringNote: null, showCalibration: false, categories: categories.map(id => ({ id, label: id })),
    activeCategory: 'all' as typeof categories[number], drills: catalogue,
    runningScenario: null, busy: false, daily: { scenarioLabel: 'Flick', target: 50, completed: false },
    freePlayOptions: [], freePlayScenario: 'flick', insights: [], scenarioLabel: (s: string) => s,
  })
  const emitted: unknown[][] = []
  const scope = vue.effectScope()
  const render = scope.run(() => exports.default.setup(props, { expose() {}, emit: (...args: unknown[]) => emitted.push(args) }))
  return {
    select(category: typeof categories[number], tab: practice.PracticeTab = 'train') {
      props.activeCategory = category
      props.activeTab = tab
      return render({}, [])
    },
    emitted,
    stop: () => scope.stop(),
  }
}

function children(node: any): any[] {
  if (Array.isArray(node)) return node
  const child = node?.children
  if (child && !Array.isArray(child) && typeof child.default === 'function') return [child.default()]
  return child == null ? [] : [child]
}
function text(node: any): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (node?.type === vue.Comment) return ''
  return children(node).map(text).join(' ').replace(/\s+/g, ' ').trim()
}
function findAll(node: any, predicate: (n: any) => boolean, out: any[] = []): any[] {
  if (node && !Array.isArray(node) && typeof node === 'object' && predicate(node)) out.push(node)
  for (const child of children(node)) findAll(child, predicate, out)
  return out
}
const hero = (tree: any) => findAll(tree, n => n.type === Hero)[0]
const start = (tree: any) => findAll(hero(tree), n => n.props?.variant === 'primary' && n.props?.icon === 'play')[0]
const tiles = (tree: any) => findAll(tree, n => n.type === Tile).map(n => n.props.drill.scenario)

describe('Practice hero is the same under every drill category', () => {
  it('keeps the focus session, its drill and its Start action', () => {
    const view = setup({ focus })
    try {
      const expected = text(hero(view.select('all')))
      expect(expected).toContain('Today’s session · from your focus')
      for (const category of categories) {
        const tree = view.select(category)
        expect(text(hero(tree)), category).toBe(expected)
        expect(hero(tree).props.scenario, category).toBe('head_height')
        expect(text(start(tree)), category).toBe('Start with Head Height')
        start(tree).props.onClick()
        expect(view.emitted.at(-1)).toEqual(['play-drill', 'head_height'])
      }
    } finally { view.stop() }
  })

  it('keeps the drill picked from the match report', () => {
    const view = setup({ query: { drill: 'Hold head height before clearing', scenario: 'head_height', why: 'Review this next match' } })
    try {
      const expected = text(hero(view.select('all')))
      expect(expected).toContain('Do this next · from your last match')
      for (const category of categories) {
        const tree = view.select(category)
        expect(text(hero(tree)), category).toBe(expected)
        expect(text(start(tree)), category).toBe('Start Head Height')
        start(tree).props.onClick()
        expect(view.emitted.at(-1)).toEqual(['play-drill', 'head_height'])
      }
    } finally { view.stop() }
  })

  it('keeps the drill name of a match drill and starts that match drill', () => {
    const view = setup({ matchDrills: [{ id: 7, title: 'Practice from this match', meta: '', trainerScenario: 'head_height', steps: null, goal: null, fromMatches: true, why: null, stat: null, beta: false }] })
    try {
      for (const category of categories) {
        const tree = view.select(category)
        expect(text(start(tree)), category).toBe('Start Head Height')
        start(tree).props.onClick()
        expect(view.emitted.at(-1)).toEqual(['play-match-drill', 7])
      }
    } finally { view.stop() }
  })

  it('lists every drill on the Drills tab', () => {
    const view = setup({ focus })
    try {
      for (const category of categories) {
        expect(tiles(view.select(category, 'drills')).sort(), category).toEqual(catalogue.map(d => d.scenario).sort())
      }
    } finally { view.stop() }
  })
})

describe('the hub gives Practice the whole drill list for the game', () => {
  const hub = readFileSync(new URL('../TrainingHubView.vue', import.meta.url), 'utf8')
  const between = (from: string, to: string) => {
    const start = hub.indexOf(from)
    expect(start, from).toBeGreaterThan(-1)
    return hub.slice(start, hub.indexOf(to, start))
  }

  it('passes the unfiltered list, and keeps the category filter to the classic library', () => {
    expect(between('<PracticeV3', '/>')).toMatch(/:drills="practiceDrills"/)
    const all = between('const availableScenarioCards', 'const scenarioCards')
    expect(all).toMatch(/\.filter\(def => isScenarioForGame\(def\.key, primaryGame\.value\)\)/)
    expect(all).not.toMatch(/matchesScenarioCategory|activeDrillCategory/)
    const drills = between('const practiceDrills', 'function launchScenarioCard')
    expect(drills).toMatch(/availableScenarioCards\.value\.map\(/)
    expect(drills).not.toMatch(/matchesScenarioCategory|activeDrillCategory/)
  })
})
