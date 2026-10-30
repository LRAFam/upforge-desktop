import { readFileSync } from 'node:fs'
import { compileScript, parse } from '@vue/compiler-sfc'
import { describe, expect, it } from 'vitest'

// No clips exist on the test machine, so the v3 clip dialogs are checked at the template level:
// the SFC must compile, and each dialog must be a UfDialog bound to the same state as the old modal.
const source = readFileSync(new URL('./ClipsView.vue', import.meta.url), 'utf8')
const { descriptor, errors } = parse(source)
const template = descriptor.template?.content ?? ''
const dialogs = [...template.matchAll(/<UfDialog\b([^>]*)>/g)].map(m => m[1])

describe('ClipsView v3 dialogs', () => {
  it('compiles', () => {
    expect(errors).toEqual([])
    expect(() => compileScript(descriptor, { id: 'clips-view', inlineTemplate: true })).not.toThrow()
  })

  it('uses UfDialog for the player, analysis confirm, trim and upgrade modals', () => {
    const opens = dialogs.map(a => a.match(/:open="([^"]+)"/)?.[1])
    expect(opens).toEqual(expect.arrayContaining(['!!playingClip', '!!pendingClipAnalysis', 'trimModal.show', 'upgradeModal.show']))
    expect(dialogs.length).toBeGreaterThanOrEqual(4)
    for (const attrs of dialogs) expect(attrs).toMatch(/@close="/)
  })

  it('keeps the old modals for the old design', () => {
    expect(template).toMatch(/v-if="uiV3"/)
    expect(template).toContain('Teleport')
  })
})
