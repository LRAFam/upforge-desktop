import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { compileScript, parse } from '@vue/compiler-sfc'
import ts from 'typescript'
import * as vue from 'vue'
import { expect, it, vi } from 'vitest'
import * as focusHelpers from '../../lib/focus'
import * as focusState from '../../composables/useFocusCard'
import type { FocusResponse, FocusUpdate } from '../../lib/focus'

const focus: focusHelpers.Focus = {
  id: 2, label: 'Opening deaths', metric: 'opening_death_rate', better: 'lower', baseline: 0.17, target: 0.1,
  checks: [{ match_id: 'latest', value: 0.13, hit: false, played_at: null }],
  progress: { games_played: 1, hits: 0, games_required: 3, hits_required: 2, status: 'active' },
  started_at: null, completed_at: null,
}
const report: FocusUpdate = {
  match_id: 'latest', focus, focus_event: 'checked',
  report: { notes: { headline: { finding_id: 'opening', text: 'Keep your opening deaths down.' }, next_action: { finding_id: 'opening', text: 'Wait for your teammate before peeking.' } } },
}
const snapshot: FocusResponse = { success: true, focus, latest: report, history: [], notes_usage: { used: 1, limit: 10 } }

function card(api: object) {
  const mounted: Array<() => void> = []
  const unmounted: Array<() => void> = []
  const { descriptor } = parse(readFileSync(new URL('./DashboardFocusCard.vue', import.meta.url), 'utf8'))
  const script = compileScript(descriptor, { id: 'focus-card-test', inlineTemplate: true })
  const code = ts.transpileModule(script.content, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  const exports: any = {}
  vm.runInNewContext(code, {
    exports, window: { api: { app: api } },
    require: (id: string) => {
      if (id === 'vue') return { ...vue, onMounted: (fn: () => void) => mounted.push(fn), onUnmounted: (fn: () => void) => unmounted.push(fn) }
      if (id.endsWith('/focus')) return focusHelpers
      if (id.endsWith('/useFocusCard')) return focusState
      throw new Error(`Unexpected component import: ${id}`)
    },
  })
  const render = exports.default.setup({}, { expose() {} })
  return {
    async mount() { mounted.forEach(fn => fn()); await Promise.resolve(); await vue.nextTick() },
    unmount() { unmounted.forEach(fn => fn()) },
    text() { return vnodeText(render({}, [])) },
  }
}

function vnodeText(node: any): string {
  if (typeof node === 'string') return node
  if (Array.isArray(node)) return node.map(vnodeText).join(' ')
  return node?.children ? vnodeText(node.children) : ''
}

it('renders the latest coach headline and Next game after updates happen away from Home', async () => {
  let stored: FocusResponse = { ...snapshot, latest: null }
  const listeners = new Set<(update: FocusUpdate) => void>()
  const api = {
    getFocus: vi.fn(async () => stored),
    syncFocus: vi.fn(),
    onFocusUpdated: (cb: (update: FocusUpdate) => void) => { listeners.add(cb); return () => listeners.delete(cb) },
  }
  const first = card(api)
  await first.mount()
  first.unmount()
  expect(listeners.size).toBe(0)
  stored = snapshot // The main process persists a report while Home is unmounted.
  const reopened = card(api)
  await reopened.mount()
  expect(reopened.text()).toContain('Keep your opening deaths down.')
  expect(reopened.text()).toContain('Next game:')
  expect(reopened.text()).toContain('Wait for your teammate before peeking.')
  expect(reopened.text()).toContain('✕')
  expect(reopened.text()).toContain('13%')
  expect(api.syncFocus).not.toHaveBeenCalled()
  reopened.unmount()
})

it('says an alt-account game was coached but not counted for the focus', async () => {
  const altGame = { ...snapshot, latest: { ...report, focus_event: null, account: { is_main: false } } }
  const view = card({ getFocus: async () => altGame, onFocusUpdated: () => () => {}, syncFocus: vi.fn() })
  await view.mount()
  expect(view.text()).toContain('Alt-account game: coached, not counted for your focus')
  expect(view.text()).not.toContain('Checked against your last match')
  view.unmount()
})

it('keeps a valid headline visible even if the report has no Next game action', async () => {
  const partial = { ...snapshot, latest: { ...report, report: { notes: { headline: report.report!.notes!.headline } } } }
  const view = card({ getFocus: async () => partial, onFocusUpdated: () => () => {}, syncFocus: vi.fn() })
  await view.mount()
  expect(view.text()).toContain('Keep your opening deaths down.')
  expect(view.text()).not.toContain('Next game:')
  expect(view.text()).not.toContain('Coach notes aren’t available')
  view.unmount()
})
