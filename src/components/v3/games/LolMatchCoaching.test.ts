import { readFileSync } from 'node:fs'
import { compileScript, compileTemplate, parse } from '@vue/compiler-sfc'
import { describe, expect, it } from 'vitest'

describe('LolMatchCoaching.vue', () => {
  it('compiles, and asks before spending an analysis', () => {
    const source = readFileSync(new URL('./LolMatchCoaching.vue', import.meta.url), 'utf8')
    const { descriptor, errors } = parse(source)
    expect(errors).toEqual([])
    const script = compileScript(descriptor, { id: 'lolc' })
    const tpl = compileTemplate({ source: descriptor.template!.content, filename: 'LolMatchCoaching.vue', id: 'lolc', compilerOptions: { bindingMetadata: script.bindings } })
    expect(tpl.errors).toEqual([])
    // The spend happens only behind the explicit confirm step.
    expect(descriptor.template!.content).toMatch(/This uses 1 analysis from your plan\./)
    expect(descriptor.template!.content).toMatch(/@click="requestCoaching\(\)"/)
    expect(descriptor.template!.content.indexOf('requestCoaching()')).toBeGreaterThan(descriptor.template!.content.indexOf('v-else class="lolc-row lolc-confirm"'))
  })
})
