import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// A trainer that stays open between runs (1.16.0 and later): a guided session runs its steps in one window.
// The decision itself is guidedResultStep (src/lib/structured-session.test.ts); this checks Practice uses it.
const hub = readFileSync(new URL('./TrainingHubView.vue', import.meta.url), 'utf8')
const resultHandler = hub.slice(hub.indexOf("window.api.on('trainer:session-result'"), hub.indexOf('// Fetch training history + coaching drills from API'))

describe('Practice: a guided session in one trainer window', () => {
  it('tells the trainer which drill comes after each step, so its end card can offer it (N)', () => {
    expect(hub).toMatch(/async function launchDrill\(drill: AssignedDrill, opts: \{ guidedStep\?: boolean; nextScenario\?: string \} = \{\}\)/)
    expect(hub).toMatch(/launchTrainer\(\{ \.\.\.assignedLaunchRequest\(drill\), \.\.\.\(opts\.nextScenario \? \{ next_scenario: opts\.nextScenario \} : \{\}\) \}\)/)
    expect(hub).toMatch(/\}, \{ guidedStep: true, nextScenario: guidedNextScenario\(structuredSession\.value\?\.plan, stepIndex\) \}\)/)
  })

  it('a step’s result: the countdown runs only when the trainer closed; an open trainer offers the next step itself', () => {
    expect(resultHandler).toMatch(/guidedResultStep\(\{[\s\S]*?launch: asLaunchInfo\(launch\),[\s\S]*?\}\)/)
    expect(resultHandler).toMatch(/if \(step === 'finish'\) finishStructuredSession\(\)/)
    expect(resultHandler).toMatch(/else if \(step === 'next_countdown'\) startSessionCountdown\(nextStep\)/)
    expect(resultHandler.match(/startSessionCountdown\(/g)).toHaveLength(1)
    // A run the trainer started again (R) never counts as a step.
    expect(resultHandler).toMatch(/if \(guided && step === 'other'\) \{/)
    // After the last step, R's extra run does not take Practice away from the session summary.
    expect(resultHandler).toMatch(/\} else if \(showSessionSummary\.value && asLaunchInfo\(launch\)\?\.repeat_of != null\) \{\s*\/\/[^\n]*\n\s*\} else \{\s*trainerResultStore\.setResult/)
  })

  it('N in the trainer opens the step that is waiting, through the normal launch', () => {
    expect(hub).toMatch(/window\.api\.on\('trainer:next-drill', \(raw: unknown\) => \{\s*if \(!asNextDrillRequest\(raw\) \|\| !structuredSessionWaiting\.value \|\| launching\.value\) return\s*void launchStructuredStep\(structuredSessionStepIndex\.value\)/)
  })

  it('R in the trainer after a result is a run in progress: no countdown fires and no second drill starts over it', () => {
    const handler = hub.slice(hub.indexOf("window.api.on('trainer:run-started'"), hub.indexOf("window.api.on('trainer:next-drill'"))
    expect(handler).toMatch(/clearSessionTimer\(\)/)
    expect(handler).toMatch(/activeLaunchId = info\.launchId/)
    expect(handler).toMatch(/drillRunning\.value = true/)
    // launchDrill refuses while a drill runs, so Start now cannot replace it.
    expect(hub).toMatch(/if \(launching\.value \|\| drillRunning\.value\) return/)
  })

  it('both listeners are registered with the view’s lifetime', () => {
    expect(hub).toMatch(/life\.own\(window\.api\.on\('trainer:run-started'/)
    expect(hub).toMatch(/life\.own\(window\.api\.on\('trainer:next-drill'/)
  })
})
