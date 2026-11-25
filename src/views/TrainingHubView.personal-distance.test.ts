import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'

function functions(file: string, names: string[]) {
  const text = readFileSync(new URL(file, import.meta.url), 'utf8')
  const script = file.endsWith('.vue') ? text.split('<script setup lang="ts">')[1].split('</script>')[0] : text
  const tree = ts.createSourceFile(file, script, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
  const selected = tree.statements.filter((node): node is ts.FunctionDeclaration => ts.isFunctionDeclaration(node) && names.includes(node.name?.text ?? ''))
  expect(selected).toHaveLength(names.length)
  return ts.transpileModule(selected.map(node => node.getText(tree)).join('\n') + `\nexports.actual = { ${names.join(',')} };`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText
}
const code = functions('./TrainingHubView.vue', ['drillToAssigned', 'assignedLaunchRequest', 'assignedToSessionDrill', 'startStructuredSession', 'launchStructuredStep'])
type HubFunctions = Record<'drillToAssigned' | 'assignedLaunchRequest' | 'assignedToSessionDrill' | 'startStructuredSession' | 'launchStructuredStep', (...args: any[]) => any>
function hub() {
  const launches: Record<string, unknown>[] = []
  const step = (phase: string, scenario: string) => ({ phase, phase_label: phase, scenario, difficulty: 'medium', duration_seconds: 60, category: 'aim', reason: 'Measured task', user_drill_id: phase === 'focus' ? 7 : null, ...(phase === 'focus' ? { distances_m: [14.001, 22] } : {}) })
  const context = { exports: {} as { actual: Record<string, (...args: any[]) => any> },
    resolveTrainerScenario: () => 'head_height', resolveTrainerDifficulty: () => 'medium', resolveTrainerDuration: () => 60,
    legacyCoachingExtras: () => ({}), clearSessionTimer() {}, guidedNextScenario: () => undefined,
    structuredSession: { value: null as any }, sharedTrainingPlan: { value: { steps: [step('warmup', 'flick'), step('focus', 'head_height'), step('cooldown', 'microadjust')] } },
    showSessionSummary: { value: false }, sessionSummary: { value: null }, launchDrill: async (request: Record<string, unknown>) => { launches.push(request) },
  }
  vm.runInNewContext(code, context)
  return { ...(context.exports.actual as HubFunctions), launches }
}
describe('actual Practice launch paths preserve optional measured distances', () => {
  it('passes an assigned API drill through assignment, session and launch request', () => {
    const h = hub()
    const assigned = h.drillToAssigned({ id: 7, category: 'crosshair_placement', baseline_score: 50, title: 'Measured task', godot_config: { distances_m: [14.001, 22] } })
    expect(h.assignedLaunchRequest(assigned)).toMatchObject({ user_drill_id: 7, distances_m: [14.001, 22] })
    expect(h.assignedToSessionDrill(assigned)).toHaveProperty('distances_m', [14.001, 22])
    expect(h.assignedLaunchRequest(h.drillToAssigned({ id: 8 }))).not.toHaveProperty('distances_m')
  })
  it('guided warmup and cooldown remain fixed; only the API focus pair is forwarded', async () => {
    const h = hub(); await h.startStructuredSession(); await h.launchStructuredStep(1); await h.launchStructuredStep(2)
    expect(h.launches[0]).not.toHaveProperty('distances_m')
    expect(h.launches[1]).toMatchObject({ scenario: 'head_height', user_drill_id: 7, distances_m: [14.001, 22] })
    expect(h.launches[2]).not.toHaveProperty('distances_m')
  })
  it('the actual bridge launch info retains the pair for R-repeat and results Play again', () => {
    const context = { exports: {} as any }
    vm.runInNewContext(functions('../../electron/main/trainer-bridge.ts', ['launchInfo']), context)
    const config = { scenario: 'head_height', duration_seconds: 60, difficulty: 'medium', distances_m: [14.001, 22], user_drill_id: 7 }
    const info = context.exports.actual.launchInfo(4, config)
    expect(info).toHaveProperty('distances_m', [14.001, 22]); expect(info.distances_m).not.toBe(config.distances_m)
  })
})
