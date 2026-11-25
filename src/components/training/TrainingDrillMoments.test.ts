import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { compileScript, parse } from '@vue/compiler-sfc'
import ts from 'typescript'
import * as vue from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as moments from '../../lib/drill-moments'
import { openAnalysisInApp as actualOpenAnalysisInApp } from '../../lib/open-analysis-in-app'
import { pendingTimeline } from '../../stores/pendingTimeline'

const { descriptor } = parse(readFileSync(new URL('./TrainingDrillMoments.vue', import.meta.url), 'utf8'))
const code = ts.transpileModule(compileScript(descriptor, { id: 'drill-moments-test' }).content, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText

function setup(reply: () => Promise<unknown>, timelineReply?: () => Promise<unknown>) {
  const getDrillMoments = vi.fn(reply)
  const getTimeline = vi.fn(timelineReply)
  const openAnalysisInApp = vi.fn<typeof actualOpenAnalysisInApp>(timelineReply ? actualOpenAnalysisInApp : async () => 'reviews')
  const listeners: Record<string, () => void> = {}
  const mounts: (() => void)[] = []
  const life = { ended: false, own: vi.fn() }
  const router = { push: vi.fn(async () => undefined) }
  const browserWindow = { api: { trainer: { getDrillMoments }, analyses: { getTimeline }, on: (name: string, fn: () => void) => { listeners[name] = fn; return () => {} } } }
  if (timelineReply) vi.stubGlobal('window', browserWindow)
  const exports: any = {}
  vm.runInNewContext(code, {
    exports, window: browserWindow,
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
  return { state, props, getDrillMoments, getTimeline, openAnalysisInApp, listeners, life, stop: () => scope.stop(), router }
}

const stops: (() => void)[] = []
afterEach(() => {
  stops.splice(0).forEach(stop => stop())
  pendingTimeline.value = null
  vi.unstubAllGlobals()
})

describe('See it in your matches', () => {
  it('lists saved moments and navigates with only owned drill/index coordinates after rechecking', async () => {
    const reply = { drill_id: 7, review: { analysis_id: 42 }, matches: [], source_moments: [
      { coordinate: 'recording', timestamp_seconds: 12.5, source_identity: 'a'.repeat(64) },
    ] }
    const s = setup(async () => reply, async () => ({ game: 'valorant', analysisId: 42 })); stops.push(s.stop)
    await s.state.load()
    expect(s.router.push).not.toHaveBeenCalled()
    expect(s.state.moments.value.sourceMoments).toHaveLength(1)
    await s.state.openMoment(0)
    expect(s.getDrillMoments).toHaveBeenCalledTimes(2)
    expect(s.router.push).toHaveBeenCalledExactlyOnceWith({ path: '/vod-review', query: { timelineId: '42', drillId: '7', drillMoment: '0' } })
  })

  it('does not open a previously listed moment if its recording evidence has changed', async () => {
    const s = setup(async () => ({ drill_id: 7, review: { analysis_id: 42 }, matches: [], source_moments: [
      { coordinate: 'recording', timestamp_seconds: 12.5, source_identity: 'a'.repeat(64) },
    ] })); stops.push(s.stop)
    await s.state.load()
    s.getDrillMoments.mockResolvedValue({ drill_id: 7, review: { analysis_id: 42 }, matches: [], source_moments: [] })
    await s.state.openMoment(0)
    expect(s.openAnalysisInApp).not.toHaveBeenCalled()
    expect(s.state.failed.value).toBe(true)
  })

  it('opens a video drill’s source review in the app after one click', async () => {
    const s = setup(async () => ({ drill_id: 7, review: { analysis_id: 42 }, matches: [] })); stops.push(s.stop)
    await s.state.load()
    expect(s.getDrillMoments).toHaveBeenCalledExactlyOnceWith(7)
    expect(s.openAnalysisInApp).toHaveBeenCalledExactlyOnceWith(s.router, 42, { source: 'desktop_drill_moments', isCurrent: expect.any(Function) })
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

  it.each(['session:user-changed', 'auth:session-expired', 'close', 'unmount', 'drill-change'])('cancels the actual review navigation when %s happens during timeline loading', async action => {
    let resolve!: (value: unknown) => void
    const timeline = new Promise(r => { resolve = r })
    const s = setup(async () => ({ drill_id: 7, review: { analysis_id: 42 }, matches: [] }), () => timeline); stops.push(s.stop)
    const pending = s.state.load()
    await vi.waitFor(() => expect(s.getTimeline).toHaveBeenCalledWith(42))
    if (action === 'close') s.state.toggle()
    else if (action === 'unmount') s.life.ended = true
    else if (action === 'drill-change') { s.props.drillId = 8; await vue.nextTick() }
    else s.listeners[action]()
    resolve({ game: 'valorant' })
    await pending
    expect(s.router.push).not.toHaveBeenCalled()
    expect(pendingTimeline.value).toBeNull()
  })

  it.each([true, false])('allows the actual navigation while the request is current (timeline available: %s)', async hasTimeline => {
    const data = hasTimeline ? { game: 'valorant' } : null
    const s = setup(async () => ({ drill_id: 7, review: { analysis_id: 42 }, matches: [] }), async () => data); stops.push(s.stop)
    await s.state.load()
    expect(s.router.push).toHaveBeenCalledExactlyOnceWith(hasTimeline
      ? { path: '/vod-review', query: { timelineId: '42' } }
      : { path: '/recordings', query: { analysis: '42', view: 'coaching' } })
    expect(pendingTimeline.value).toEqual(data)
    expect(s.state.opened.value).toBe(false)
  })

  it.each(['missing', 'failed'])('does not fall back to a review after a cancelled timeline lookup returns %s', async outcome => {
    let resolve!: (value: unknown) => void
    let reject!: (reason: Error) => void
    const timeline = new Promise((res, rej) => { resolve = res; reject = rej })
    const s = setup(async () => ({ drill_id: 7, review: { analysis_id: 42 }, matches: [] }), () => timeline); stops.push(s.stop)
    const pending = s.state.load()
    await vi.waitFor(() => expect(s.getTimeline).toHaveBeenCalledWith(42))
    s.state.toggle()
    if (outcome === 'missing') resolve(null)
    else reject(new Error('offline'))
    await pending
    expect(s.router.push).not.toHaveBeenCalled()
    expect(pendingTimeline.value).toBeNull()
  })
})
