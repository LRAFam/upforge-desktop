import { readFileSync } from 'fs'
import vm from 'vm'
import { compileScript, parse } from '@vue/compiler-sfc'
import ts from 'typescript'
import * as vue from 'vue'
import * as contract from '../../lib/practice-appointment'
import { afterEach, expect, it, vi } from 'vitest'
const { descriptor } = parse(readFileSync(new URL('./PracticeAppointment.vue', import.meta.url), 'utf8'))
const source = ts.transpileModule(compileScript(descriptor, { id: 'appointment' }).content, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText
const stops: (() => void)[] = []
afterEach(() => { stops.splice(0).forEach(stop => stop()) })
function setup(arm = 'treatment') {
  let mounted!: () => void, unmounted!: () => void, interval!: () => void
  const props = vue.reactive({ safe: true }), attention = vue.ref(true)
  const value = { assignment_id: '11111111-1111-4111-8111-111111111111', arm, state: 'chosen', task: { id: 8, title: 'Head height', practice_target_hit: false } }
  const api = { practiceAppointment: { current: vi.fn(async () => value), boundary: vi.fn(async () => {}), change: vi.fn(async () => ({ ...value, state: 'scheduled' })) } }
  const push = vi.fn(async () => {})
  const context = { exports: {} as any, window: { api }, Intl, setInterval: (fn: () => void) => { interval = fn }, clearInterval: vi.fn(), require: (name: string) => name === 'vue' ? { ...vue, onMounted: (fn: () => void) => { mounted = fn }, onUnmounted: (fn: () => void) => { unmounted = fn } } : name === 'vue-router' ? { useRouter: () => ({ push }) } : name.includes('practice-appointment') ? contract : { useWindowAttention: () => attention } }
  vm.runInNewContext(source, context)
  const scope = vue.effectScope(), view = scope.run(() => context.exports.default.setup(props, { expose() {} }))
  const stop = () => { unmounted(); scope.stop() }; stops.push(stop)
  return { api, push, props, attention, value, view, stop, async interval() { interval(); await new Promise(resolve => setImmediate(resolve)) }, async mount() { mounted(); await new Promise(resolve => setImmediate(resolve)) } }
}
it('control shows no scheduling prompt; treatment starts with reminder opt-out', async () => {
  const c = setup('control'); await c.mount(); expect(c.view.visible.value).toBe(false)
  const t = setup(); await t.mount(); expect(t.view.visible.value).toBe(true); expect(t.view.reminder.value).toBe(false)
})
it('only foreground boundaries request reminders, never the refresh timer', async () => {
  const s = setup(); await s.mount(); expect(s.api.practiceAppointment.boundary).toHaveBeenCalledTimes(1)
  await s.interval(); await s.interval(); expect(s.api.practiceAppointment.boundary).toHaveBeenCalledTimes(1)
  s.props.safe = false; expect(s.view.visible.value).toBe(false)
})
it('schedule sends explicit local zone/offset and no opt-in unless selected; Skip sends no schedule', async () => {
  const s = setup(); await s.mount(); s.view.localTime.value = '2026-11-25T12:00'; await s.view.change('schedule')
  expect(s.api.practiceAppointment.change).toHaveBeenCalledWith(s.value.assignment_id, 'schedule', expect.objectContaining({ local_datetime: '2026-11-25T12:00', reminder_opt_in: false, timezone: expect.any(String), utc_offset_minutes: expect.any(Number) }))
  await s.view.change('skip'); expect(s.api.practiceAppointment.change).toHaveBeenLastCalledWith(s.value.assignment_id, 'skip', undefined)
})
it('resume re-resolves the exact current task and only navigates; late account unmount cannot navigate', async () => {
  const s = setup(); await s.mount(); await s.view.resume(); expect(s.push).toHaveBeenCalledWith({ path: '/training', query: { appointmentDrill: '8', game: 'valorant' } })
  s.push.mockClear(); let resolve!: (value: any) => void
  s.api.practiceAppointment.current.mockImplementationOnce(() => new Promise(done => { resolve = done }))
  const pending = s.view.resume(); s.stop(); resolve(s.value); await pending; expect(s.push).not.toHaveBeenCalled()
})
it('completed or unavailable tasks never navigate into a launch', async () => {
  const s = setup(); await s.mount(); s.value.state = 'completed'; await s.view.resume(); expect(s.push).not.toHaveBeenCalled()
})
it('a safety change during save releases busy state and does not apply the stale response', async () => {
  const s = setup(); await s.mount(); s.view.localTime.value = '2026-11-25T12:00'
  let resolve!: (value: any) => void
  s.api.practiceAppointment.change.mockImplementationOnce(() => new Promise(done => { resolve = done }))
  const pending = s.view.change('schedule'); s.props.safe = false; await vue.nextTick(); resolve({ ...s.value, state: 'scheduled' }); await pending
  expect(s.view.busy.value).toBe(false); expect(s.view.appointment.value).toBeNull()
})
