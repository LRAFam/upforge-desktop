import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import { expect, it, vi } from 'vitest'
const text = readFileSync(new URL('./TrainingHubView.vue', import.meta.url), 'utf8').split('<script setup lang="ts">')[1].split('</script>')[0]
const ast = ts.createSourceFile('hub.ts', text, ts.ScriptTarget.Latest, true)
const functions = ast.statements.filter(n => ts.isFunctionDeclaration(n) && ['launchDrill', 'startAppointmentDrill'].includes(n.name!.text)).map(n => n.getText(ast)).join('\n')
const code = ts.transpileModule(functions, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText
function setup() {
  const drill = { scenario: 'head_height', user_drill_id: 8 }
  const current = vi.fn(async () => ({ state: 'scheduled', task: { id: 8 } })), choose = vi.fn(async () => ({ ok: true })), launchTrainer = vi.fn(async () => ({ ok: true, launchId: 'actual' }))
  const ctx: any = { window: { api: { practiceAppointment: { current, choose } } }, launchTrainer, assignedLaunchRequest: (value: unknown) => value, launching: { value: false }, drillRunning: { value: false }, structuredSessionActive: { value: false }, activeDrill: { value: null }, trainerNotice: { value: null }, appointmentViewActive: true, primaryGame: { value: 'valorant' }, activeLaunchId: null, appointmentDrill: { value: drill }, appointmentTaskId: { value: 8 }, console }
  vm.createContext(ctx); vm.runInContext(code, ctx)
  return { ctx, drill, current, choose, launchTrainer }
}
it('records voluntary exact task choice before launch, never enrollment from an automatic guided step', async () => {
  const s = setup(); await s.ctx.launchDrill(s.drill); expect(s.choose).toHaveBeenCalledWith(8); expect(s.launchTrainer).toHaveBeenCalledTimes(1)
  const guided = setup(); await guided.ctx.launchDrill(guided.drill, { guidedStep: true }); expect(guided.choose).not.toHaveBeenCalled(); expect(guided.launchTrainer).toHaveBeenCalledTimes(1)
})
it('blocks a late launch after account loss, game change, or view unmount during enrollment', async () => {
  for (const reason of ['account', 'game', 'unmount']) {
    const s = setup(); s.choose.mockImplementationOnce(async () => { if (reason === 'game') s.ctx.primaryGame.value = 'cs2'; if (reason === 'unmount') s.ctx.appointmentViewActive = false; return { ok: reason !== 'account' } })
    await s.ctx.launchDrill(s.drill); expect(s.launchTrainer).not.toHaveBeenCalled()
  }
})
it('re-resolves the exact saved task before user-confirmed resume and refuses completed/replaced tasks', async () => {
  const s = setup(); await s.ctx.startAppointmentDrill(); expect(s.launchTrainer).toHaveBeenCalledTimes(1)
  for (const reply of [{ state: 'completed', task: { id: 8 } }, { state: 'scheduled', task: { id: 9 } }]) {
    const stale = setup(); stale.current.mockResolvedValueOnce(reply); await stale.ctx.startAppointmentDrill(); expect(stale.launchTrainer).not.toHaveBeenCalled()
  }
})
