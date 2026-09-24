import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import vm from 'node:vm'
import { compileScript, parse } from '@vue/compiler-sfc'
import ts from 'typescript'
import { withModifiers } from 'vue'
import { expect, it, vi } from 'vitest'

it('forwards the click event so recording settings can stop bubbling and toggle once', () => {
  const source = readFileSync(new URL('./SettingsToggle.vue', import.meta.url), 'utf8')
  const { descriptor } = parse(source)
  const compiled = compileScript(descriptor, { id: 'settings-toggle', inlineTemplate: true })
  const code = ts.transpileModule(compiled.content, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
  const exports: Record<string, any> = {}
  vm.runInNewContext(code, { exports, require: createRequire(import.meta.url) })

  const toggle = vi.fn()
  const listener = withModifiers(toggle, ['stop'])
  const render = exports.default.setup({ on: false }, { expose() {} })
  const button = render({ $emit: (_name: string, event: Event) => listener(event) }, [])
  const event = { stopPropagation: vi.fn() }

  expect(() => button.props.onClick(event)).not.toThrow()
  expect(event.stopPropagation).toHaveBeenCalledOnce()
  expect(toggle).toHaveBeenCalledExactlyOnceWith(event)
})
