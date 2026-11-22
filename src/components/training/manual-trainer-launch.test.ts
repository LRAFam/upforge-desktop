import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { compileScript, parse } from '@vue/compiler-sfc'
import ts from 'typescript'
import * as vue from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as options from '../../lib/manual-trainer-options'
import * as scenarios from '../../lib/trainer-scenarios'
import * as practice from '../v3/practice/practice-v3'
import * as focusDrills from '../v3/practice/focus-drills'
import * as focusHelpers from '../../lib/focus'
import * as metrics from '../../lib/training-result-metrics'
import { useManualTrainerLaunch } from '../../composables/useManualTrainerLaunch'
import { launchTrainer } from '../../lib/trainer-launch'
import { buildTrainingSessionPayload, drillConfigFromRequest, withLaunchGame } from '../../../electron/main/trainer-payload'

const Stub = { name: 'Stub' }
const scopes: vue.EffectScope[] = []
afterEach(() => { scopes.splice(0).forEach(scope => scope.stop()); vi.unstubAllGlobals() })

/** Compile the real SFC, then use its rendered controls and emitted events without an Electron window. */
function component(file: string, props: Record<string, unknown> = {}, emit: (...args: any[]) => void = () => {}, modules: Record<string, unknown> = {}) {
  const { descriptor } = parse(readFileSync(new URL(file, import.meta.url), 'utf8'))
  const compiled = compileScript(descriptor, { id: file, inlineTemplate: true })
  const exports: any = {}
  vm.runInNewContext(ts.transpileModule(compiled.content, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, {
    exports, window: globalThis.window,
    require: (id: string) => {
      if (id === 'vue') return { ...vue, onMounted: () => {}, onBeforeUnmount: () => {}, withDirectives: (node: vue.VNode) => node }
      const custom = Object.entries(modules).find(([suffix]) => id.endsWith(suffix))
      if (custom) return custom[1]
      if (id.endsWith('/manual-trainer-options')) return options
      if (id.endsWith('/trainer-scenarios')) return scenarios
      if (id.endsWith('/practice-v3')) return practice
      if (id.endsWith('/training-result-metrics')) return metrics
      if (id.endsWith('/training-icons')) return { scenarioIconUrl: () => '', TRAINING_ARTWORK: {} }
      if (id.endsWith('/usePrimaryGame')) return { usePrimaryGame: () => ({ primaryGame: vue.ref('valorant') }) }
      if (id.endsWith('/stale-cache')) return { readCache: () => null }
      if (id.endsWith('.vue')) return { default: Stub }
      if (id.endsWith('.css')) return {}
      throw new Error(`Unmocked import: ${id}`)
    },
  })
  const scope = vue.effectScope()
  scopes.push(scope)
  const state = vue.reactive(props)
  const render = scope.run(() => exports.default.setup(state, { expose() {}, emit }))
  return { props: state, render: () => render({}, []) }
}

function nodes(value: any): any[] {
  if (Array.isArray(value)) return value.flatMap(nodes)
  if (!value || typeof value !== 'object') return []
  const children = typeof value.children === 'object' && !Array.isArray(value.children)
    ? Object.entries(value.children ?? {}).filter(([, slot]) => typeof slot === 'function').flatMap(([, slot]) => nodes((slot as () => unknown)()))
    : nodes(value.children)
  return [value, ...children]
}
function text(value: any): string {
  if (Array.isArray(value)) return value.map(text).join('')
  if (typeof value === 'string') return value
  if (!value || value.type === vue.Comment) return ''
  if (typeof value.children?.default === 'function') return text(value.children.default())
  return text(value.children)
}

describe('manual run start and leaderboard contract', () => {
  it('the real start dialog launches Gridshot Hard 30 and the saved run matches the Hard 30 board query', async () => {
    const saved = new Map<string, string>()
    vi.stubGlobal('localStorage', { getItem: (k: string) => saved.get(k) ?? null, setItem: (k: string, v: string) => saved.set(k, v) })
    const nativeConfigs: ReturnType<typeof drillConfigFromRequest>[] = []
    const launch = vi.fn(async (request: Record<string, unknown>) => {
      nativeConfigs.push(drillConfigFromRequest(request, { trainerMouse: { game: 'valorant' } } as any))
      return { ok: true, launchId: 5 }
    })
    const getLeaderboard = vi.fn(async () => []), getHistory = vi.fn(async () => null)
    vi.stubGlobal('window', { api: { trainer: { launch, getLeaderboard, getHistory } } })
    const flow = useManualTrainerLaunch({
      game: () => 'valorant', busy: () => false, accountId: async () => 7,
      defaults: () => ({ difficulty: 'medium', duration_seconds: 60, user_drill_id: 99 }),
      launch: async request => { await launchTrainer(request) },
    })
    await flow.open('gridshot')
    let start: Promise<void> | undefined
    const dialog = component('./TrainingManualLaunchDialog.vue', { request: flow.request.value, busy: false }, (event, value) => {
      if (event === 'start') start = flow.start(value)
    })
    const controls = nodes(dialog.render()).filter(node => node.type === 'select')
    expect(nodes(controls[0]).filter(node => node.type === 'option').map(node => node.props.value)).toEqual(options.TRAINER_BOARD_DIFFICULTIES)
    expect(nodes(controls[1]).filter(node => node.type === 'option').map(node => node.props.value)).toEqual(options.TRAINER_BOARD_DURATIONS)
    controls[0].props['onUpdate:modelValue']('hard')
    controls[1].props['onUpdate:modelValue'](30)
    const button = nodes(dialog.render()).find(node => node.props?.variant === 'primary')
    expect(text(button)).toContain('Start Hard · 30s')
    button.props.onClick()
    await start
    expect(launch).toHaveBeenCalledWith({ scenario: 'gridshot', difficulty: 'hard', duration_seconds: 30 })
    const config = nativeConfigs[0]
    expect(config).toMatchObject({ scenario: 'gridshot', difficulty: 'hard', duration_seconds: 30 })
    expect(config).not.toHaveProperty('user_drill_id')

    // The trainer reports the completed run's actual difficulty/duration/scoring version.
    // Exercise the existing main-process payload builder and comparison classifier unchanged.
    const payload = buildTrainingSessionPayload(withLaunchGame({
      scenario: 'gridshot', duration_seconds: config.duration_seconds, score: 70,
      accuracy_pct: 75, avg_reaction_ms: 200, consistency_score: 80, targets_hit: 30, targets_missed: 10,
      heatmap: [],
      completed_at: '2026-11-20T16:00:00Z',
      metadata: { difficulty: config.difficulty, scoring_version: metrics.currentScoringVersion('gridshot'), user_drill_id: 99 },
    }, config), config)
    expect(payload.metadata).not.toHaveProperty('user_drill_id')
    const comparison = metrics.trainingComparisonRequest(payload as unknown as metrics.ComparableTrainingRun)
    expect(comparison).toMatchObject({ scenario: 'gridshot', difficulty: 'hard', duration_seconds: 30, scoring_version: metrics.currentScoringVersion('gridshot'), comparison_model: 'game=valorant' })

    const board = component('./TrainingLeaderboardsTab.vue', {}, () => {}, {
      '/ui-v3': { uiV3: vue.ref(true) }, '/player-identity': { playerIdentity: () => ({}) },
      '/leaderboard-visibility': { leaderboardDisplayName: () => '', visibilityLine: () => '', youNote: () => '' },
      '/practice-session-v3': { isBest: () => false, leaderboardYouRow: () => null },
    })
    const selects = nodes(board.render()).filter(node => node.type === 'select')
    selects[0].props['onUpdate:modelValue']('gridshot')
    selects[1].props['onUpdate:modelValue']('hard')
    selects[2].props['onUpdate:modelValue'](30)
    await vue.nextTick()
    // The board is asked for on the same scoring rules as the run it is compared with.
    expect(getLeaderboard).toHaveBeenLastCalledWith(comparison!.scenario, 'week', comparison!.difficulty, comparison!.duration_seconds, comparison!.scoring_version)
    expect(nodes(selects[2]).filter(node => node.type === 'option').map(node => node.props.value)).toEqual(options.TRAINER_BOARD_DURATIONS)
    await flow.open('gridshot')
    expect(flow.request.value?.options).toEqual({ difficulty: 'hard', duration_seconds: 30 })
  })

  it('Drills tab tiles ask for settings; the hero, Today’s tiles, match drills and the challenge keep theirs', () => {
    const emitted: unknown[][] = []
    const Hero = { name: 'PracticeHeroV3' }, Tile = { name: 'PracticeDrillTileV3' }
    const drills = [{ scenario: 'head_height', label: 'Head Height', description: '', difficulty: 'medium', durationSeconds: 60, personalBest: null, oldBest: null, globalRank: null, completed: false }]
    const props = {
      activeTab: 'train', stats: { streak: 0, thisWeekCount: 0, improvement: null, totalSessions: 0, comparisonLabel: '' },
      sessionSteps: [], sessionFocusReason: null, sessionDisabled: false, matchDrills: [] as practice.MatchDrillRow[], scoringNote: null,
      showCalibration: false, categories: [], activeCategory: 'all', drills, runningScenario: null, busy: false,
      daily: { scenarioLabel: 'Flick', target: 50, completed: false }, freePlayOptions: [], freePlayScenario: 'flick', insights: [], scenarioLabel: (s: string) => s,
    }
    const route = vue.reactive({ query: { drill: 'Practise head height', scenario: 'head_height' } as Record<string, string> })
    const view = component('../../views/v3/PracticeV3.vue', props, (...args) => emitted.push(args), {
      'vue-router': { RouterLink: Stub, useRoute: () => route, useRouter: () => ({}) },
      '/PracticeHeroV3.vue': { default: Hero }, '/PracticeDrillTileV3.vue': { default: Tile },
      '/drill-frames': { drillFrame: () => null, frameLayout: () => ({ width: 100, left: 0, top: 0 }) },
      '/focus-drills': focusDrills, '/lib/focus': focusHelpers,
      '/lib/focuses': { hasFocusLoop: () => true }, '/usePracticeFocus': { usePracticeFocus: () => ({ focus: vue.ref(null), ready: vue.ref(true) }) },
      '/drill-rulebook': { useDrillRulebook: () => vue.ref({}) },
    })
    const tile = (label: string) => nodes(view.render()).find(node => node.type === Tile && node.props.drill.label === label)
    const startButton = () => nodes(view.render()).find(node => node.props?.variant === 'primary' && text(node) === 'Start Head Height')

    // Drills tab (the library, and what replaced Quick play): the player picks difficulty and length.
    view.props.activeTab = 'drills'
    tile('Head Height').props.onPlay('head_height')
    expect(emitted.at(-1)).toEqual(['play-manual-drill', 'head_height'])

    // Today keeps the settings of today's plan: the report drill, a single drill, the daily challenge.
    view.props.activeTab = 'train'
    startButton().props.onClick()
    expect(emitted.at(-1)).toEqual(['play-drill', 'head_height'])
    tile('Head Height').props.onPlay('head_height')
    expect(emitted.at(-1)).toEqual(['play-drill', 'head_height'])
    tile('Daily challenge').props.onPlay('')
    expect(emitted.at(-1)).toEqual(['play-daily'])
    route.query = {}
    view.props.matchDrills = [{ id: 7, title: 'Assigned practice', meta: '', trainerScenario: 'head_height', steps: null, goal: null, fromMatches: true, why: null, stat: null, beta: false }]
    startButton().props.onClick()
    expect(emitted.at(-1)).toEqual(['play-match-drill', 7])
  })
})
