/**
 * Test support: mount a real .vue file without a browser.
 *
 * The file is compiled the way the app compiles it, its imports are loaded by the path the file
 * itself uses, child components render as plain elements (props and slot content kept), and the
 * result is a small tree the test can read as text and press. Used for screens whose logic lives
 * in script setup, where reading the source alone proves little.
 */
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { compileScript, parse } from '@vue/compiler-sfc'
import ts from 'typescript'
import * as vue from 'vue'

export interface TestNode {
  type: string
  props: Record<string, unknown>
  children: TestNode[]
  text?: string
  parent: TestNode | null
  /** Form controls: what the player typed. */
  value?: string
  listeners: Record<string, Array<(e: unknown) => void>>
  addEventListener: (type: string, fn: (e: unknown) => void) => void
  removeEventListener: (type: string, fn: (e: unknown) => void) => void
}

function node(type: string, text?: string): TestNode {
  const n: TestNode = {
    type, props: {}, children: [], text, parent: null, listeners: {},
    addEventListener: (event, fn) => { (n.listeners[event] ??= []).push(fn) },
    removeEventListener: (event, fn) => { n.listeners[event] = (n.listeners[event] ?? []).filter(l => l !== fn) },
  }
  return n
}
function detach(child: TestNode): void {
  const p = child.parent
  if (p) p.children.splice(p.children.indexOf(child), 1)
  child.parent = null
}

const renderer = vue.createRenderer<TestNode, TestNode>({
  createElement: type => node(type),
  createText: text => node('#text', text),
  createComment: () => node('#comment'),
  setText: (n, text) => { n.text = text },
  setElementText: (el, text) => { el.children = []; const t = node('#text', text); t.parent = el; el.children.push(t) },
  insert: (child, parent, anchor) => {
    detach(child)
    child.parent = parent
    const at = anchor ? parent.children.indexOf(anchor) : -1
    if (at >= 0) parent.children.splice(at, 0, child); else parent.children.push(child)
  },
  remove: detach,
  parentNode: n => n.parent,
  nextSibling: (n) => { const p = n.parent; return p ? p.children[p.children.indexOf(n) + 1] ?? null : null },
  patchProp: (el, key, _prev, next) => { el.props[key] = next },
})

/** Everything on screen as one line of text. */
export function textOf(n: TestNode): string {
  if (n.type === '#comment') return ''
  if (n.type === '#text') return n.text ?? ''
  return n.children.map(textOf).join(' ').replace(/\s+/g, ' ').trim()
}
export function findAll(n: TestNode, pred: (n: TestNode) => boolean, out: TestNode[] = []): TestNode[] {
  if (pred(n)) out.push(n)
  n.children.forEach(c => findAll(c, pred, out))
  return out
}
/** The innermost pressable thing (a button, or a stubbed button component) whose label contains `label`. */
export function pressable(root: TestNode, label: string): TestNode | undefined {
  return findAll(root, n => typeof n.props.onClick === 'function' && textOf(n).includes(label)).pop()
}
export function press(root: TestNode, label: string): void {
  const target = pressable(root, label)
  if (!target) throw new Error(`Nothing to press with the label "${label}". On screen: ${textOf(root).slice(0, 400)}`)
  ;(target.props.onClick as (e: unknown) => void)({ preventDefault() {}, stopPropagation() {} })
}
/** Type into a form control the way v-model hears it. */
export function typeInto(input: TestNode, text: string): void {
  input.value = text
  for (const listener of input.listeners.input ?? []) listener({ target: input })
}
/** Let pending promises, timers and Vue updates finish. */
export async function settle(): Promise<void> {
  for (let i = 0; i < 12; i += 1) { await new Promise(r => setTimeout(r, 0)); await vue.nextTick() }
}

/** Child components render as a plain element with their props and slot content. */
const Stub = (props: Record<string, unknown>, { slots }: { slots: Record<string, (() => unknown) | undefined> }) =>
  vue.h('stub', props, Object.values(slots).map(slot => slot?.()) as never)

export interface MountOptions {
  /** Modules to hand the file instead of the real ones, by the specifier the file imports. */
  modules?: Record<string, unknown>
  /** Slots to pass to the component under test. */
  slots?: Record<string, () => unknown>
  props?: Record<string, unknown>
}

/** Compile a .vue file and load what it imports. Imports ending in .vue become stubs. */
export async function loadSfc(sfcUrl: URL, modules: Record<string, unknown> = {}): Promise<vue.Component> {
  const { descriptor } = parse(readFileSync(sfcUrl, 'utf8'))
  const script = compileScript(descriptor, { id: 'sfc-test', inlineTemplate: true })
  const code = ts.transpileModule(script.content, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  const loaded: Record<string, unknown> = { vue, ...modules }
  for (const [, id] of code.matchAll(/require\("([^"]+)"\)/g)) {
    if (id in loaded || id.endsWith('.vue')) continue
    loaded[id] = await import(/* @vite-ignore */ new URL(`${id}.ts`, sfcUrl).href)
  }
  const exports: { default?: vue.Component } = {}
  vm.runInNewContext(code, {
    exports,
    window: (globalThis as { window?: unknown }).window,
    setTimeout,
    clearTimeout,
    require: (id: string) => {
      if (id.endsWith('.vue')) return { __esModule: true, default: Stub }
      if (id in loaded) return loaded[id]
      throw new Error(`Unexpected import: ${id}`)
    },
  })
  return exports.default!
}

const mounted: Array<{ unmount: () => void }> = []

/** Mount a .vue file. Stub `window` (vi.stubGlobal) before calling: the file reads it as it loads. */
export async function mountSfc(sfcUrl: URL, options: MountOptions = {}) {
  const component = await loadSfc(sfcUrl, options.modules)
  const root = node('root')
  const app = renderer.createApp({ render: () => vue.h(component as never, options.props ?? {}, options.slots as never) })
  mounted.push(app)
  app.mount(root)
  await settle()
  return { root, text: () => textOf(root) }
}

/** Call in afterEach: stops the mounted screens' timers and listeners even when an assertion failed. */
export function unmountAll(): void {
  mounted.splice(0).forEach(app => app.unmount())
}
