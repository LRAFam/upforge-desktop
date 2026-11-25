import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { compileScript, parse } from '@vue/compiler-sfc'
import ts from 'typescript'
import * as vue from 'vue'
import { describe, expect, it } from 'vitest'
import * as metrics from '../lib/training-result-metrics'
import * as scenarios from '../lib/trainer-scenarios'
import * as launch from '../lib/trainer-launch'
import * as loop from '../lib/drill-loop'
import * as sync from '../lib/trainer-sync'
import * as summary from '../lib/trainer-run-summary'
import * as session from '../components/v3/practice/practice-session-v3'
import type { SessionResult } from '../stores/trainerResult'

const { descriptor } = parse(readFileSync(new URL('./TrainerResultsView.vue', import.meta.url), 'utf8'))
const code = ts.transpileModule(compileScript(descriptor, { id: 'placement-result-test', inlineTemplate: true }).content, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText
const directionDescriptor = parse(readFileSync(new URL('../components/training/TrainerPlacementDirection.vue', import.meta.url), 'utf8')).descriptor
const directionCode = ts.transpileModule(compileScript(directionDescriptor, { id: 'placement-direction-test', inlineTemplate: true }).content, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText
const directionExports: any = {}
vm.runInNewContext(directionCode, { exports: directionExports, require: (id: string) => {
  if (id === 'vue') return vue
  throw new Error(`Unexpected direction import ${id}`)
} })
const Direction = directionExports.default
const stub = { name: 'Stub' }
function renderResult(uiV3: boolean, metadata: Record<string, unknown>, scenario = 'head_height') {
  const result: SessionResult = { scenario, duration_seconds: 60, score: 65, accuracy_pct: 50, avg_reaction_ms: 300, consistency_score: 70, targets_hit: 10, targets_missed: 10, completed_at: '2026-11-24T12:00:00Z', metadata }
  const exports: any = {}
  vm.runInNewContext(code, {
    exports,
    require: (id: string) => {
      if (id === 'vue') return { ...vue, onMounted: () => {} }
      if (id === 'vue-router') return { useRouter: () => ({ replace() {}, push() {} }) }
      if (id.endsWith('/useLifetime')) return { useLifetime: () => ({ own() {}, ended: false }) }
      if (id.endsWith('/useTrainerUploadStatus')) return { useTrainerUploadStatus: () => ({ status: vue.ref(null), unsavedRuns: vue.ref([]), retrying: vue.ref(false), retry() {} }) }
      if (id.endsWith('/trainerResult')) return { useTrainerResultStore: () => ({ result, launchConfig: null, isPB: false }) }
      if (id.endsWith('/training-result-metrics')) return metrics
      if (id.endsWith('/trainer-scenarios')) return scenarios
      if (id.endsWith('/trainer-launch')) return launch
      if (id.endsWith('/drill-loop')) return loop
      if (id.endsWith('/trainer-sync')) return sync
      if (id.endsWith('/trainer-run-summary')) return summary
      if (id.endsWith('/practice-session-v3')) return session
      if (id.endsWith('/ui-v3')) return { uiV3 }
      if (id.endsWith('/training-icons')) return { scenarioIconUrl: () => '' }
      if (id.endsWith('.webp')) return { default: '' }
      if (id.endsWith('/TrainerPlacementDirection.vue')) return { default: Direction }
      if (id.endsWith('.vue')) return { default: stub }
      throw new Error(`Unexpected import ${id}`)
    },
  })
  const scope = vue.effectScope()
  try {
    const render = scope.run(() => exports.default.setup({}, { expose() {} }))
    return text(render({}, []))
  } finally { scope.stop() }
}
function text(node: any): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (node?.type === vue.Comment || node == null) return ''
  if (node.type === Direction) {
    const scope = vue.effectScope()
    try {
      const render = scope.run(() => Direction.setup(vue.reactive(node.props), { expose() {} }))
      return text(render({}, []))
    } finally { scope.stop() }
  }
  const children = Array.isArray(node) ? node : node.children
  if (children && typeof children.default === 'function') return text(children.default())
  if (Array.isArray(children)) return children.map(text).join(' ').replace(/\s+/g, ' ').trim()
  return typeof children === 'string' ? children : ''
}

describe.each([true, false])('Trainer results placement readout (v3=%s)', uiV3 => {
  it('keeps the measured absolute error for an older run', () => {
    const output = renderResult(uiV3, { mean_placement_error_deg: 2.5, mean_vertical_error_deg: 1.2, mean_horizontal_error_deg: 1.8 })
    expect(output).toContain('2.50°')
    expect(output).toContain('1.20°')
    expect(output).toContain('1.80°')
    expect(output).not.toContain('Average crosshair offset')
  })
})


describe.each([true, false])('Signed placement in actual results layout (v3=%s)', uiV3 => {
  const measured = { placement_samples: 10, mean_placement_error_deg: 2.5, mean_vertical_error_deg: 1.2, mean_horizontal_error_deg: 1.8 }
  it.each(['head_height', 'angle_clearing'])('shows above/right and below/left for %s while retaining absolute error', scenario => {
    const above = renderResult(uiV3, { ...measured, mean_signed_vertical_error_deg: 0.4, mean_signed_horizontal_error_deg: 0.25 }, scenario)
    expect(above).toContain('Average crosshair offset')
    expect(above).toContain('0.40° above')
    expect(above).toContain('0.25° right')
    expect(above).toContain('1.20°')
    const below = renderResult(uiV3, { ...measured, mean_signed_vertical_error_deg: -0.4, mean_signed_horizontal_error_deg: -0.25 }, scenario)
    expect(below).toContain('0.40° below')
    expect(below).toContain('0.25° left')
  })
  it('does not call a cancelling signed mean accurate, or erase absolute error', () => {
    const output = renderResult(uiV3, { ...measured, mean_signed_vertical_error_deg: 0, mean_signed_horizontal_error_deg: -0 })
    expect(output).toContain('No average offset')
    expect(output).toContain('Opposite offsets can cancel in the average.')
    expect(output).toContain('2.50°')
    expect(output).not.toContain('on target')
  })
  it('preserves the direction of a small measured offset', () => {
    const output = renderResult(uiV3, { ...measured, mean_signed_vertical_error_deg: 0.001, mean_signed_horizontal_error_deg: -0.001 })
    expect(output).toContain('<0.01° above')
    expect(output).toContain('<0.01° left')
  })
  it.each([
    { placement_samples: 0 }, { placement_samples: -1 }, { placement_samples: 1.5 }, { placement_samples: '10' },
    { placement_samples: undefined }, { mean_signed_vertical_error_deg: undefined }, { mean_signed_horizontal_error_deg: undefined },
    { mean_signed_vertical_error_deg: NaN }, { mean_signed_vertical_error_deg: Infinity },
    { mean_signed_vertical_error_deg: 181 }, { mean_signed_horizontal_error_deg: -181 },
    { mean_signed_vertical_error_deg: '0.4' },
  ])('omits unmeasured or invalid signed metadata %j', bad => {
    const output = renderResult(uiV3, { ...measured, mean_signed_vertical_error_deg: 0.4, mean_signed_horizontal_error_deg: -0.25, ...bad })
    expect(output).not.toContain('Average crosshair offset')
    expect(output).toContain('2.50°')
  })
  it('accepts the exact signed range boundaries', () => {
    const output = renderResult(uiV3, { ...measured, mean_signed_vertical_error_deg: 180, mean_signed_horizontal_error_deg: -180 })
    expect(output).toContain('180.00° above')
    expect(output).toContain('180.00° left')
  })
  
  it('does not apply placement directions to a different scenario', () => {
    expect(renderResult(uiV3, { ...measured, mean_signed_vertical_error_deg: 0.4, mean_signed_horizontal_error_deg: -0.25 }, 'distance_switching')).not.toContain('Average crosshair offset')
  })
})
