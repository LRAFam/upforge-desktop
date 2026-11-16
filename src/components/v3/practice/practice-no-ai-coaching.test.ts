import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const read = (p: string) => readFileSync(resolve(__dirname, '../../../..', p), 'utf8')

// Practice used to ask the API for AI coaching on every visit and never show the answer.
describe('Practice makes no AI coaching request', () => {
  it('the Practice view does not fetch AI coaching', () => {
    const view = read('src/views/TrainingHubView.vue')
    expect(view).not.toMatch(/getAiCoaching/)
    expect(view).not.toMatch(/aiCoaching/)
  })

  it('the bridge no longer exposes the call', () => {
    expect(read('electron/preload/index.ts')).not.toMatch(/trainer:get-ai-coaching/)
    expect(read('electron/main/ipc/gaming-ipc.ts')).not.toMatch(/\/api\/training\/coaching/)
  })
})
