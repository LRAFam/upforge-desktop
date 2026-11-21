import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import vm from 'node:vm'
import { compileScript, parse } from '@vue/compiler-sfc'
import ts from 'typescript'
import { ref, type VNode } from 'vue'
import { describe, expect, it, vi } from 'vitest'

const req = createRequire(import.meta.url)

function toCommonJs(source: string): string {
  return ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
}

function runModule(code: string, context: vm.Context, require: (id: string) => unknown): Record<string, any> {
  const exports: Record<string, any> = {}
  vm.runInContext(`(function (exports, require) {\n${code}\n})`, context)(exports, require)
  return exports
}

/** Compiles LoginView.vue with the real desktop-api helper; `window` is whatever the test passes. */
function loadLoginView(win: Record<string, unknown>, v3: boolean) {
  const context = vm.createContext({ window: win, console })
  const desktopApi = runModule(toCommonJs(readFileSync(new URL('../lib/desktop-api.ts', import.meta.url), 'utf8')), context, req)
  const { descriptor } = parse(readFileSync(new URL('./LoginView.vue', import.meta.url), 'utf8'))
  const compiled = compileScript(descriptor, { id: 'login-view', inlineTemplate: true })
  const stubs: Record<string, unknown> = {
    'vue-router': { useRouter: () => ({ push: vi.fn() }) },
    '../lib/onboarding-gate': { resolvePostAuthRoute: () => '/dashboard' },
    '../lib/desktop-api': desktopApi,
    '../lib/ui-v3': { uiV3: ref(v3) },
    './v3/LoginV3.vue': { default: { name: 'LoginV3' } },
    '../composables/useVerificationResend': {
      useVerificationResend: () => ({
        needsVerification: ref(false), resending: ref(false), resendNote: ref(''), resendError: ref(''),
        noteLoginResult: vi.fn(), resend: vi.fn(),
      }),
    },
    '../composables/useCreateAccountReturn': {
      useCreateAccountReturn: () => ({
        showReturnNote: ref(false), returnNote: '', openCreateAccount: vi.fn(), clearPendingSignup: vi.fn(),
      }),
    },
  }
  const requireStub = (id: string) => {
    if (id in stubs) return stubs[id]
    if (/\.(webp|png|svg)$/.test(id)) return { default: id } // template image imports
    return req(id)
  }
  const component = runModule(toCommonJs(compiled.content), context, requireStub).default
  const render = component.setup({}, { expose() {} })
  // Rendering outside a mounted app makes Vue warn about v-model on the legacy inputs; that is a test artefact.
  const warn = vi.spyOn(console, 'warn').mockImplementation((...args: unknown[]) => {
    if (!String(args[0]).includes('withDirectives can only be used inside render functions')) console.info(...args)
  })
  try {
    return render({}, []) as VNode
  } finally {
    warn.mockRestore()
  }
}

function findButton(node: VNode, label: string): VNode | null {
  if ((node.props as Record<string, unknown> | null)?.['aria-label'] === label) return node
  for (const child of Array.isArray(node.children) ? node.children : []) {
    if (child && typeof child === 'object' && 'props' in child) {
      const found = findButton(child as VNode, label)
      if (found) return found
    }
  }
  return null
}

/** The handlers a click on Minimize / Close ends up calling, for the v3 and the legacy login screen. */
function windowControls(win: Record<string, unknown>, v3: boolean): { minimize: () => void; close: () => void } {
  const root = loadLoginView(win, v3)
  if (v3) {
    const props = root.props as { onMinimize: () => void; onClose: () => void }
    return { minimize: props.onMinimize, close: props.onClose }
  }
  const onClick = (label: string) => (findButton(root, label)?.props as { onClick: () => void }).onClick
  return { minimize: onClick('Minimize UpForge'), close: onClick('Close UpForge') }
}

describe.each([true, false])('login window controls (v3=%s)', (v3) => {
  it('do nothing instead of throwing when the renderer runs without the Electron preload', () => {
    const { minimize, close } = windowControls({}, v3)

    expect(() => minimize()).not.toThrow()
    expect(() => close()).not.toThrow()
  })

  it('minimize and close the window through the preload bridge', () => {
    const bridge = { window: { minimize: vi.fn(), close: vi.fn() } }
    const { minimize, close } = windowControls({ api: bridge }, v3)

    minimize()
    expect(bridge.window.minimize).toHaveBeenCalledOnce()
    expect(bridge.window.close).not.toHaveBeenCalled()
    close()
    expect(bridge.window.close).toHaveBeenCalledOnce()
  })
})
