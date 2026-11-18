import { readFileSync } from 'node:fs'
import { compileScript, compileTemplate, parse } from '@vue/compiler-sfc'
import { describe, expect, it } from 'vitest'
import { deadlockDrills } from './deadlock-drills'

// A finished replay review (GET /api/deadlock/demo/{jobId}): the coach writes its drills into coaching.drills,
// and the AI sets coaching.drills_checked once its claim guards have read them.
const detail = {
  hero: 'Haze',
  coaching: {
    priority_focus: 'Stay with your team after 20 minutes.',
    drills_checked: true,
    drills: [
      { title: 'Ability timing', description: 'Play 3 unranked games focusing on ability timing before you commit to a fight.', practice_mode: 'unranked', frequency: '3x per week', duration_minutes: 35 },
      { title: '  Last-orb practice ', description: ' Secure soul orbs in the sandbox for 15 minutes. ', practice_mode: 'custom_lobby', frequency: 'daily', duration_minutes: 15 },
      { title: 'Aim warm-up', description: 'Flick between targets before you queue.', practice_mode: 'aim_trainer' },
      { title: '', description: 'A drill without a name is left out.', frequency: 'daily' },
      null,
      { title: 'Mid Boss rotations', description: 'Rotate when the Mid Boss is up.', frequency: 'weekly', duration_minutes: 30 },
      { title: 'Fifth drill', description: 'Past the cap of four.', frequency: 'daily' },
    ],
  },
}

describe('deadlock review drills', () => {
  it('shows each drill with how often and what to do, at most four (as the CS2 review does)', () => {
    expect(deadlockDrills(detail)).toEqual([
      { title: 'Ability timing', description: 'Play 3 unranked games focusing on ability timing before you commit to a fight.', frequency: '3x per week' },
      { title: 'Last-orb practice', description: 'Secure soul orbs in the sandbox for 15 minutes.', frequency: 'daily' },
      { title: 'Aim warm-up', description: 'Flick between targets before you queue.', frequency: '' },
      { title: 'Mid Boss rotations', description: 'Rotate when the Mid Boss is up.', frequency: 'weekly' },
    ])
  })

  it('is empty when the review has no drills', () => {
    expect(deadlockDrills(null)).toEqual([])
    expect(deadlockDrills({ coaching: null })).toEqual([])
    expect(deadlockDrills({ coaching: { priority_focus: 'Farm.' } })).toEqual([])
    expect(deadlockDrills({ coaching: { drills: 'not a list' } })).toEqual([])
  })

  it('shows none from a review whose drills no claim check has read (stored before the AI marked them)', () => {
    const unchecked: Record<string, unknown> = { ...detail.coaching }
    delete unchecked.drills_checked
    expect(deadlockDrills({ ...detail, coaching: unchecked })).toEqual([])
    expect(deadlockDrills({ ...detail, coaching: { ...unchecked, drills_checked: false } })).toEqual([])
    expect(deadlockDrills({ ...detail, coaching: { ...unchecked, drills_checked: 'true' } })).toEqual([])
  })

  it('the replay review shows them in a Practice block', () => {
    const source = readFileSync(new URL('./DeadlockReviewContentV3.vue', import.meta.url), 'utf8')
    const { descriptor, errors } = parse(source)
    expect(errors).toEqual([])
    const script = compileScript(descriptor, { id: 'dlr' })
    const tpl = compileTemplate({ source: descriptor.template!.content, filename: 'DeadlockReviewContentV3.vue', id: 'dlr', compilerOptions: { bindingMetadata: script.bindings } })
    expect(tpl.errors).toEqual([])
    expect(descriptor.scriptSetup!.content).toMatch(/const drills = computed\(\(\) => deadlockDrills\(detail\.value\)\)/)
    const block = descriptor.template!.content.match(/<section v-if="drills\.length"[\s\S]*?<\/section>/)?.[0] ?? ''
    expect(block).toContain('<span class="uf-label">Practice</span>')
    expect(block).toMatch(/v-for="\(d, n\) in drills"/)
    expect(block).toContain('{{ d.title }}')
    expect(block).toContain('{{ d.frequency }}')
    expect(block).toContain('{{ d.description }}')
    // Nothing in place of unchecked drills: the only Practice text is inside that block.
    expect(descriptor.template!.content.split('Practice').length - 1).toBe(1)
  })
})
