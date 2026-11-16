import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const read = (p: string) => readFileSync(resolve(__dirname, '../../../..', p), 'utf8')

// Drills know their game: Practice asks for the primary game's plan and drills, and League gets no trainer picks.
describe('Practice follows the primary game', () => {
  it('sends the game with the plan and drill requests', () => {
    const view = read('src/views/TrainingHubView.vue')
    expect(view).toMatch(/getPlan\(game\)/)
    expect(view).toMatch(/getCoachingDrills\(game\)/)
    expect(view).toMatch(/planForGame\(plan, game\)/)
    expect(view).toMatch(/drillsForGame\(/)
    const ipc = read('electron/main/ipc/gaming-ipc.ts')
    expect(ipc).toMatch(/get\('\/api\/training\/plan', drillGameParams\(game\)\)/)
    expect(ipc).toMatch(/get\('\/api\/drills', drillGameParams\(game\)\)/)
  })

  it('hides the session, drill library, daily challenge and quick play without the aim trainer (League)', () => {
    const practice = read('src/views/v3/PracticeV3.vue')
    expect(practice).toMatch(/<section v-if="!aimTrainer" class="uf-noplan/)
    expect(practice).toMatch(/<section v-else class="uf-session/)
    expect(practice).toMatch(/<section v-if="showTrainerDrills" class="uf-rise uf-d3s">\s*<div class="uf-library-head">/)
    expect(practice).toMatch(/<aside v-if="showTrainerDrills"/)
    expect(practice).toMatch(/Open the aim drill library anyway/)
  })
})
