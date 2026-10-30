import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import vm from 'node:vm'
import { compileScript, parse } from '@vue/compiler-sfc'
import ts from 'typescript'
import { ref, withModifiers } from 'vue'
import { expect, it, vi } from 'vitest'

function load(v3: boolean) {
  const source = readFileSync(new URL('./SettingsToggle.vue', import.meta.url), 'utf8')
  const { descriptor } = parse(source)
  const compiled = compileScript(descriptor, { id: 'settings-toggle', inlineTemplate: true })
  const code = ts.transpileModule(compiled.content, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
  const exports: Record<string, any> = {}
  const req = createRequire(import.meta.url)
  const uiV3 = ref(v3)
  vm.runInNewContext(code, { exports, require: (id: string) => (id.endsWith('lib/ui-v3') ? { uiV3 } : req(id)) })
  return exports.default
}

it.each([false, true])('forwards the click event so recording settings can stop bubbling and toggle once (v3=%s)', (v3) => {
  const component = load(v3)

  const toggle = vi.fn()
  const listener = withModifiers(toggle, ['stop'])
  const render = component.setup({ on: false, label: 'Record game audio' }, { expose() {} })
  const button = render({ $emit: (_name: string, event: Event) => listener(event) }, [])
  expect(button.props.role).toBe('switch')
  expect(button.props['aria-label']).toBe('Record game audio')
  expect(button.props['aria-checked']).toBe(false)
  const event = { stopPropagation: vi.fn() }

  expect(() => button.props.onClick(event)).not.toThrow()
  expect(event.stopPropagation).toHaveBeenCalledOnce()
  expect(toggle).toHaveBeenCalledExactlyOnceWith(event)
})
