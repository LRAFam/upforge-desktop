import { readFileSync } from 'fs'
import vm from 'vm'
import { compileScript, parse } from '@vue/compiler-sfc'
import ts from 'typescript'
import * as vue from 'vue'
import { afterEach, expect, it, vi } from 'vitest'
const { descriptor } = parse(readFileSync(new URL('./FirstSessionRecovery.vue', import.meta.url), 'utf8'))
const source = ts.transpileModule(compileScript(descriptor, { id: 'recovery' }).content, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText
const stops: (() => void)[] = []
afterEach(() => { stops.splice(0).forEach(stop => stop()) })
function setup(tile: unknown = { assignmentId: 'assignment', recordingId: 'recording' }) {
  let mounted!: () => void, unmounted!: () => void
  const props = vue.reactive({ safe: true })
  const attention = vue.ref(true)
  const api = { firstSessionRecovery: { current: vi.fn(async () => tile), exposed: vi.fn(async () => {}), enter: vi.fn(async () => ({ ok: true, recordingId: 'recording' })), dismiss: vi.fn(async () => {}) }, recordings: { analyse: vi.fn(async () => ({ ok: true })) } }
  const context = { exports: {} as any, window: { api }, setInterval: vi.fn(), clearInterval: vi.fn(), require: (name: string) => name === 'vue' ? { ...vue, onMounted: (fn: () => void) => { mounted = fn }, onUnmounted: (fn: () => void) => { unmounted = fn } } : { useWindowAttention: () => attention } }
  vm.runInNewContext(source, context)
  const scope = vue.effectScope()
  const view = scope.run(() => context.exports.default.setup(props, { expose() {} }))
  const stop = () => { unmounted(); scope.stop() }; stops.push(stop)
  return { api, props, attention, view, stop, async mount() { mounted(); await new Promise(resolve => setImmediate(resolve)) } }
}
it('does not expose a control/null reply and only shows a main-approved treatment task', async () => {
  const control = setup(null); await control.mount(); expect(control.view.visible.value).toBe(false); expect(control.api.firstSessionRecovery.exposed).not.toHaveBeenCalled()
  const treatment = setup(); await treatment.mount(); expect(treatment.view.visible.value).toBe(true); expect(treatment.api.firstSessionRecovery.exposed).toHaveBeenCalledWith('assignment')
})
it('uses existing explicit analyse only after main entry revalidation', async () => {
  const s = setup(); await s.mount(); await s.view.resume()
  expect(s.api.firstSessionRecovery.enter).toHaveBeenCalledWith('assignment'); expect(s.api.recordings.analyse).toHaveBeenCalledWith('recording')
  s.api.firstSessionRecovery.enter.mockResolvedValueOnce({ ok: false } as any); await s.view.resume(); expect(s.api.recordings.analyse).toHaveBeenCalledTimes(1)
})
it('account unmount while entry is pending cannot trigger a new-account upload', async () => {
  const s = setup(); await s.mount(); let resolve!: (reply: any) => void
  s.api.firstSessionRecovery.enter.mockImplementationOnce(() => new Promise(done => { resolve = done }))
  const pending = s.view.resume(); s.stop(); resolve({ ok: true, recordingId: 'recording' }); await pending
  expect(s.api.recordings.analyse).not.toHaveBeenCalled()
})
it('hides the task immediately when the game opens or window loses foreground', async () => {
  const s = setup(); await s.mount(); s.props.safe = false; expect(s.view.visible.value).toBe(false)
  s.props.safe = true; s.attention.value = false; expect(s.view.visible.value).toBe(false)
})
