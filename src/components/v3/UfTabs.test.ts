import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { compileScript, parse } from '@vue/compiler-sfc'
import ts from 'typescript'
import * as vue from 'vue'
import { describe, expect, it } from 'vitest'
import { renderToString } from 'vue/server-renderer'

// Compile the SFC by hand, as the other component tests in this repo do (no Vite Vue plugin in vitest).
function loadTabs() {
  const { descriptor } = parse(readFileSync(new URL('./UfTabs.vue', import.meta.url), 'utf8'))
  const script = compileScript(descriptor, { id: 'uf-tabs-test', inlineTemplate: true })
  const code = ts.transpileModule(script.content, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  const exports: any = {}
  vm.runInNewContext(code, { exports, require: (id: string) => { if (id === 'vue') return vue; throw new Error(`Unexpected import: ${id}`) } })
  return exports.default
}
const UfTabs = loadTabs()
const items = [{ key: 'all', label: 'All', count: 12 }, { key: 'aim', label: 'Aim' }, { key: 'duel', label: 'Duel', count: 0 }]
const render = (props: Record<string, unknown>) => renderToString(vue.createSSRApp({ render: () => vue.h(UfTabs, props) }))

describe('UfTabs', () => {
  it('renders an accessible tablist with one selected tab', async () => {
    const html = await render({ items, modelValue: 'aim', label: 'Drill filter' })
    expect(html).toContain('role="tablist"')
    expect(html).toContain('aria-label="Drill filter"')
    expect(html.match(/role="tab"/g)).toHaveLength(3)
    expect(html.match(/aria-selected="true"/g)).toHaveLength(1)
    expect(html).toMatch(/aria-selected="true"[^>]*tabindex="0"[^>]*>\s*Aim/)
  })

  it('shows counts including zero, and uses the size variant class', async () => {
    const html = await render({ items, modelValue: 'all', size: 'filter' })
    expect(html).toContain('uf-tabs--filter')
    expect(html).toMatch(/All<span class="uf-tab-count"[^>]*>12</)
    expect(html).toMatch(/Duel<span class="uf-tab-count"[^>]*>0</)
    expect(html).not.toMatch(/Aim<span class="uf-tab-count"/)
  })

  it('emits the clicked key and moves with the arrow keys', () => {
    const emitted: string[] = []
    const r = UfTabs.setup(vue.reactive({ items, modelValue: 'all', size: 'page' }), {
      expose() {}, emit: (_e: string, k: string) => emitted.push(k), attrs: {}, slots: {},
    })
    expect(typeof r).toBe('function')
    // the keyboard handler lives in setup; drive it through a rendered vnode tree
    const tree = r({ items, modelValue: 'all', size: 'page' }, [])
    const buttons = (tree.children as any[])[0].children as any[]
    buttons[1].props.onClick()
    buttons[0].props.onKeydown({ key: 'ArrowRight', preventDefault() {}, currentTarget: null })
    buttons[0].props.onKeydown({ key: 'ArrowLeft', preventDefault() {}, currentTarget: null })
    buttons[0].props.onKeydown({ key: 'Enter', preventDefault() {}, currentTarget: null })
    expect(emitted).toEqual(['aim', 'aim', 'duel'])
  })
})
