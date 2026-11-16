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

  it('hides the session, the single drills, the daily challenge and the drill groups without the aim trainer (League)', () => {
    const practice = read('src/views/v3/PracticeV3.vue')
    expect(practice).toMatch(/<section v-if="!aimTrainer" class="uf-noplan/)
    // The hero (the session and the one red action) only draws with the aim trainer.
    expect(practice).toMatch(/<div v-else-if="heroPending" class="uf-hero-wait"/)
    expect(practice).toMatch(/<PracticeHeroV3 v-else /)
    // Today's single drills, with the daily challenge tile among them.
    expect(practice).toMatch(/<section v-if="showTrainerDrills" class="uf-rise uf-d3s">\s*<div class="uf-section-head">\s*<span class="uf-label">Play one on its own<\/span>/)
    expect(practice).toMatch(/Daily challenge/)
    // The Drills tab keeps its groups behind the same link.
    expect(practice).toMatch(/<template v-if="showTrainerDrills">\s*<p v-if="scoringNote"/)
    expect(practice).toMatch(/Open the aim drill library anyway/)
  })
})
