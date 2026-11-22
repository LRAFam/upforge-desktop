import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { compileScript, parse } from '@vue/compiler-sfc'
import ts from 'typescript'
import * as vue from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as moments from '../../lib/drill-moments'

const { descriptor } = parse(readFileSync(new URL('./TrainingDrillMoments.vue', import.meta.url), 'utf8'))
const code = ts.transpileModule(compileScript(descriptor, { id: 'drill-moments-test' }).content, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText

function setup(reply: () => Promise<unknown>) {
  const getDrillMoments = vi.fn(reply)
  const openAnalysisInApp = vi.fn(async () => 'reviews')
  const listeners: Record<string, () => void> = {}
  const mounts: (() => void)[] = []
  const life = { ended: false, own: vi.fn() }
  const router = { push: vi.fn() }
  const exports: any = {}
  vm.runInNewContext(code, {
    exports, window: { api: { trainer: { getDrillMoments }, on: (name: string, fn: () => void) => { listeners[name] = fn; return () => {} } } },
    require: (id: string) => {
      if (id === 'vue') return { ...vue, onMounted: (fn: () => void) => mounts.push(fn) }
      if (id === 'vue-router') return { useRouter: () => router, RouterLink: {} }
      if (id.endsWith('/useLifetime')) return { useLifetime: () => life }
      if (id.endsWith('/drill-moments')) return moments
      if (id.endsWith('/open-analysis-in-app')) return { openAnalysisInApp }
      throw new Error(id)
    },
  })
  const props = vue.reactive({ drillId: 7 })
  const scope = vue.effectScope()
  const state = scope.run(() => exports.default.setup(props, { expose() {} }))
  mounts.forEach(fn => fn())
  return { state, props, getDrillMoments, openAnalysisInApp, listeners, stop: () => scope.stop(), router }
}

const stops: (() => void)[] = []
afterEach(() => stops.splice(0).forEach(stop => stop()))

describe('See it in your matches', () => {
  it('opens a video drill’s source review in the app after one click', async () => {
    const s = setup(async () => ({ drill_id: 7, review: { analysis_id: 42 }, matches: [] })); stops.push(s.stop)
    await s.state.load()
    expect(s.getDrillMoments).toHaveBeenCalledExactlyOnceWith(7)
    expect(s.openAnalysisInApp).toHaveBeenCalledExactlyOnceWith(s.router, 42, { source: 'desktop_drill_moments' })
    expect(s.state.opened.value).toBe(false)
  })

  it('lists a match-stat drill’s actual matches, then reuses them when reopened', async () => {
    const s = setup(async () => ({ drill_id: 7, review: null, matches: [{ match_id: 'own-match', game: 'valorant', map: 'Ascent', value_pct: 15 }] })); stops.push(s.stop)
    await s.state.load()
    expect(s.state.moments.value.matches[0]).toMatchObject({ to: '/report/own-match', label: 'Ascent', value: '15%' })
    expect(s.openAnalysisInApp).not.toHaveBeenCalled()
    s.state.toggle(); s.state.toggle()
    expect(s.state.opened.value).toBe(true)
    expect(s.getDrillMoments).toHaveBeenCalledTimes(1)
  })

  it('shows a retry after unavailable data, with a separate valid empty state', async () => {
    const s = setup(async () => null); stops.push(s.stop)
    await s.state.load()
    expect(s.state.failed.value).toBe(true)
    s.getDrillMoments.mockResolvedValue({ drill_id: 7, review: null, matches: [] })
    await s.state.load()
    expect(s.state.failed.value).toBe(false)
    expect(s.state.moments.value.matches).toEqual([])
  })

  it.each(['session:user-changed', 'auth:session-expired'])('clears displayed data and ignores an in-flight response after %s', async event => {
    let resolve!: (value: unknown) => void
    const s = setup(() => new Promise(r => { resolve = r })); stops.push(s.stop)
    const pending = s.state.load()
    s.listeners[event]()
    resolve({ drill_id: 7, review: { analysis_id: 42 }, matches: [] })
    await pending
    expect(s.state.moments.value).toBeNull()
    expect(s.openAnalysisInApp).not.toHaveBeenCalled()
    expect(s.state.opened.value).toBe(false)
  })

  it('does not navigate after a pending source lookup is closed', async () => {
    let resolve!: (value: unknown) => void
    const s = setup(() => new Promise(r => { resolve = r })); stops.push(s.stop)
    const pending = s.state.load()
    s.state.toggle()
    resolve({ drill_id: 7, review: { analysis_id: 42 }, matches: [] })
    await pending
    expect(s.openAnalysisInApp).not.toHaveBeenCalled()
  })
})
